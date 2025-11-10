import { resolve } from 'path';
import {
  BaseTemplateGenerator,
  GeneratorContext,
  GeneratedFile,
  Dependencies,
} from '../generator.js';

/**
 * Marketplace Template Generator
 * Generates an NFT marketplace with royalties
 */
export class MarketplaceGenerator extends BaseTemplateGenerator {
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

const MAX_ROYALTY_PERCENTAGE: u16 = 5000; // 50% max royalty (in basis points)
const BASIS_POINTS: u64 = 10000;

#[program]
pub mod ${programName} {
    use super::*;

    /// List an NFT for sale
    pub fn list_nft(
        ctx: Context<ListNft>,
        price: u64,
        royalty_percentage: u16,
    ) -> Result<()> {
        require!(price > 0, ErrorCode::InvalidPrice);
        require!(
            royalty_percentage <= MAX_ROYALTY_PERCENTAGE,
            ErrorCode::RoyaltyTooHigh
        );
        
        let listing = &mut ctx.accounts.listing;
        
        listing.seller = ctx.accounts.seller.key();
        listing.nft_mint = ctx.accounts.nft_mint.key();
        listing.price = price;
        listing.royalty_percentage = royalty_percentage;
        listing.creator = ctx.accounts.creator.key();
        listing.is_active = true;
        listing.bump = ctx.bumps.listing;
        
        // Transfer NFT from seller to listing vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.seller_nft_account.to_account_info(),
            to: ctx.accounts.listing_vault.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, 1)?;
        
        emit!(NftListedEvent {
            listing: listing.key(),
            seller: ctx.accounts.seller.key(),
            nft_mint: ctx.accounts.nft_mint.key(),
            price,
        });
        
        Ok(())
    }

    /// Buy a listed NFT
    pub fn buy_nft(ctx: Context<BuyNft>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        
        require!(listing.is_active, ErrorCode::ListingNotActive);
        
        let price = listing.price;
        let royalty_amount = price
            .checked_mul(listing.royalty_percentage as u64)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(BASIS_POINTS)
            .ok_or(ErrorCode::DivisionByZero)?;
        
        let seller_amount = price
            .checked_sub(royalty_amount)
            .ok_or(ErrorCode::Underflow)?;
        
        // Transfer payment to seller
        if seller_amount > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.buyer_payment_account.to_account_info(),
                to: ctx.accounts.seller_payment_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            token::transfer(cpi_ctx, seller_amount)?;
        }
        
        // Transfer royalty to creator
        if royalty_amount > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.buyer_payment_account.to_account_info(),
                to: ctx.accounts.creator_payment_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            token::transfer(cpi_ctx, royalty_amount)?;
        }
        
        // Transfer NFT from listing vault to buyer
        let seeds = &[
            b"listing",
            listing.nft_mint.as_ref(),
            listing.seller.as_ref(),
            &[listing.bump],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.listing_vault.to_account_info(),
            to: ctx.accounts.buyer_nft_account.to_account_info(),
            authority: listing.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, 1)?;
        
        listing.is_active = false;
        
        emit!(NftSoldEvent {
            listing: listing.key(),
            seller: listing.seller,
            buyer: ctx.accounts.buyer.key(),
            price,
            royalty_amount,
        });
        
        Ok(())
    }

    /// Cancel a listing
    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        
        require!(listing.is_active, ErrorCode::ListingNotActive);
        
        // Transfer NFT back to seller
        let seeds = &[
            b"listing",
            listing.nft_mint.as_ref(),
            listing.seller.as_ref(),
            &[listing.bump],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.listing_vault.to_account_info(),
            to: ctx.accounts.seller_nft_account.to_account_info(),
            authority: listing.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, 1)?;
        
        listing.is_active = false;
        
        emit!(ListingCancelledEvent {
            listing: listing.key(),
            seller: ctx.accounts.seller.key(),
        });
        
        Ok(())
    }

    /// Update listing price
    pub fn update_price(ctx: Context<UpdatePrice>, new_price: u64) -> Result<()> {
        require!(new_price > 0, ErrorCode::InvalidPrice);
        
        let listing = &mut ctx.accounts.listing;
        
        require!(listing.is_active, ErrorCode::ListingNotActive);
        
        let old_price = listing.price;
        listing.price = new_price;
        
        emit!(PriceUpdatedEvent {
            listing: listing.key(),
            old_price,
            new_price,
        });
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ListNft<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", nft_mint.key().as_ref(), seller.key().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    
    pub nft_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        constraint = seller_nft_account.mint == nft_mint.key() @ ErrorCode::InvalidMint,
        constraint = seller_nft_account.owner == seller.key() @ ErrorCode::InvalidOwner,
        constraint = seller_nft_account.amount >= 1 @ ErrorCode::InsufficientNfts
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = seller,
        token::mint = nft_mint,
        token::authority = listing,
    )]
    pub listing_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is the NFT creator for royalties
    pub creator: AccountInfo<'info>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BuyNft<'info> {
    #[account(
        mut,
        seeds = [b"listing", listing.nft_mint.as_ref(), listing.seller.as_ref()],
        bump = listing.bump
    )]
    pub listing: Account<'info, Listing>,
    
    #[account(
        mut,
        constraint = listing_vault.mint == listing.nft_mint @ ErrorCode::InvalidMint
    )]
    pub listing_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = buyer_nft_account.mint == listing.nft_mint @ ErrorCode::InvalidMint,
        constraint = buyer_nft_account.owner == buyer.key() @ ErrorCode::InvalidOwner
    )]
    pub buyer_nft_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub buyer_payment_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_payment_account.owner == listing.seller @ ErrorCode::InvalidOwner
    )]
    pub seller_payment_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = creator_payment_account.owner == listing.creator @ ErrorCode::InvalidOwner
    )]
    pub creator_payment_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(
        mut,
        seeds = [b"listing", listing.nft_mint.as_ref(), listing.seller.as_ref()],
        bump = listing.bump,
        has_one = seller @ ErrorCode::Unauthorized
    )]
    pub listing: Account<'info, Listing>,
    
    #[account(
        mut,
        constraint = listing_vault.mint == listing.nft_mint @ ErrorCode::InvalidMint
    )]
    pub listing_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = seller_nft_account.mint == listing.nft_mint @ ErrorCode::InvalidMint,
        constraint = seller_nft_account.owner == seller.key() @ ErrorCode::InvalidOwner
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(
        mut,
        seeds = [b"listing", listing.nft_mint.as_ref(), listing.seller.as_ref()],
        bump = listing.bump,
        has_one = seller @ ErrorCode::Unauthorized
    )]
    pub listing: Account<'info, Listing>,
    
    pub seller: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub price: u64,
    pub royalty_percentage: u16,
    pub creator: Pubkey,
    pub is_active: bool,
    pub bump: u8,
}

#[event]
pub struct NftListedEvent {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub price: u64,
}

#[event]
pub struct NftSoldEvent {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub royalty_amount: u64,
}

#[event]
pub struct ListingCancelledEvent {
    pub listing: Pubkey,
    pub seller: Pubkey,
}

#[event]
pub struct PriceUpdatedEvent {
    pub listing: Pubkey,
    pub old_price: u64,
    pub new_price: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Royalty percentage too high (max 50%)")]
    RoyaltyTooHigh,
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Insufficient NFTs")]
    InsufficientNfts,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Arithmetic underflow")]
    Underflow,
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
description = "NFT marketplace program generated with SolAnchorGen"
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

  let nftMint: anchor.web3.PublicKey;
  let paymentMint: anchor.web3.PublicKey;
  let listingPda: anchor.web3.PublicKey;
  let listingVault: anchor.web3.Keypair;

  const buyer = anchor.web3.Keypair.generate();
  const creator = anchor.web3.Keypair.generate();
  const price = 1000;

  before(async () => {
    // Airdrop to buyer
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(buyer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );

    // Create NFT mint
    nftMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      0 // NFTs have 0 decimals
    );

    // Create payment token mint
    paymentMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9
    );

    // Derive listing PDA
    [listingPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("listing"),
        nftMint.toBuffer(),
        provider.wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    listingVault = anchor.web3.Keypair.generate();
  });

  it("Lists an NFT", async () => {
    // Create seller NFT account and mint NFT
    const sellerNftAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      nftMint,
      provider.wallet.publicKey
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer,
      nftMint,
      sellerNftAccount.address,
      provider.wallet.publicKey,
      1
    );

    await program.methods
      .listNft(new anchor.BN(price), 500) // 5% royalty
      .accounts({
        listing: listingPda,
        nftMint,
        sellerNftAccount: sellerNftAccount.address,
        listingVault: listingVault.publicKey,
        creator: creator.publicKey,
        seller: provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([listingVault])
      .rpc();

    const listing = await program.account.listing.fetch(listingPda);
    expect(listing.price.toNumber()).to.equal(price);
    expect(listing.isActive).to.be.true;
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
 * Marketplace SDK
 * Client library for interacting with the marketplace program
 */
export class MarketplaceClient {
  constructor(
    private program: Program,
    private provider: anchor.AnchorProvider
  ) {}

  /**
   * List an NFT for sale
   */
  async listNft(
    nftMint: anchor.web3.PublicKey,
    price: number,
    royaltyPercentage: number,
    creator: anchor.web3.PublicKey,
    sellerNftAccount: anchor.web3.PublicKey
  ): Promise<{ listing: anchor.web3.PublicKey; vault: anchor.web3.PublicKey }> {
    const [listingPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("listing"),
        nftMint.toBuffer(),
        this.provider.wallet.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    const vault = anchor.web3.Keypair.generate();

    await this.program.methods
      .listNft(new anchor.BN(price), royaltyPercentage)
      .accounts({
        listing: listingPda,
        nftMint,
        sellerNftAccount,
        listingVault: vault.publicKey,
        creator,
        seller: this.provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([vault])
      .rpc();

    return { listing: listingPda, vault: vault.publicKey };
  }

  /**
   * Buy a listed NFT
   */
  async buyNft(
    listingAddress: anchor.web3.PublicKey,
    vaultAddress: anchor.web3.PublicKey,
    buyerNftAccount: anchor.web3.PublicKey,
    buyerPaymentAccount: anchor.web3.PublicKey,
    sellerPaymentAccount: anchor.web3.PublicKey,
    creatorPaymentAccount: anchor.web3.PublicKey
  ): Promise<void> {
    await this.program.methods
      .buyNft()
      .accounts({
        listing: listingAddress,
        listingVault: vaultAddress,
        buyerNftAccount,
        buyerPaymentAccount,
        sellerPaymentAccount,
        creatorPaymentAccount,
        buyer: this.provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Cancel a listing
   */
  async cancelListing(
    listingAddress: anchor.web3.PublicKey,
    vaultAddress: anchor.web3.PublicKey,
    sellerNftAccount: anchor.web3.PublicKey
  ): Promise<void> {
    await this.program.methods
      .cancelListing()
      .accounts({
        listing: listingAddress,
        listingVault: vaultAddress,
        sellerNftAccount,
        seller: this.provider.wallet.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Update listing price
   */
  async updatePrice(
    listingAddress: anchor.web3.PublicKey,
    newPrice: number
  ): Promise<void> {
    await this.program.methods
      .updatePrice(new anchor.BN(newPrice))
      .accounts({
        listing: listingAddress,
        seller: this.provider.wallet.publicKey,
      })
      .rpc();
  }

  /**
   * Get listing data
   */
  async getListing(address: anchor.web3.PublicKey) {
    return await this.program.account.listing.fetch(address);
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

NFT marketplace with royalty support, generated with SolAnchorGen.

## Features

- List NFTs for sale with custom pricing
- Buy listed NFTs with automatic royalty distribution
- Cancel listings and retrieve NFTs
- Update listing prices
- Creator royalties (up to 50%)
- Secure PDA-based vault system

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

#### \`list_nft\`
Lists an NFT for sale.

**Parameters:**
- \`price\`: Sale price in payment tokens
- \`royalty_percentage\`: Creator royalty in basis points (0-5000)

#### \`buy_nft\`
Purchases a listed NFT with automatic royalty distribution.

#### \`cancel_listing\`
Cancels a listing and returns NFT to seller.

#### \`update_price\`
Updates the price of an active listing.

**Parameters:**
- \`new_price\`: New sale price

### Security Features

- ✅ Ownership validation
- ✅ Mint validation
- ✅ Active listing checks
- ✅ PDA-based vault
- ✅ Automatic royalty calculation
- ✅ Overflow/underflow protection

## Usage Example

\`\`\`typescript
import { MarketplaceClient } from './app/src';

// List NFT
const { listing, vault } = await client.listNft(
  nftMintAddress,
  1000, // price
  500,  // 5% royalty
  creatorAddress,
  sellerNftAccount
);

// Buy NFT
await client.buyNft(
  listing,
  vault,
  buyerNftAccount,
  buyerPaymentAccount,
  sellerPaymentAccount,
  creatorPaymentAccount
);

// Update price
await client.updatePrice(listing, 1500);

// Cancel listing
await client.cancelListing(listing, vault, sellerNftAccount);
\`\`\`

## Royalty System

- Royalties are specified in basis points (1 bp = 0.01%)
- Maximum royalty: 5000 bp (50%)
- Automatic distribution on sale
- Creator receives royalty, seller receives remainder

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
