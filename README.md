# AnchorGen

A scaffolding tool that generates boilerplate Anchor programs with common patterns and best practices.

## Overview

AnchorGen accelerates Solana program development by providing production-ready templates for common use cases, saving hours of setup time.

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

## Installation

```bash
npm install -g anchorgen
```

## Usage

```bash
# Interactive mode
anchorgen init

# Generate specific template
anchorgen new --template nft-minting my-nft-program

# List all available templates
anchorgen list

# Generate with custom options
anchorgen new --template staking --token-decimals 9 my-staking-program
```

## Example

```bash
$ anchorgen new --template nft-minting my-collection

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

## Template Structure

Each template includes:
- Program code with security checks
- Client-side TypeScript SDK
- Comprehensive test suite
- Deployment scripts
- Documentation

## Contributing

Want to add a new template? Check out our [contribution guide](CONTRIBUTING.md).

## License

MIT
