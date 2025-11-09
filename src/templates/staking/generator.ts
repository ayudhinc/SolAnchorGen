import { resolve } from 'path';
import {
  BaseTemplateGenerator,
  GeneratorContext,
  GeneratedFile,
  Dependencies,
} from '../generator.js';

/**
 * Staking Template Generator
 * Generates a token staking program with rewards distribution
 */
export class StakingGenerator extends BaseTemplateGenerator {
  async generate(context: GeneratorContext): Promise<GeneratedFile[]> {
    return [
      this.generateProgramCode(context),
      this.generateCargoToml(context),
      this.generateTests(context),
      this.generateSdk(context),
      this.generateReadme(context),
      this.generateTsConfig(context),
    ];
  }

  getDependencies(context: GeneratorContext): Dependencies {
    return {
      '@coral-xyz/anchor': '^0.29.0',
      '@solana/web3.js': '^1.87.0',
      '@solana/spl-token': '^0.3.9',
    };
  }

  /**
   * Generates the Rust program code
   */
  private generateProgramCode(context: GeneratorContext): GeneratedFile {
    const { projectName, projectPath, options } = context;
    const programName = projectName.replace(/-/g, '_');
    const decimals = options.tokenDecimals || 9;

    const content = `use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const TOKEN_DECIMALS: u8 = ${decimals};
const REWARD_RATE_PER_SECOND: u64 = 1; // Rewards per second per staked token

#[program]
pub mod ${programName} {
    use super::*;

    /// Initialize the staking pool
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        reward_rate: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        
        // Validate authority
        require!(
            ctx.accounts.authority.key() != Pubkey::default(),
            ErrorCode::InvalidAuthority
        );
        
        pool.authority = ctx.accounts.authority.key();
        pool.staking_mint = ctx.accounts.staking_mint.key();
        pool.reward_mint = ctx.accounts.reward_mint.key();
        pool.total_staked = 0;
        pool.reward_rate = reward_rate;
        pool.last_update_time = Clock::get()?.unix_timestamp;
        
        Ok(())
    }

    /// Stake tokens
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let pool = &mut ctx.accounts.pool;
        let user_stake = &mut ctx.accounts.user_stake;
        let clock = Clock::get()?;
        
        // Update rewards before changing stake
        if user_stake.amount > 0 {
            let pending_rewards = calculate_rewards(
                user_stake.amount,
                user_stake.last_stake_time,
                clock.unix_timestamp,
                pool.reward_rate,
            )?;
            user_stake.pending_rewards = user_stake.pending_rewards
                .checked_add(pending_rewards)
                .ok_or(ErrorCode::Overflow)?;
        }
        
        // Transfer tokens from user to pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.pool_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        
        // Update stake info
        user_stake.owner = ctx.accounts.user.key();
        user_stake.pool = pool.key();
        user_stake.amount = user_stake.amount
            .checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;
        user_stake.last_stake_time = clock.unix_timestamp;
        
        pool.total_staked = pool.total_staked
            .checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;
        
        emit!(StakeEvent {
            user: ctx.accounts.user.key(),
            amount,
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }

    /// Unstake tokens
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let pool = &mut ctx.accounts.pool;
        let user_stake = &mut ctx.accounts.user_stake;
        let clock = Clock::get()?;
        
        require!(
            user_stake.amount >= amount,
            ErrorCode::InsufficientStake
        );
        
        // Calculate and add pending rewards
        let pending_rewards = calculate_rewards(
            user_stake.amount,
            user_stake.last_stake_time,
            clock.unix_timestamp,
            pool.reward_rate,
        )?;
        user_stake.pending_rewards = user_stake.pending_rewards
            .checked_add(pending_rewards)
            .ok_or(ErrorCode::Overflow)?;
        
        // Transfer tokens from pool to user
        let seeds = &[
            b"pool",
            pool.staking_mint.as_ref(),
            &[ctx.bumps.pool],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: pool.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;
        
        // Update stake info
        user_stake.amount = user_stake.amount
            .checked_sub(amount)
            .ok_or(ErrorCode::Underflow)?;
        user_stake.last_stake_time = clock.unix_timestamp;
        
        pool.total_staked = pool.total_staked
            .checked_sub(amount)
            .ok_or(ErrorCode::Underflow)?;
        
        emit!(UnstakeEvent {
            user: ctx.accounts.user.key(),
            amount,
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }

    /// Claim rewards
    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let user_stake = &mut ctx.accounts.user_stake;
        let clock = Clock::get()?;
        
        // Calculate total rewards
        let pending_rewards = calculate_rewards(
            user_stake.amount,
            user_stake.last_stake_time,
            clock.unix_timestamp,
            pool.reward_rate,
        )?;
        
        let total_rewards = user_stake.pending_rewards
            .checked_add(pending_rewards)
            .ok_or(ErrorCode::Overflow)?;
        
        require!(total_rewards > 0, ErrorCode::NoRewards);
        
        // Transfer rewards from pool to user
        let seeds = &[
            b"pool",
            pool.staking_mint.as_ref(),
            &[ctx.bumps.pool],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.reward_token_account.to_account_info(),
            to: ctx.accounts.user_reward_account.to_account_info(),
            authority: pool.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, total_rewards)?;
        
        // Reset rewards
        user_stake.pending_rewards = 0;
        user_stake.last_stake_time = clock.unix_timestamp;
        
        emit!(ClaimRewardsEvent {
            user: ctx.accounts.user.key(),
            amount: total_rewards,
            timestamp: clock.unix_timestamp,
        });
        
        Ok(())
    }
}

/// Calculate rewards based on staked amount and time
fn calculate_rewards(
    staked_amount: u64,
    last_stake_time: i64,
    current_time: i64,
    reward_rate: u64,
) -> Result<u64> {
    let time_elapsed = current_time
        .checked_sub(last_stake_time)
        .ok_or(ErrorCode::InvalidTimestamp)? as u64;
    
    let rewards = staked_amount
        .checked_mul(reward_rate)
        .ok_or(ErrorCode::Overflow)?
        .checked_mul(time_elapsed)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(10u64.pow(TOKEN_DECIMALS as u32))
        .ok_or(ErrorCode::DivisionByZero)?;
    
    Ok(rewards)
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", staking_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    pub staking_mint: Account<'info, Mint>,
    pub reward_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.staking_mint.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserStake::INIT_SPACE,
        seeds = [b"user_stake", pool.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_stake: Account<'info, UserStake>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub pool_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.staking_mint.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        mut,
        seeds = [b"user_stake", pool.key().as_ref(), user.key().as_ref()],
        bump,
        has_one = owner @ ErrorCode::Unauthorized
    )]
    pub user_stake: Account<'info, UserStake>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub pool_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: This is validated in user_stake
    pub owner: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(
        seeds = [b"pool", pool.staking_mint.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        mut,
        seeds = [b"user_stake", pool.key().as_ref(), user.key().as_ref()],
        bump,
        has_one = owner @ ErrorCode::Unauthorized
    )]
    pub user_stake: Account<'info, UserStake>,
    
    #[account(mut)]
    pub reward_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_reward_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: This is validated in user_stake
    pub owner: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    pub staking_mint: Pubkey,
    pub reward_mint: Pubkey,
    pub total_staked: u64,
    pub reward_rate: u64,
    pub last_update_time: i64,
}

#[account]
#[derive(InitSpace)]
pub struct UserStake {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub pending_rewards: u64,
    pub last_stake_time: i64,
}

#[event]
pub struct StakeEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct UnstakeEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ClaimRewardsEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient stake")]
    InsufficientStake,
    #[msg("No rewards to claim")]
    NoRewards,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Arithmetic underflow")]
    Underflow,
    #[msg("Invalid timestamp")]
    InvalidTimestamp,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Unauthorized")]
    Unauthorized,
}
`;

    const path = resolve(
      projectPath,
      'programs',
      projectName,
      'src',
      'lib.rs'
    );
    return this.createFile(path, content);
  }

  /**
   * Generates Cargo.toml
   */
  private generateCargoToml(context: GeneratorContext): GeneratedFile {
    const { projectName, projectPath } = context;
    const programName = projectName.replace(/-/g, '_');

    const content = `[package]
name = "${programName}"
version = "0.1.0"
description = "Token staking program generated with SolAnchorGen"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${programName}"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.29.0"
anchor-spl = "0.29.0"
`;

    const path = resolve(projectPath, 'programs', projectName, 'Cargo.toml');
    return this.createFile(path, content);
  }

  /**
   * Generates TypeScript tests
   */
  private generateTests(context: GeneratorContext): GeneratedFile {
    const { projectName, projectPath, options } = context;
    const programName = projectName.replace(/-/g, '_');
    const decimals = options.tokenDecimals || 9;

    const content = `import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ${this.toPascalCase(programName)} } from "../target/types/${programName}";
import { expect } from "chai";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

describe("${projectName}", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.${this.toPascalCase(programName)} as Program<${this.toPascalCase(programName)}>;

  let stakingMint: anchor.web3.PublicKey;
  let rewardMint: anchor.web3.PublicKey;
  let poolPda: anchor.web3.PublicKey;

  before(async () => {
    // Create staking token mint
    stakingMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      ${decimals}
    );

    // Create reward token mint
    rewardMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      ${decimals}
    );

    // Derive pool PDA
    [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), stakingMint.toBuffer()],
      program.programId
    );
  });

  it("Initializes staking pool", async () => {
    await program.methods
      .initializePool(new anchor.BN(1))
      .accounts({
        pool: poolPda,
        stakingMint,
        rewardMint,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const pool = await program.account.pool.fetch(poolPda);
    expect(pool.totalStaked.toNumber()).to.equal(0);
    expect(pool.rewardRate.toNumber()).to.equal(1);
  });

  it("Stakes tokens", async () => {
    const stakeAmount = 1000 * 10 ** ${decimals};

    // Create user token account and mint tokens
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      stakingMint,
      provider.wallet.publicKey
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer,
      stakingMint,
      userTokenAccount.address,
      provider.wallet.publicKey,
      stakeAmount
    );

    // Create pool token account
    const poolTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      stakingMint,
      poolPda,
      true
    );

    // Derive user stake PDA
    const [userStakePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_stake"),
        poolPda.toBuffer(),
        provider.wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .stake(new anchor.BN(stakeAmount))
      .accounts({
        pool: poolPda,
        userStake: userStakePda,
        userTokenAccount: userTokenAccount.address,
        poolTokenAccount: poolTokenAccount.address,
        user: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const userStake = await program.account.userStake.fetch(userStakePda);
    expect(userStake.amount.toNumber()).to.equal(stakeAmount);
  });
});
`;

    const path = resolve(projectPath, 'tests', `${projectName}.ts`);
    return this.createFile(path, content);
  }

  /**
   * Generates TypeScript SDK
   */
  private generateSdk(context: GeneratorContext): GeneratedFile {
    const { projectName, projectPath } = context;

    const content = `import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

/**
 * Staking SDK
 * Client library for interacting with the staking program
 */
export class StakingClient {
  constructor(
    private program: Program,
    private provider: anchor.AnchorProvider
  ) {}

  /**
   * Initialize a staking pool
   */
  async initializePool(
    stakingMint: anchor.web3.PublicKey,
    rewardMint: anchor.web3.PublicKey,
    rewardRate: number
  ): Promise<anchor.web3.PublicKey> {
    const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), stakingMint.toBuffer()],
      this.program.programId
    );

    await this.program.methods
      .initializePool(new anchor.BN(rewardRate))
      .accounts({
        pool: poolPda,
        stakingMint,
        rewardMint,
        authority: this.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return poolPda;
  }

  /**
   * Stake tokens
   */
  async stake(
    poolAddress: anchor.web3.PublicKey,
    amount: number
  ): Promise<void> {
    const [userStakePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_stake"),
        poolAddress.toBuffer(),
        this.provider.wallet.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    await this.program.methods
      .stake(new anchor.BN(amount))
      .accounts({
        pool: poolAddress,
        userStake: userStakePda,
        user: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  /**
   * Unstake tokens
   */
  async unstake(
    poolAddress: anchor.web3.PublicKey,
    amount: number
  ): Promise<void> {
    const [userStakePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_stake"),
        poolAddress.toBuffer(),
        this.provider.wallet.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    await this.program.methods
      .unstake(new anchor.BN(amount))
      .accounts({
        pool: poolAddress,
        userStake: userStakePda,
        user: this.provider.wallet.publicKey,
        owner: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  /**
   * Claim rewards
   */
  async claimRewards(poolAddress: anchor.web3.PublicKey): Promise<void> {
    const [userStakePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_stake"),
        poolAddress.toBuffer(),
        this.provider.wallet.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    await this.program.methods
      .claimRewards()
      .accounts({
        pool: poolAddress,
        userStake: userStakePda,
        user: this.provider.wallet.publicKey,
        owner: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  /**
   * Get pool data
   */
  async getPool(address: anchor.web3.PublicKey) {
    return await this.program.account.pool.fetch(address);
  }

  /**
   * Get user stake data
   */
  async getUserStake(
    poolAddress: anchor.web3.PublicKey,
    userAddress: anchor.web3.PublicKey
  ) {
    const [userStakePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_stake"),
        poolAddress.toBuffer(),
        userAddress.toBuffer(),
      ],
      this.program.programId
    );

    return await this.program.account.userStake.fetch(userStakePda);
  }
}
`;

    const path = resolve(projectPath, 'app', 'src', 'index.ts');
    return this.createFile(path, content);
  }

  /**
   * Generates README
   */
  private generateReadme(context: GeneratorContext): GeneratedFile {
    const { projectName, projectPath, options } = context;
    const decimals = options.tokenDecimals || 9;

    const content = `# ${projectName}

Token staking program with rewards distribution, generated with SolAnchorGen.

## Configuration

- Token Decimals: ${decimals}
- Reward Rate: Configurable per pool

## Features

- Initialize staking pools with custom reward rates
- Stake tokens to earn rewards
- Unstake tokens at any time
- Claim accumulated rewards
- Time-based reward calculation
- Built-in security checks and validations

## Getting Started

### Prerequisites

- Rust 1.70+
- Solana CLI 1.16+
- Anchor 0.29+
- Node.js 18+

### Build

\`\`\`bash
anchor build
\`\`\`

### Test

\`\`\`bash
anchor test
\`\`\`

### Deploy

\`\`\`bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet
anchor deploy --provider.cluster mainnet
\`\`\`

## Program Structure

### Instructions

#### \`initialize_pool\`
Creates a new staking pool.

**Parameters:**
- \`reward_rate\`: Rewards per second per staked token

#### \`stake\`
Stakes tokens into the pool.

**Parameters:**
- \`amount\`: Amount of tokens to stake

#### \`unstake\`
Unstakes tokens from the pool.

**Parameters:**
- \`amount\`: Amount of tokens to unstake

#### \`claim_rewards\`
Claims accumulated rewards.

### Security Features

- ✅ Authority validation
- ✅ Ownership checks
- ✅ Overflow/underflow protection
- ✅ Signer verification
- ✅ PDA validation
- ✅ Time-based calculations

## Usage Example

\`\`\`typescript
import { StakingClient } from './app/src';

// Initialize pool
const poolAddress = await client.initializePool(
  stakingMintAddress,
  rewardMintAddress,
  1 // reward rate
);

// Stake tokens
await client.stake(poolAddress, 1000);

// Claim rewards
await client.claimRewards(poolAddress);

// Unstake tokens
await client.unstake(poolAddress, 500);
\`\`\`

## Reward Calculation

Rewards are calculated based on:
- Amount staked
- Time elapsed since last stake/claim
- Configured reward rate

Formula: \`rewards = (staked_amount * reward_rate * time_elapsed) / 10^decimals\`

## License

MIT
`;

    const path = resolve(projectPath, 'README.md');
    return this.createFile(path, content);
  }

  /**
   * Generates tsconfig.json
   */
  private generateTsConfig(context: GeneratorContext): GeneratedFile {
    const { projectPath } = context;

    const content = `{
  "compilerOptions": {
    "types": ["mocha", "chai"],
    "typeRoots": ["./node_modules/@types"],
    "lib": ["es2015"],
    "module": "commonjs",
    "target": "es6",
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
`;

    const path = resolve(projectPath, 'tsconfig.json');
    return this.createFile(path, content);
  }

  /**
   * Helper to convert snake_case to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
}
