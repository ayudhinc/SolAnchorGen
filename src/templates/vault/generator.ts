import { resolve } from 'path';
import {
  BaseTemplateGenerator,
  GeneratorContext,
  GeneratedFile,
  Dependencies,
} from '../generator.js';

/**
 * Vault Template Generator
 * Generates a secure token custody vault with multi-sig support
 */
export class VaultGenerator extends BaseTemplateGenerator {
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
    const { projectName, projectPath } = context;
    const programName = projectName.replace(/-/g, '_');

    const content = `use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const MAX_GUARDIANS: usize = 10;

#[program]
pub mod ${programName} {
    use super::*;

    /// Initialize a vault
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        guardians: Vec<Pubkey>,
        threshold: u8,
    ) -> Result<()> {
        require!(guardians.len() > 0, ErrorCode::NoGuardians);
        require!(guardians.len() <= MAX_GUARDIANS, ErrorCode::TooManyGuardians);
        require!(
            threshold > 0 && threshold as usize <= guardians.len(),
            ErrorCode::InvalidThreshold
        );
        
        let vault = &mut ctx.accounts.vault;
        
        vault.owner = ctx.accounts.owner.key();
        vault.token_mint = ctx.accounts.token_mint.key();
        vault.guardians = guardians;
        vault.threshold = threshold;
        vault.total_deposited = 0;
        vault.total_withdrawn = 0;
        vault.withdrawal_count = 0;
        vault.bump = ctx.bumps.vault;
        
        Ok(())
    }

    /// Deposit tokens into the vault
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let vault = &mut ctx.accounts.vault;
        
        // Transfer tokens from depositor to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.depositor_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        
        vault.total_deposited = vault.total_deposited
            .checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;
        
        emit!(DepositEvent {
            vault: vault.key(),
            depositor: ctx.accounts.depositor.key(),
            amount,
        });
        
        Ok(())
    }

    /// Propose a withdrawal
    pub fn propose_withdrawal(
        ctx: Context<ProposeWithdrawal>,
        amount: u64,
        recipient: Pubkey,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let vault = &ctx.accounts.vault;
        let proposal = &mut ctx.accounts.proposal;
        
        // Verify proposer is a guardian
        require!(
            vault.guardians.contains(&ctx.accounts.proposer.key()),
            ErrorCode::NotAGuardian
        );
        
        // Verify vault has sufficient balance
        require!(
            ctx.accounts.vault_token_account.amount >= amount,
            ErrorCode::InsufficientBalance
        );
        
        proposal.vault = vault.key();
        proposal.recipient = recipient;
        proposal.amount = amount;
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.approvals = vec![ctx.accounts.proposer.key()];
        proposal.executed = false;
        proposal.cancelled = false;
        proposal.proposal_id = vault.withdrawal_count;
        
        emit!(WithdrawalProposedEvent {
            proposal: proposal.key(),
            vault: vault.key(),
            amount,
            recipient,
        });
        
        Ok(())
    }

    /// Approve a withdrawal proposal
    pub fn approve_withdrawal(ctx: Context<ApproveWithdrawal>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let proposal = &mut ctx.accounts.proposal;
        
        require!(!proposal.executed, ErrorCode::ProposalExecuted);
        require!(!proposal.cancelled, ErrorCode::ProposalCancelled);
        
        // Verify approver is a guardian
        require!(
            vault.guardians.contains(&ctx.accounts.guardian.key()),
            ErrorCode::NotAGuardian
        );
        
        // Verify guardian hasn't already approved
        require!(
            !proposal.approvals.contains(&ctx.accounts.guardian.key()),
            ErrorCode::AlreadyApproved
        );
        
        proposal.approvals.push(ctx.accounts.guardian.key());
        
        emit!(WithdrawalApprovedEvent {
            proposal: proposal.key(),
            guardian: ctx.accounts.guardian.key(),
            approvals: proposal.approvals.len() as u8,
        });
        
        Ok(())
    }

    /// Execute an approved withdrawal
    pub fn execute_withdrawal(ctx: Context<ExecuteWithdrawal>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let proposal = &mut ctx.accounts.proposal;
        
        require!(!proposal.executed, ErrorCode::ProposalExecuted);
        require!(!proposal.cancelled, ErrorCode::ProposalCancelled);
        
        // Verify threshold is met
        require!(
            proposal.approvals.len() as u8 >= vault.threshold,
            ErrorCode::ThresholdNotMet
        );
        
        // Transfer tokens from vault to recipient
        let seeds = &[
            b"vault",
            vault.token_mint.as_ref(),
            vault.owner.as_ref(),
            &[vault.bump],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, proposal.amount)?;
        
        proposal.executed = true;
        
        vault.total_withdrawn = vault.total_withdrawn
            .checked_add(proposal.amount)
            .ok_or(ErrorCode::Overflow)?;
        
        vault.withdrawal_count = vault.withdrawal_count
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        
        emit!(WithdrawalExecutedEvent {
            proposal: proposal.key(),
            vault: vault.key(),
            amount: proposal.amount,
            recipient: proposal.recipient,
        });
        
        Ok(())
    }

    /// Cancel a withdrawal proposal
    pub fn cancel_withdrawal(ctx: Context<CancelWithdrawal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        
        require!(!proposal.executed, ErrorCode::ProposalExecuted);
        require!(!proposal.cancelled, ErrorCode::ProposalCancelled);
        
        proposal.cancelled = true;
        
        emit!(WithdrawalCancelledEvent {
            proposal: proposal.key(),
            proposer: ctx.accounts.proposer.key(),
        });
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", token_mint.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    
    #[account(
        mut,
        constraint = depositor_token_account.mint == vault.token_mint @ ErrorCode::InvalidMint,
        constraint = depositor_token_account.owner == depositor.key() @ ErrorCode::InvalidOwner
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = vault_token_account.mint == vault.token_mint @ ErrorCode::InvalidMint
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub depositor: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ProposeWithdrawal<'info> {
    pub vault: Account<'info, Vault>,
    
    #[account(
        init,
        payer = proposer,
        space = 8 + WithdrawalProposal::INIT_SPACE,
        seeds = [b"proposal", vault.key().as_ref(), &vault.withdrawal_count.to_le_bytes()],
        bump
    )]
    pub proposal: Account<'info, WithdrawalProposal>,
    
    #[account(
        constraint = vault_token_account.mint == vault.token_mint @ ErrorCode::InvalidMint
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub proposer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveWithdrawal<'info> {
    pub vault: Account<'info, Vault>,
    
    #[account(
        mut,
        has_one = vault @ ErrorCode::InvalidVault
    )]
    pub proposal: Account<'info, WithdrawalProposal>,
    
    pub guardian: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteWithdrawal<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    
    #[account(
        mut,
        has_one = vault @ ErrorCode::InvalidVault
    )]
    pub proposal: Account<'info, WithdrawalProposal>,
    
    #[account(
        mut,
        constraint = vault_token_account.mint == vault.token_mint @ ErrorCode::InvalidMint
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = recipient_token_account.mint == vault.token_mint @ ErrorCode::InvalidMint,
        constraint = recipient_token_account.owner == proposal.recipient @ ErrorCode::InvalidRecipient
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    
    pub executor: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelWithdrawal<'info> {
    #[account(
        mut,
        has_one = proposer @ ErrorCode::Unauthorized
    )]
    pub proposal: Account<'info, WithdrawalProposal>,
    
    pub proposer: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owner: Pubkey,
    pub token_mint: Pubkey,
    #[max_len(MAX_GUARDIANS)]
    pub guardians: Vec<Pubkey>,
    pub threshold: u8,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub withdrawal_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct WithdrawalProposal {
    pub vault: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub proposer: Pubkey,
    #[max_len(MAX_GUARDIANS)]
    pub approvals: Vec<Pubkey>,
    pub executed: bool,
    pub cancelled: bool,
    pub proposal_id: u64,
}

#[event]
pub struct DepositEvent {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct WithdrawalProposedEvent {
    pub proposal: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub recipient: Pubkey,
}

#[event]
pub struct WithdrawalApprovedEvent {
    pub proposal: Pubkey,
    pub guardian: Pubkey,
    pub approvals: u8,
}

#[event]
pub struct WithdrawalExecutedEvent {
    pub proposal: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub recipient: Pubkey,
}

#[event]
pub struct WithdrawalCancelledEvent {
    pub proposal: Pubkey,
    pub proposer: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("No guardians provided")]
    NoGuardians,
    #[msg("Too many guardians (max 10)")]
    TooManyGuardians,
    #[msg("Invalid threshold")]
    InvalidThreshold,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Not a guardian")]
    NotAGuardian,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Proposal already executed")]
    ProposalExecuted,
    #[msg("Proposal cancelled")]
    ProposalCancelled,
    #[msg("Already approved")]
    AlreadyApproved,
    #[msg("Threshold not met")]
    ThresholdNotMet,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Invalid vault")]
    InvalidVault,
    #[msg("Invalid recipient")]
    InvalidRecipient,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    Overflow,
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
description = "Vault program generated with SolAnchorGen"
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
    const { projectName, projectPath } = context;
    const programName = projectName.replace(/-/g, '_');

    const content = `import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ${this.toPascalCase(programName)} } from "../target/types/${programName}";
import { expect } from "chai";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

describe("${projectName}", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.${this.toPascalCase(programName)} as Program<${this.toPascalCase(programName)}>;

  let tokenMint: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let vaultTokenAccount: any;

  const guardian1 = anchor.web3.Keypair.generate();
  const guardian2 = anchor.web3.Keypair.generate();
  const guardians = [guardian1.publicKey, guardian2.publicKey];

  before(async () => {
    // Create token mint
    tokenMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9
    );

    // Derive vault PDA
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        tokenMint.toBuffer(),
        provider.wallet.publicKey.toBuffer(),
      ],
      program.programId
    );
  });

  it("Initializes vault", async () => {
    await program.methods
      .initializeVault(guardians, 2) // 2-of-2 multisig
      .accounts({
        vault: vaultPda,
        tokenMint,
        owner: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.threshold).to.equal(2);
    expect(vault.guardians.length).to.equal(2);
  });

  it("Deposits tokens", async () => {
    // Create depositor token account
    const depositorTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      tokenMint,
      provider.wallet.publicKey
    );

    // Mint tokens to depositor
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      tokenMint,
      depositorTokenAccount.address,
      provider.wallet.publicKey,
      1000
    );

    // Create vault token account
    vaultTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      tokenMint,
      vaultPda,
      true
    );

    await program.methods
      .deposit(new anchor.BN(500))
      .accounts({
        vault: vaultPda,
        depositorTokenAccount: depositorTokenAccount.address,
        vaultTokenAccount: vaultTokenAccount.address,
        depositor: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.totalDeposited.toNumber()).to.equal(500);
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
 * Vault SDK
 * Client library for interacting with the vault program
 */
export class VaultClient {
  constructor(
    private program: Program,
    private provider: anchor.AnchorProvider
  ) {}

  /**
   * Initialize a vault
   */
  async initializeVault(
    tokenMint: anchor.web3.PublicKey,
    guardians: anchor.web3.PublicKey[],
    threshold: number
  ): Promise<anchor.web3.PublicKey> {
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        tokenMint.toBuffer(),
        this.provider.wallet.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    await this.program.methods
      .initializeVault(guardians, threshold)
      .accounts({
        vault: vaultPda,
        tokenMint,
        owner: this.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return vaultPda;
  }

  /**
   * Deposit tokens
   */
  async deposit(
    vaultAddress: anchor.web3.PublicKey,
    amount: number,
    depositorTokenAccount: anchor.web3.PublicKey,
    vaultTokenAccount: anchor.web3.PublicKey
  ): Promise<void> {
    await this.program.methods
      .deposit(new anchor.BN(amount))
      .accounts({
        vault: vaultAddress,
        depositorTokenAccount,
        vaultTokenAccount,
        depositor: this.provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Propose a withdrawal
   */
  async proposeWithdrawal(
    vaultAddress: anchor.web3.PublicKey,
    amount: number,
    recipient: anchor.web3.PublicKey,
    vaultTokenAccount: anchor.web3.PublicKey
  ): Promise<anchor.web3.PublicKey> {
    const vault = await this.program.account.vault.fetch(vaultAddress);
    
    const [proposalPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        vaultAddress.toBuffer(),
        Buffer.from(vault.withdrawalCount.toArrayLike(Buffer, "le", 8)),
      ],
      this.program.programId
    );

    await this.program.methods
      .proposeWithdrawal(new anchor.BN(amount), recipient)
      .accounts({
        vault: vaultAddress,
        proposal: proposalPda,
        vaultTokenAccount,
        proposer: this.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return proposalPda;
  }

  /**
   * Approve a withdrawal
   */
  async approveWithdrawal(
    vaultAddress: anchor.web3.PublicKey,
    proposalAddress: anchor.web3.PublicKey
  ): Promise<void> {
    await this.program.methods
      .approveWithdrawal()
      .accounts({
        vault: vaultAddress,
        proposal: proposalAddress,
        guardian: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  /**
   * Execute a withdrawal
   */
  async executeWithdrawal(
    vaultAddress: anchor.web3.PublicKey,
    proposalAddress: anchor.web3.PublicKey,
    vaultTokenAccount: anchor.web3.PublicKey,
    recipientTokenAccount: anchor.web3.PublicKey
  ): Promise<void> {
    await this.program.methods
      .executeWithdrawal()
      .accounts({
        vault: vaultAddress,
        proposal: proposalAddress,
        vaultTokenAccount,
        recipientTokenAccount,
        executor: this.provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Cancel a withdrawal
   */
  async cancelWithdrawal(proposalAddress: anchor.web3.PublicKey): Promise<void> {
    await this.program.methods
      .cancelWithdrawal()
      .accounts({
        proposal: proposalAddress,
        proposer: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  /**
   * Get vault data
   */
  async getVault(address: anchor.web3.PublicKey) {
    return await this.program.account.vault.fetch(address);
  }

  /**
   * Get proposal data
   */
  async getProposal(address: anchor.web3.PublicKey) {
    return await this.program.account.withdrawalProposal.fetch(address);
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
    const { projectName, projectPath } = context;

    const content = `# ${projectName}

Secure token custody vault with multi-sig support, generated with SolAnchorGen.

## Features

- Multi-signature authorization for withdrawals
- Configurable guardian threshold (M-of-N)
- Secure token deposits
- Withdrawal proposal system
- Guardian approval tracking
- Balance tracking

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

#### \`initialize_vault\`
Creates a new vault with guardians and threshold.

**Parameters:**
- \`guardians\`: List of guardian public keys (max 10)
- \`threshold\`: Number of approvals required (1-N)

#### \`deposit\`
Deposits tokens into the vault.

**Parameters:**
- \`amount\`: Amount of tokens to deposit

#### \`propose_withdrawal\`
Proposes a withdrawal (must be a guardian).

**Parameters:**
- \`amount\`: Amount to withdraw
- \`recipient\`: Recipient public key

#### \`approve_withdrawal\`
Approves a withdrawal proposal (must be a guardian).

#### \`execute_withdrawal\`
Executes an approved withdrawal (threshold met).

#### \`cancel_withdrawal\`
Cancels a withdrawal proposal (only by proposer).

### Security Features

- ✅ Multi-signature authorization
- ✅ Guardian validation
- ✅ Threshold enforcement
- ✅ Double-approval prevention
- ✅ Balance validation
- ✅ PDA-based vault
- ✅ Ownership checks

## Usage Example

\`\`\`typescript
import { VaultClient } from './app/src';

// Initialize vault with 2-of-3 multisig
const vaultAddress = await client.initializeVault(
  tokenMintAddress,
  [guardian1, guardian2, guardian3],
  2 // threshold
);

// Deposit tokens
await client.deposit(
  vaultAddress,
  1000,
  depositorTokenAccount,
  vaultTokenAccount
);

// Propose withdrawal
const proposalAddress = await client.proposeWithdrawal(
  vaultAddress,
  500,
  recipientAddress,
  vaultTokenAccount
);

// Approve withdrawal (by guardians)
await client.approveWithdrawal(vaultAddress, proposalAddress);

// Execute withdrawal (after threshold met)
await client.executeWithdrawal(
  vaultAddress,
  proposalAddress,
  vaultTokenAccount,
  recipientTokenAccount
);
\`\`\`

## Multi-Sig Configuration

- **Guardians**: 1-10 authorized signers
- **Threshold**: M-of-N approval required
- **Examples**:
  - 1-of-1: Single signer
  - 2-of-3: Two out of three guardians
  - 3-of-5: Three out of five guardians

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
