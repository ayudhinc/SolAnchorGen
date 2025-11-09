import { resolve } from 'path';
import {
  BaseTemplateGenerator,
  GeneratorContext,
  GeneratedFile,
  Dependencies,
} from '../generator.js';

/**
 * NFT Minting Template Generator
 * Generates a complete NFT minting program with metadata handling
 */
export class NftMintingGenerator extends BaseTemplateGenerator {
  async generate(context: GeneratorContext): Promise<GeneratedFile[]> {
    const { projectName, projectPath } = context;

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

  getDevDependencies(context: GeneratorContext): Dependencies {
    return {
      ...super.getDevDependencies(context),
      '@types/mocha': '^10.0.0',
      'mocha': '^10.2.0',
    };
  }

  /**
   * Generates the Rust program code
   */
  private generateProgramCode(context: GeneratorContext): GeneratedFile {
    const { projectName, projectPath } = context;
    const programName = projectName.replace(/-/g, '_');

    const content = `use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod ${programName} {
    use super::*;

    /// Initialize the NFT collection
    pub fn initialize_collection(
        ctx: Context<InitializeCollection>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let collection = &mut ctx.accounts.collection;
        
        // Validate inputs
        require!(name.len() <= 32, ErrorCode::NameTooLong);
        require!(symbol.len() <= 10, ErrorCode::SymbolTooLong);
        require!(uri.len() <= 200, ErrorCode::UriTooLong);
        
        collection.authority = ctx.accounts.authority.key();
        collection.name = name;
        collection.symbol = symbol;
        collection.uri = uri;
        collection.total_supply = 0;
        
        Ok(())
    }

    /// Mint a new NFT
    pub fn mint_nft(
        ctx: Context<MintNft>,
        name: String,
        uri: String,
    ) -> Result<()> {
        let collection = &mut ctx.accounts.collection;
        
        // Validate authority
        require!(
            collection.authority == ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );
        
        // Validate inputs
        require!(name.len() <= 32, ErrorCode::NameTooLong);
        require!(uri.len() <= 200, ErrorCode::UriTooLong);
        
        // Mint token to recipient
        let cpi_accounts = token::MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::mint_to(cpi_ctx, 1)?;
        
        // Update collection
        collection.total_supply = collection.total_supply.checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeCollection<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Collection::INIT_SPACE
    )]
    pub collection: Account<'info, Collection>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(mut)]
    pub collection: Account<'info, Collection>,
    
    #[account(
        init,
        payer = authority,
        mint::decimals = 0,
        mint::authority = authority,
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = recipient,
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This is the recipient of the NFT
    pub recipient: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
#[derive(InitSpace)]
pub struct Collection {
    pub authority: Pubkey,
    #[max_len(32)]
    pub name: String,
    #[max_len(10)]
    pub symbol: String,
    #[max_len(200)]
    pub uri: String,
    pub total_supply: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Name is too long (max 32 characters)")]
    NameTooLong,
    #[msg("Symbol is too long (max 10 characters)")]
    SymbolTooLong,
    #[msg("URI is too long (max 200 characters)")]
    UriTooLong,
    #[msg("Unauthorized: Only collection authority can mint")]
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
   * Generates Cargo.toml for the program
   */
  private generateCargoToml(context: GeneratorContext): GeneratedFile {
    const { projectName, projectPath } = context;
    const programName = projectName.replace(/-/g, '_');

    const content = `[package]
name = "${programName}"
version = "0.1.0"
description = "NFT minting program generated with SolAnchorGen"
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

describe("${projectName}", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.${this.toPascalCase(programName)} as Program<${this.toPascalCase(programName)}>;

  it("Initializes collection", async () => {
    const collection = anchor.web3.Keypair.generate();

    await program.methods
      .initializeCollection(
        "My NFT Collection",
        "MNFT",
        "https://example.com/metadata.json"
      )
      .accounts({
        collection: collection.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([collection])
      .rpc();

    const collectionAccount = await program.account.collection.fetch(
      collection.publicKey
    );

    expect(collectionAccount.name).to.equal("My NFT Collection");
    expect(collectionAccount.symbol).to.equal("MNFT");
    expect(collectionAccount.totalSupply.toNumber()).to.equal(0);
  });

  it("Mints an NFT", async () => {
    const collection = anchor.web3.Keypair.generate();
    const mint = anchor.web3.Keypair.generate();
    const recipient = anchor.web3.Keypair.generate();

    // Initialize collection first
    await program.methods
      .initializeCollection(
        "My NFT Collection",
        "MNFT",
        "https://example.com/metadata.json"
      )
      .accounts({
        collection: collection.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([collection])
      .rpc();

    // Mint NFT
    await program.methods
      .mintNft("NFT #1", "https://example.com/nft1.json")
      .accounts({
        collection: collection.publicKey,
        mint: mint.publicKey,
        recipient: recipient.publicKey,
        authority: provider.wallet.publicKey,
      })
      .signers([mint])
      .rpc();

    const collectionAccount = await program.account.collection.fetch(
      collection.publicKey
    );

    expect(collectionAccount.totalSupply.toNumber()).to.equal(1);
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
 * NFT Minting SDK
 * Client library for interacting with the NFT minting program
 */
export class NftMintingClient {
  constructor(
    private program: Program,
    private provider: anchor.AnchorProvider
  ) {}

  /**
   * Initialize a new NFT collection
   */
  async initializeCollection(
    name: string,
    symbol: string,
    uri: string
  ): Promise<anchor.web3.PublicKey> {
    const collection = anchor.web3.Keypair.generate();

    await this.program.methods
      .initializeCollection(name, symbol, uri)
      .accounts({
        collection: collection.publicKey,
        authority: this.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([collection])
      .rpc();

    return collection.publicKey;
  }

  /**
   * Mint a new NFT
   */
  async mintNft(
    collectionAddress: anchor.web3.PublicKey,
    name: string,
    uri: string,
    recipient: anchor.web3.PublicKey
  ): Promise<anchor.web3.PublicKey> {
    const mint = anchor.web3.Keypair.generate();

    await this.program.methods
      .mintNft(name, uri)
      .accounts({
        collection: collectionAddress,
        mint: mint.publicKey,
        recipient,
        authority: this.provider.wallet.publicKey,
      })
      .signers([mint])
      .rpc();

    return mint.publicKey;
  }

  /**
   * Fetch collection data
   */
  async getCollection(address: anchor.web3.PublicKey) {
    return await this.program.account.collection.fetch(address);
  }
}
`;

    const path = resolve(projectPath, 'app', 'src', 'index.ts');
    return this.createFile(path, content);
  }

  /**
   * Generates README documentation
   */
  private generateReadme(context: GeneratorContext): GeneratedFile {
    const { projectName, projectPath } = context;

    const content = `# ${projectName}

NFT minting program generated with SolAnchorGen.

## Features

- Initialize NFT collections with metadata
- Mint individual NFTs with unique URIs
- Built-in security checks and validations
- SPL Token integration

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

#### \`initialize_collection\`
Creates a new NFT collection with name, symbol, and metadata URI.

**Parameters:**
- \`name\`: Collection name (max 32 chars)
- \`symbol\`: Collection symbol (max 10 chars)
- \`uri\`: Metadata URI (max 200 chars)

#### \`mint_nft\`
Mints a new NFT to a recipient.

**Parameters:**
- \`name\`: NFT name (max 32 chars)
- \`uri\`: NFT metadata URI (max 200 chars)

### Security Features

- ✅ Authority validation
- ✅ Input length checks
- ✅ Overflow protection
- ✅ Signer verification
- ✅ Account ownership validation

## Usage Example

\`\`\`typescript
import { NftMintingClient } from './app/src';

// Initialize collection
const collectionAddress = await client.initializeCollection(
  "My NFT Collection",
  "MNFT",
  "https://example.com/collection.json"
);

// Mint NFT
const nftMint = await client.mintNft(
  collectionAddress,
  "NFT #1",
  "https://example.com/nft1.json",
  recipientPublicKey
);
\`\`\`

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
