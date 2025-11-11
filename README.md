# SolAnchorGen

```
   _____ ____  __       ___                __                 ______
  / ___// __ \/ /      /   |  ____  _____/ /_  ____  _____  / ____/__  ____
  \__ \/ / / / /      / /| | / __ \/ ___/ __ \/ __ \/ ___/ / / __/ _ \/ __ \
 ___/ / /_/ / /___   / ___ |/ / / / /__/ / / / /_/ / /    / /_/ /  __/ / / /
/____/\____/_____/  /_/  |_/_/ /_/\___/_/ /_/\____/_/     \____/\___/_/ /_/
```

⚡ **Scaffold Solana Anchor programs with production-ready templates**

A command-line scaffolding tool that generates boilerplate Anchor programs with common patterns and best practices.

## Overview

SolAnchorGen accelerates Solana program development by providing production-ready templates for common use cases, saving hours of setup time. Built with TypeScript and powered by pnpm.

## Features

- 🚀 **Quick Scaffolding** - Generate complete Anchor programs in seconds
- 📦 **6 Production-Ready Templates** - NFT, Staking, Escrow, Governance, Marketplace, Vault
- ✅ **Security Best Practices** - Built-in validation, overflow protection, access control
- 🧪 **Comprehensive Tests** - Full test coverage with Mocha/Chai
- 📚 **Complete Documentation** - Inline comments, README, and usage examples
- 🔧 **Customizable Options** - Template-specific configuration (e.g., token decimals)
- 💻 **TypeScript SDK** - Client libraries for easy program interaction
- 🎨 **Beautiful CLI** - Colorful output with progress indicators and spinners
- 📋 **Interactive Mode** - Step-by-step project creation with prompts
- ⚡ **Fast Setup** - pnpm for lightning-fast dependency installation

## Available Templates

- **NFT Minting** - Complete NFT collection with metadata
- **Token Staking** - Stake tokens and earn rewards
- **Escrow** - Secure peer-to-peer token swaps
- **Governance** - DAO voting and proposal system
- **Marketplace** - Buy/sell NFTs with royalties
- **Vault** - Secure token custody with multi-sig

## Prerequisites

- Node.js >= 18.0.0
- pnpm (required package manager)
- Anchor framework (for building generated programs)

## Quick Start

```bash
# 1. Install pnpm if not already installed
npm install -g pnpm

# 2. Clone and build the project
git clone https://github.com/ayudhinc/SolAnchorGen.git
cd SolAnchorGen
pnpm install
pnpm build

# 3. Link globally for CLI usage
pnpm link --global

# 4. Generate your first project
sol-anchor-gen list                                    # See all templates
sol-anchor-gen init                                    # Interactive mode
sol-anchor-gen new --template nft-minting my-project   # Direct generation
```

## Installation

### Option 1: Install from npm (Recommended)

Install globally from npm:

```bash
npm install -g sol-anchor-gen

# Verify installation
sol-anchor-gen --version
```

### Option 2: Install from source

Clone and build from source:

```bash
# Install pnpm
npm install -g pnpm

# Clone repository
git clone https://github.com/ayudhinc/SolAnchorGen.git
cd SolAnchorGen

# Install dependencies and build
pnpm install
pnpm build

# Link globally
pnpm link --global

# Verify installation
sol-anchor-gen --version
```

## Usage

```bash
# Interactive mode
sol-anchor-gen init

# Generate specific template
sol-anchor-gen new --template nft-minting my-nft-program

# List all available templates
sol-anchor-gen list

# Generate with custom options
sol-anchor-gen new --template staking --token-decimals 9 my-staking-program
```

## Example

```bash
$ sol-anchor-gen new --template nft-minting my-collection

✓ Created Anchor workspace
✓ Generated program code
✓ Added test suite
✓ Configured Anchor.toml

Your NFT minting program is ready!

Next steps:
  cd my-collection
  anchor build
  anchor test
```

## Development

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Watch mode for development
pnpm dev

# Run the CLI locally
pnpm start

# Link for global usage
pnpm link --global
```

## Project Status

✅ **Production Ready** - All 6 templates are fully implemented with production-ready Rust programs, comprehensive tests, TypeScript SDKs, and detailed documentation.

## Template Structure

Each template includes:
- **Rust Program Code** - Production-ready Anchor programs with:
  - Security best practices (account validation, signer checks, overflow protection)
  - Custom error types with descriptive messages
  - Event emissions for tracking
  - Inline comments explaining security considerations
- **TypeScript SDK** - Client library for easy program interaction
- **Comprehensive Test Suite** - Full test coverage with Mocha/Chai
- **Anchor Configuration** - Pre-configured Anchor.toml
- **Package Configuration** - Ready-to-use package.json with pnpm
- **Documentation** - Detailed README with usage examples and deployment instructions

## Template Details

### NFT Minting
- Initialize NFT collections with metadata
- Mint individual NFTs with unique URIs
- SPL Token integration
- Collection tracking

### Token Staking
- Configurable token decimals
- Time-based reward calculation
- Stake/unstake functionality
- Reward claiming with automatic distribution

### Escrow
- Peer-to-peer token swaps
- PDA-based vault for security
- Initialize, exchange, and cancel operations
- Atomic swap execution

### Governance
- DAO initialization with custom parameters
- Proposal creation and voting
- Token-weighted voting system
- Quorum and approval threshold validation
- Execution delay for security

### Marketplace
- List NFTs with custom pricing
- Automatic royalty distribution (up to 50%)
- Buy, cancel, and update listing operations
- Creator royalty support

### Vault
- Multi-signature authorization (M-of-N)
- Configurable guardian threshold
- Withdrawal proposal and approval workflow
- Secure token custody

## Project Structure

```
SolAnchorGen/
├── src/
│   ├── cli/          # CLI infrastructure (commander, prompts)
│   ├── commands/     # Command handlers (init, new, list)
│   ├── generator/    # Workspace generation orchestration
│   ├── templates/    # Template implementations
│   ├── utils/        # Utilities (fs, validation, progress)
│   └── index.ts      # CLI entry point
├── dist/             # Compiled output
├── package.json      # Project configuration
└── tsconfig.json     # TypeScript configuration
```

## Publishing to npm

To publish this package to npm:

```bash
# 1. Ensure you're logged in to npm
npm login

# 2. Build the project
pnpm build

# 3. Publish to npm (prepublishOnly script will run automatically)
npm publish

# Or for a dry run to see what would be published
npm publish --dry-run
```

## Contributing

Want to add a new template? Check out our [contribution guide](CONTRIBUTING.md).

## License

MIT
