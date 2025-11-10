import { resolve } from 'path';
import {
  BaseTemplateGenerator,
  GeneratorContext,
  GeneratedFile,
  Dependencies,
} from '../generator.js';

/**
 * Escrow Template Generator
 * Generates a secure peer-to-peer token swap program
 */
export class EscrowGenerator extends BaseTemplateGenerator {
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
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod ${programName} {
    use super::*;

    /// Initialize an escrow
    pub fn initialize(
        ctx: Context<Initialize>,
        send_amount: u64,
        receive_amount: u64,
    ) -> Result<()> {
        require!(send_amount > 0, ErrorCode::InvalidAmount);
        require!(receive_amount > 0, ErrorCode::InvalidAmount);
        
        let escrow = &mut ctx.accounts.escrow;
        
        escrow.initializer = ctx.accounts.initializer.key();
        escrow.initializer_send_token_account = ctx.accounts.initializer_send_token_account.key();
        escrow.initializer_receive_token_account = ctx.accounts.initializer_receive_token_account.key();
        escrow.send_mint = ctx.accounts.send_mint.key();
        escrow.receive_mint = ctx.accounts.receive_mint.key();
        escrow.send_amount = send_amount;
        escrow.receive_amount = receive_amount;
        escrow.bump = ctx.bumps.escrow;
        
        // Transfer tokens from initializer to escrow vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.initializer_send_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.initializer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, send_amount)?;
        
        emit!(EscrowInitializedEvent {
            escrow: escrow.key(),
            initializer: ctx.accounts.initializer.key(),
            send_amount,
            receive_amount,
        });
        
        Ok(())
    }

    /// Exchange tokens (complete the escrow)
    pub fn exchange(ctx: Context<Exchange>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        
        // Validate the taker is providing the correct amount
        require!(
            ctx.accounts.taker_send_token_account.amount >= escrow.receive_amount,
            ErrorCode::InsufficientFunds
        );
        
        // Transfer tokens from taker to initializer
        let cpi_accounts = Transfer {
            from: ctx.accounts.taker_send_token_account.to_account_info(),
            to: ctx.accounts.initializer_receive_token_account.to_account_info(),
            authority: ctx.accounts.taker.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, escrow.receive_amount)?;
        
        // Transfer tokens from vault to taker
        let seeds = &[
            b"escrow",
            escrow.initializer.as_ref(),
            escrow.send_mint.as_ref(),
            &[escrow.bump],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.taker_receive_token_account.to_account_info(),
            authority: escrow.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, escrow.send_amount)?;
        
        // Close the vault account
        let cpi_accounts = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.initializer.to_account_info(),
            authority: escrow.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::close_account(cpi_ctx)?;
        
        emit!(EscrowCompletedEvent {
            escrow: escrow.key(),
            initializer: escrow.initializer,
            taker: ctx.accounts.taker.key(),
        });
        
        Ok(())
    }

    /// Cancel the escrow and return tokens to initializer
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        
        // Transfer tokens from vault back to initializer
        let seeds = &[
            b"escrow",
            escrow.initializer.as_ref(),
            escrow.send_mint.as_ref(),
            &[escrow.bump],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.initializer_send_token_account.to_account_info(),
            authority: escrow.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, escrow.send_amount)?;
        
        // Close the vault account
        let cpi_accounts = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.initializer.to_account_info(),
            authority: escrow.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::close_account(cpi_ctx)?;
        
        emit!(EscrowCancelledEvent {
            escrow: escrow.key(),
            initializer: escrow.initializer,
        });
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = initializer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", initializer.key().as_ref(), send_mint.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    
    #[account(mut)]
    pub initializer: Signer<'info>,
    
    pub send_mint: Account<'info, Mint>,
    pub receive_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        constraint = initializer_send_token_account.owner == initializer.key() @ ErrorCode::InvalidOwner,
        constraint = initializer_send_token_account.mint == send_mint.key() @ ErrorCode::InvalidMint
    )]
    pub initializer_send_token_account: Account<'info, TokenAccount>,
    
    #[account(
        constraint = initializer_receive_token_account.owner == initializer.key() @ ErrorCode::InvalidOwner,
        constraint = initializer_receive_token_account.mint == receive_mint.key() @ ErrorCode::InvalidMint
    )]
    pub initializer_receive_token_account: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = initializer,
        token::mint = send_mint,
        token::authority = escrow,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Exchange<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.initializer.as_ref(), escrow.send_mint.as_ref()],
        bump = escrow.bump,
        close = initializer
    )]
    pub escrow: Account<'info, Escrow>,
    
    #[account(mut)]
    pub taker: Signer<'info>,
    
    #[account(
        mut,
        constraint = taker_send_token_account.owner == taker.key() @ ErrorCode::InvalidOwner,
        constraint = taker_send_token_account.mint == escrow.receive_mint @ ErrorCode::InvalidMint
    )]
    pub taker_send_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = taker_receive_token_account.owner == taker.key() @ ErrorCode::InvalidOwner,
        constraint = taker_receive_token_account.mint == escrow.send_mint @ ErrorCode::InvalidMint
    )]
    pub taker_receive_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = initializer_receive_token_account.key() == escrow.initializer_receive_token_account @ ErrorCode::InvalidAccount
    )]
    pub initializer_receive_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This is the initializer who will receive rent
    #[account(
        mut,
        constraint = initializer.key() == escrow.initializer @ ErrorCode::InvalidInitializer
    )]
    pub initializer: AccountInfo<'info>,
    
    #[account(
        mut,
        constraint = vault.mint == escrow.send_mint @ ErrorCode::InvalidMint
    )]
    pub vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.initializer.as_ref(), escrow.send_mint.as_ref()],
        bump = escrow.bump,
        has_one = initializer @ ErrorCode::Unauthorized,
        close = initializer
    )]
    pub escrow: Account<'info, Escrow>,
    
    #[account(mut)]
    pub initializer: Signer<'info>,
    
    #[account(
        mut,
        constraint = initializer_send_token_account.key() == escrow.initializer_send_token_account @ ErrorCode::InvalidAccount
    )]
    pub initializer_send_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = vault.mint == escrow.send_mint @ ErrorCode::InvalidMint
    )]
    pub vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub initializer: Pubkey,
    pub initializer_send_token_account: Pubkey,
    pub initializer_receive_token_account: Pubkey,
    pub send_mint: Pubkey,
    pub receive_mint: Pubkey,
    pub send_amount: u64,
    pub receive_amount: u64,
    pub bump: u8,
}

#[event]
pub struct EscrowInitializedEvent {
    pub escrow: Pubkey,
    pub initializer: Pubkey,
    pub send_amount: u64,
    pub receive_amount: u64,
}

#[event]
pub struct EscrowCompletedEvent {
    pub escrow: Pubkey,
    pub initializer: Pubkey,
    pub taker: Pubkey,
}

#[event]
pub struct EscrowCancelledEvent {
    pub escrow: Pubkey,
    pub initializer: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid account")]
    InvalidAccount,
    #[msg("Invalid initializer")]
    InvalidInitializer,
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
description = "Escrow program generated with SolAnchorGen"
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

  let sendMint: anchor.web3.PublicKey;
  let receiveMint: anchor.web3.PublicKey;
  let initializerSendAccount: any;
  let initializerReceiveAccount: any;
  let takerSendAccount: any;
  let takerReceiveAccount: any;
  let escrowPda: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;

  const taker = anchor.web3.Keypair.generate();
  const sendAmount = 1000;
  const receiveAmount = 500;

  before(async () => {
    // Airdrop to taker
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(taker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );

    // Create mints
    sendMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9
    );

    receiveMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9
    );

    // Create token accounts
    initializerSendAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      sendMint,
      provider.wallet.publicKey
    );

    initializerReceiveAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      receiveMint,
      provider.wallet.publicKey
    );

    takerSendAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      receiveMint,
      taker.publicKey
    );

    takerReceiveAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      sendMint,
      taker.publicKey
    );

    // Mint tokens
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      sendMint,
      initializerSendAccount.address,
      provider.wallet.publicKey,
      sendAmount
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer,
      receiveMint,
      takerSendAccount.address,
      provider.wallet.publicKey,
      receiveAmount
    );

    // Derive PDAs
    [escrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        provider.wallet.publicKey.toBuffer(),
        sendMint.toBuffer(),
      ],
      program.programId
    );
  });

  it("Initializes escrow", async () => {
    const vault = anchor.web3.Keypair.generate();

    await program.methods
      .initialize(new anchor.BN(sendAmount), new anchor.BN(receiveAmount))
      .accounts({
        escrow: escrowPda,
        initializer: provider.wallet.publicKey,
        sendMint,
        receiveMint,
        initializerSendTokenAccount: initializerSendAccount.address,
        initializerReceiveTokenAccount: initializerReceiveAccount.address,
        vault: vault.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([vault])
      .rpc();

    vaultPda = vault.publicKey;

    const escrow = await program.account.escrow.fetch(escrowPda);
    expect(escrow.sendAmount.toNumber()).to.equal(sendAmount);
    expect(escrow.receiveAmount.toNumber()).to.equal(receiveAmount);
  });

  it("Exchanges tokens", async () => {
    await program.methods
      .exchange()
      .accounts({
        escrow: escrowPda,
        taker: taker.publicKey,
        takerSendTokenAccount: takerSendAccount.address,
        takerReceiveTokenAccount: takerReceiveAccount.address,
        initializerReceiveTokenAccount: initializerReceiveAccount.address,
        initializer: provider.wallet.publicKey,
        vault: vaultPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([taker])
      .rpc();

    const takerReceiveAccountInfo = await provider.connection.getTokenAccountBalance(
      takerReceiveAccount.address
    );
    expect(takerReceiveAccountInfo.value.uiAmount).to.equal(sendAmount);
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
 * Escrow SDK
 * Client library for interacting with the escrow program
 */
export class EscrowClient {
  constructor(
    private program: Program,
    private provider: anchor.AnchorProvider
  ) {}

  /**
   * Initialize an escrow
   */
  async initializeEscrow(
    sendMint: anchor.web3.PublicKey,
    receiveMint: anchor.web3.PublicKey,
    sendAmount: number,
    receiveAmount: number,
    initializerSendTokenAccount: anchor.web3.PublicKey,
    initializerReceiveTokenAccount: anchor.web3.PublicKey
  ): Promise<{ escrow: anchor.web3.PublicKey; vault: anchor.web3.PublicKey }> {
    const [escrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        this.provider.wallet.publicKey.toBuffer(),
        sendMint.toBuffer(),
      ],
      this.program.programId
    );

    const vault = anchor.web3.Keypair.generate();

    await this.program.methods
      .initialize(new anchor.BN(sendAmount), new anchor.BN(receiveAmount))
      .accounts({
        escrow: escrowPda,
        initializer: this.provider.wallet.publicKey,
        sendMint,
        receiveMint,
        initializerSendTokenAccount,
        initializerReceiveTokenAccount,
        vault: vault.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([vault])
      .rpc();

    return { escrow: escrowPda, vault: vault.publicKey };
  }

  /**
   * Exchange tokens (complete escrow)
   */
  async exchange(
    escrowAddress: anchor.web3.PublicKey,
    vaultAddress: anchor.web3.PublicKey,
    takerSendTokenAccount: anchor.web3.PublicKey,
    takerReceiveTokenAccount: anchor.web3.PublicKey,
    initializerReceiveTokenAccount: anchor.web3.PublicKey,
    initializer: anchor.web3.PublicKey
  ): Promise<void> {
    await this.program.methods
      .exchange()
      .accounts({
        escrow: escrowAddress,
        taker: this.provider.wallet.publicKey,
        takerSendTokenAccount,
        takerReceiveTokenAccount,
        initializerReceiveTokenAccount,
        initializer,
        vault: vaultAddress,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Cancel escrow
   */
  async cancel(
    escrowAddress: anchor.web3.PublicKey,
    vaultAddress: anchor.web3.PublicKey,
    initializerSendTokenAccount: anchor.web3.PublicKey
  ): Promise<void> {
    await this.program.methods
      .cancel()
      .accounts({
        escrow: escrowAddress,
        initializer: this.provider.wallet.publicKey,
        initializerSendTokenAccount,
        vault: vaultAddress,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Get escrow data
   */
  async getEscrow(address: anchor.web3.PublicKey) {
    return await this.program.account.escrow.fetch(address);
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

Secure peer-to-peer token swap escrow program, generated with SolAnchorGen.

## Features

- Initialize escrow with custom token amounts
- Secure token exchange between two parties
- Cancel escrow and return tokens
- PDA-based vault for token custody
- Built-in security validations

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

#### \`initialize\`
Creates a new escrow and locks tokens in a vault.

**Parameters:**
- \`send_amount\`: Amount of tokens to send
- \`receive_amount\`: Amount of tokens to receive

#### \`exchange\`
Completes the token swap between initializer and taker.

#### \`cancel\`
Cancels the escrow and returns tokens to initializer.

### Security Features

- ✅ Owner validation
- ✅ Mint validation
- ✅ Account validation
- ✅ PDA-based vault
- ✅ Automatic account closure
- ✅ Signer verification

## Usage Example

\`\`\`typescript
import { EscrowClient } from './app/src';

// Initialize escrow
const { escrow, vault } = await client.initializeEscrow(
  sendMintAddress,
  receiveMintAddress,
  1000, // send amount
  500,  // receive amount
  initializerSendAccount,
  initializerReceiveAccount
);

// Taker exchanges tokens
await client.exchange(
  escrow,
  vault,
  takerSendAccount,
  takerReceiveAccount,
  initializerReceiveAccount,
  initializerAddress
);

// Or cancel escrow
await client.cancel(escrow, vault, initializerSendAccount);
\`\`\`

## How It Works

1. **Initialize**: Initializer creates escrow and deposits tokens into vault
2. **Exchange**: Taker provides required tokens and receives escrowed tokens
3. **Cancel**: Initializer can cancel and retrieve tokens before exchange

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
