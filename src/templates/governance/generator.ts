import { resolve } from 'path';
import {
  BaseTemplateGenerator,
  GeneratorContext,
  GeneratedFile,
  Dependencies,
} from '../generator.js';

/**
 * Governance Template Generator
 * Generates a DAO voting and proposal system
 */
export class GovernanceGenerator extends BaseTemplateGenerator {
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
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const VOTING_PERIOD: i64 = 7 * 24 * 60 * 60; // 7 days in seconds
const EXECUTION_DELAY: i64 = 2 * 24 * 60 * 60; // 2 days in seconds

#[program]
pub mod ${programName} {
    use super::*;

    /// Initialize the DAO
    pub fn initialize_dao(
        ctx: Context<InitializeDao>,
        quorum_percentage: u8,
        approval_threshold: u8,
    ) -> Result<()> {
        require!(quorum_percentage <= 100, ErrorCode::InvalidPercentage);
        require!(approval_threshold <= 100, ErrorCode::InvalidPercentage);
        require!(approval_threshold > 50, ErrorCode::ThresholdTooLow);
        
        let dao = &mut ctx.accounts.dao;
        
        dao.authority = ctx.accounts.authority.key();
        dao.governance_token = ctx.accounts.governance_token.key();
        dao.quorum_percentage = quorum_percentage;
        dao.approval_threshold = approval_threshold;
        dao.proposal_count = 0;
        dao.bump = ctx.bumps.dao;
        
        Ok(())
    }

    /// Create a new proposal
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
    ) -> Result<()> {
        require!(title.len() <= 100, ErrorCode::TitleTooLong);
        require!(description.len() <= 500, ErrorCode::DescriptionTooLong);
        
        let dao = &mut ctx.accounts.dao;
        let proposal = &mut ctx.accounts.proposal;
        let clock = Clock::get()?;
        
        // Verify proposer has governance tokens
        require!(
            ctx.accounts.proposer_token_account.amount > 0,
            ErrorCode::InsufficientTokens
        );
        
        proposal.dao = dao.key();
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.title = title;
        proposal.description = description;
        proposal.votes_for = 0;
        proposal.votes_against = 0;
        proposal.start_time = clock.unix_timestamp;
        proposal.end_time = clock.unix_timestamp + VOTING_PERIOD;
        proposal.executed = false;
        proposal.cancelled = false;
        proposal.proposal_id = dao.proposal_count;
        
        dao.proposal_count = dao.proposal_count
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        
        emit!(ProposalCreatedEvent {
            proposal: proposal.key(),
            proposer: ctx.accounts.proposer.key(),
            proposal_id: proposal.proposal_id,
        });
        
        Ok(())
    }

    /// Cast a vote on a proposal
    pub fn cast_vote(
        ctx: Context<CastVote>,
        support: bool,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let vote_record = &mut ctx.accounts.vote_record;
        let clock = Clock::get()?;
        
        // Validate voting period
        require!(
            clock.unix_timestamp >= proposal.start_time,
            ErrorCode::VotingNotStarted
        );
        require!(
            clock.unix_timestamp <= proposal.end_time,
            ErrorCode::VotingEnded
        );
        require!(!proposal.cancelled, ErrorCode::ProposalCancelled);
        require!(!proposal.executed, ErrorCode::ProposalExecuted);
        
        // Get voter's token balance
        let voting_power = ctx.accounts.voter_token_account.amount;
        require!(voting_power > 0, ErrorCode::InsufficientTokens);
        
        // Record vote
        vote_record.proposal = proposal.key();
        vote_record.voter = ctx.accounts.voter.key();
        vote_record.support = support;
        vote_record.voting_power = voting_power;
        
        // Update proposal vote counts
        if support {
            proposal.votes_for = proposal.votes_for
                .checked_add(voting_power)
                .ok_or(ErrorCode::Overflow)?;
        } else {
            proposal.votes_against = proposal.votes_against
                .checked_add(voting_power)
                .ok_or(ErrorCode::Overflow)?;
        }
        
        emit!(VoteCastEvent {
            proposal: proposal.key(),
            voter: ctx.accounts.voter.key(),
            support,
            voting_power,
        });
        
        Ok(())
    }

    /// Execute a passed proposal
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let dao = &ctx.accounts.dao;
        let proposal = &mut ctx.accounts.proposal;
        let clock = Clock::get()?;
        
        // Validate proposal can be executed
        require!(!proposal.executed, ErrorCode::ProposalExecuted);
        require!(!proposal.cancelled, ErrorCode::ProposalCancelled);
        require!(
            clock.unix_timestamp > proposal.end_time,
            ErrorCode::VotingNotEnded
        );
        require!(
            clock.unix_timestamp >= proposal.end_time + EXECUTION_DELAY,
            ErrorCode::ExecutionDelayNotMet
        );
        
        // Calculate total votes and check quorum
        let total_votes = proposal.votes_for
            .checked_add(proposal.votes_against)
            .ok_or(ErrorCode::Overflow)?;
        
        let governance_supply = ctx.accounts.governance_token.supply;
        let quorum_required = governance_supply
            .checked_mul(dao.quorum_percentage as u64)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(100)
            .ok_or(ErrorCode::DivisionByZero)?;
        
        require!(total_votes >= quorum_required, ErrorCode::QuorumNotMet);
        
        // Check approval threshold
        let approval_percentage = proposal.votes_for
            .checked_mul(100)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(total_votes)
            .ok_or(ErrorCode::DivisionByZero)?;
        
        require!(
            approval_percentage >= dao.approval_threshold as u64,
            ErrorCode::ApprovalThresholdNotMet
        );
        
        proposal.executed = true;
        
        emit!(ProposalExecutedEvent {
            proposal: proposal.key(),
            votes_for: proposal.votes_for,
            votes_against: proposal.votes_against,
        });
        
        Ok(())
    }

    /// Cancel a proposal (only by proposer before voting ends)
    pub fn cancel_proposal(ctx: Context<CancelProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let clock = Clock::get()?;
        
        require!(!proposal.executed, ErrorCode::ProposalExecuted);
        require!(!proposal.cancelled, ErrorCode::ProposalCancelled);
        require!(
            clock.unix_timestamp <= proposal.end_time,
            ErrorCode::VotingEnded
        );
        
        proposal.cancelled = true;
        
        emit!(ProposalCancelledEvent {
            proposal: proposal.key(),
            proposer: ctx.accounts.proposer.key(),
        });
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeDao<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Dao::INIT_SPACE,
        seeds = [b"dao", governance_token.key().as_ref()],
        bump
    )]
    pub dao: Account<'info, Dao>,
    
    pub governance_token: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub dao: Account<'info, Dao>,
    
    #[account(
        init,
        payer = proposer,
        space = 8 + Proposal::INIT_SPACE,
        seeds = [b"proposal", dao.key().as_ref(), &dao.proposal_count.to_le_bytes()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    
    #[account(
        constraint = proposer_token_account.mint == dao.governance_token @ ErrorCode::InvalidMint,
        constraint = proposer_token_account.owner == proposer.key() @ ErrorCode::InvalidOwner
    )]
    pub proposer_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub proposer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    
    #[account(
        init,
        payer = voter,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    
    #[account(
        constraint = voter_token_account.mint == proposal.dao.governance_token @ ErrorCode::InvalidMint,
        constraint = voter_token_account.owner == voter.key() @ ErrorCode::InvalidOwner
    )]
    pub voter_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub voter: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    pub dao: Account<'info, Dao>,
    
    #[account(
        mut,
        has_one = dao @ ErrorCode::InvalidDao
    )]
    pub proposal: Account<'info, Proposal>,
    
    pub governance_token: Account<'info, Mint>,
    
    pub executor: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelProposal<'info> {
    #[account(
        mut,
        has_one = proposer @ ErrorCode::Unauthorized
    )]
    pub proposal: Account<'info, Proposal>,
    
    pub proposer: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Dao {
    pub authority: Pubkey,
    pub governance_token: Pubkey,
    pub quorum_percentage: u8,
    pub approval_threshold: u8,
    pub proposal_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub dao: Pubkey,
    pub proposer: Pubkey,
    #[max_len(100)]
    pub title: String,
    #[max_len(500)]
    pub description: String,
    pub votes_for: u64,
    pub votes_against: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub executed: bool,
    pub cancelled: bool,
    pub proposal_id: u64,
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub support: bool,
    pub voting_power: u64,
}

#[event]
pub struct ProposalCreatedEvent {
    pub proposal: Pubkey,
    pub proposer: Pubkey,
    pub proposal_id: u64,
}

#[event]
pub struct VoteCastEvent {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub support: bool,
    pub voting_power: u64,
}

#[event]
pub struct ProposalExecutedEvent {
    pub proposal: Pubkey,
    pub votes_for: u64,
    pub votes_against: u64,
}

#[event]
pub struct ProposalCancelledEvent {
    pub proposal: Pubkey,
    pub proposer: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid percentage value")]
    InvalidPercentage,
    #[msg("Approval threshold must be greater than 50%")]
    ThresholdTooLow,
    #[msg("Title is too long (max 100 characters)")]
    TitleTooLong,
    #[msg("Description is too long (max 500 characters)")]
    DescriptionTooLong,
    #[msg("Insufficient governance tokens")]
    InsufficientTokens,
    #[msg("Voting has not started")]
    VotingNotStarted,
    #[msg("Voting period has ended")]
    VotingEnded,
    #[msg("Proposal has been cancelled")]
    ProposalCancelled,
    #[msg("Proposal has already been executed")]
    ProposalExecuted,
    #[msg("Voting period has not ended")]
    VotingNotEnded,
    #[msg("Execution delay has not been met")]
    ExecutionDelayNotMet,
    #[msg("Quorum not met")]
    QuorumNotMet,
    #[msg("Approval threshold not met")]
    ApprovalThresholdNotMet,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Invalid DAO")]
    InvalidDao,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Division by zero")]
    DivisionByZero,
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
description = "Governance program generated with SolAnchorGen"
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

  let governanceToken: anchor.web3.PublicKey;
  let daoPda: anchor.web3.PublicKey;
  let proposalPda: anchor.web3.PublicKey;

  before(async () => {
    // Create governance token
    governanceToken = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9
    );

    // Derive DAO PDA
    [daoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("dao"), governanceToken.toBuffer()],
      program.programId
    );
  });

  it("Initializes DAO", async () => {
    await program.methods
      .initializeDao(60, 66) // 60% quorum, 66% approval
      .accounts({
        dao: daoPda,
        governanceToken,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const dao = await program.account.dao.fetch(daoPda);
    expect(dao.quorumPercentage).to.equal(60);
    expect(dao.approvalThreshold).to.equal(66);
  });

  it("Creates a proposal", async () => {
    // Create token account for proposer
    const proposerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      governanceToken,
      provider.wallet.publicKey
    );

    // Mint tokens to proposer
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      governanceToken,
      proposerTokenAccount.address,
      provider.wallet.publicKey,
      1000
    );

    // Derive proposal PDA
    [proposalPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), daoPda.toBuffer(), Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])],
      program.programId
    );

    await program.methods
      .createProposal(
        "Test Proposal",
        "This is a test proposal for the DAO"
      )
      .accounts({
        dao: daoPda,
        proposal: proposalPda,
        proposerTokenAccount: proposerTokenAccount.address,
        proposer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const proposal = await program.account.proposal.fetch(proposalPda);
    expect(proposal.title).to.equal("Test Proposal");
    expect(proposal.votesFor.toNumber()).to.equal(0);
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
 * Governance SDK
 * Client library for interacting with the governance program
 */
export class GovernanceClient {
  constructor(
    private program: Program,
    private provider: anchor.AnchorProvider
  ) {}

  /**
   * Initialize a DAO
   */
  async initializeDao(
    governanceToken: anchor.web3.PublicKey,
    quorumPercentage: number,
    approvalThreshold: number
  ): Promise<anchor.web3.PublicKey> {
    const [daoPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("dao"), governanceToken.toBuffer()],
      this.program.programId
    );

    await this.program.methods
      .initializeDao(quorumPercentage, approvalThreshold)
      .accounts({
        dao: daoPda,
        governanceToken,
        authority: this.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return daoPda;
  }

  /**
   * Create a proposal
   */
  async createProposal(
    daoAddress: anchor.web3.PublicKey,
    title: string,
    description: string,
    proposerTokenAccount: anchor.web3.PublicKey
  ): Promise<anchor.web3.PublicKey> {
    const dao = await this.program.account.dao.fetch(daoAddress);
    
    const [proposalPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        daoAddress.toBuffer(),
        Buffer.from(dao.proposalCount.toArrayLike(Buffer, "le", 8)),
      ],
      this.program.programId
    );

    await this.program.methods
      .createProposal(title, description)
      .accounts({
        dao: daoAddress,
        proposal: proposalPda,
        proposerTokenAccount,
        proposer: this.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    return proposalPda;
  }

  /**
   * Cast a vote
   */
  async castVote(
    proposalAddress: anchor.web3.PublicKey,
    support: boolean,
    voterTokenAccount: anchor.web3.PublicKey
  ): Promise<void> {
    const [voteRecordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("vote"),
        proposalAddress.toBuffer(),
        this.provider.wallet.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    await this.program.methods
      .castVote(support)
      .accounts({
        proposal: proposalAddress,
        voteRecord: voteRecordPda,
        voterTokenAccount,
        voter: this.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Execute a proposal
   */
  async executeProposal(
    daoAddress: anchor.web3.PublicKey,
    proposalAddress: anchor.web3.PublicKey,
    governanceToken: anchor.web3.PublicKey
  ): Promise<void> {
    await this.program.methods
      .executeProposal()
      .accounts({
        dao: daoAddress,
        proposal: proposalAddress,
        governanceToken,
        executor: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  /**
   * Cancel a proposal
   */
  async cancelProposal(proposalAddress: anchor.web3.PublicKey): Promise<void> {
    await this.program.methods
      .cancelProposal()
      .accounts({
        proposal: proposalAddress,
        proposer: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  /**
   * Get DAO data
   */
  async getDao(address: anchor.web3.PublicKey) {
    return await this.program.account.dao.fetch(address);
  }

  /**
   * Get proposal data
   */
  async getProposal(address: anchor.web3.PublicKey) {
    return await this.program.account.proposal.fetch(address);
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

DAO voting and proposal system, generated with SolAnchorGen.

## Features

- Initialize DAOs with custom governance parameters
- Create proposals with title and description
- Token-weighted voting system
- Quorum and approval threshold validation
- Execution delay for security
- Proposal cancellation by proposer

## Configuration

- Voting Period: 7 days
- Execution Delay: 2 days
- Configurable quorum percentage
- Configurable approval threshold

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

#### \`initialize_dao\`
Creates a new DAO with governance parameters.

**Parameters:**
- \`quorum_percentage\`: Minimum participation required (0-100)
- \`approval_threshold\`: Minimum approval required (51-100)

#### \`create_proposal\`
Creates a new proposal for voting.

**Parameters:**
- \`title\`: Proposal title (max 100 chars)
- \`description\`: Proposal description (max 500 chars)

#### \`cast_vote\`
Casts a vote on a proposal.

**Parameters:**
- \`support\`: true for yes, false for no

#### \`execute_proposal\`
Executes a passed proposal after execution delay.

#### \`cancel_proposal\`
Cancels a proposal (only by proposer before voting ends).

### Security Features

- ✅ Token-weighted voting
- ✅ Quorum validation
- ✅ Approval threshold checks
- ✅ Execution delay
- ✅ Voting period enforcement
- ✅ Access control
- ✅ Double-vote prevention

## Usage Example

\`\`\`typescript
import { GovernanceClient } from './app/src';

// Initialize DAO
const daoAddress = await client.initializeDao(
  governanceTokenAddress,
  60, // 60% quorum
  66  // 66% approval threshold
);

// Create proposal
const proposalAddress = await client.createProposal(
  daoAddress,
  "Increase Treasury Allocation",
  "Proposal to increase treasury allocation by 10%",
  proposerTokenAccount
);

// Cast vote
await client.castVote(proposalAddress, true, voterTokenAccount);

// Execute proposal (after voting period + delay)
await client.executeProposal(daoAddress, proposalAddress, governanceTokenAddress);
\`\`\`

## Governance Flow

1. **Initialize**: Create DAO with governance parameters
2. **Propose**: Token holders create proposals
3. **Vote**: Token holders vote during voting period
4. **Execute**: Passed proposals executed after delay

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
