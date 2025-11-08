# SolAnchorGen

A command-line scaffolding tool that generates boilerplate Anchor programs with common patterns and best practices.

## Overview

SolAnchorGen accelerates Solana program development by providing production-ready templates for common use cases, saving hours of setup time. Built with TypeScript and powered by pnpm.

## Features

- 🚀 Quick scaffolding of Anchor programs
- 📦 Pre-built templates for common patterns
- ✅ Best practices and security patterns included
- 🧪 Test suites included with each template
- 📚 Comprehensive inline documentation
- 🔧 Customizable configuration

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

## Installation

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Clone and build the project
git clone <repository-url>
cd SolAnchorGen
pnpm install
pnpm build

# Link globally for CLI usage
pnpm link --global
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

🚧 **Currently in development** - Core infrastructure is set up. Template implementations are in progress.

## Template Structure

Each template includes:
- Program code with security checks
- Client-side TypeScript SDK
- Comprehensive test suite
- Deployment scripts
- Documentation

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

## Contributing

Want to add a new template? Check out our [contribution guide](CONTRIBUTING.md).

## License

MIT
