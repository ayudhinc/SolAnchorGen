import { TemplateRegistry } from './registry.js';
import { NftMintingGenerator } from './nft-minting/generator.js';
import { StakingGenerator } from './staking/generator.js';
import { EscrowGenerator } from './escrow/generator.js';
import { GovernanceGenerator } from './governance/generator.js';
import { MarketplaceGenerator } from './marketplace/generator.js';
import { VaultGenerator } from './vault/generator.js';

/**
 * Creates and configures the template registry with all available templates
 */
export function createTemplateRegistry(): TemplateRegistry {
  const registry = new TemplateRegistry();

  // Register NFT Minting template
  registry.registerTemplate({
    id: 'nft-minting',
    name: 'NFT Minting',
    description: 'Complete NFT collection with metadata',
    options: [],
    generator: new NftMintingGenerator(),
  });

  // Register Staking template
  registry.registerTemplate({
    id: 'staking',
    name: 'Token Staking',
    description: 'Stake tokens and earn rewards',
    options: [
      {
        name: 'tokenDecimals',
        flag: 'token-decimals',
        description: 'Token decimals (default: 9)',
        type: 'number',
        defaultValue: 9,
        validate: (value: number) => value >= 0 && value <= 18,
      },
    ],
    generator: new StakingGenerator(),
  });

  // Register Escrow template
  registry.registerTemplate({
    id: 'escrow',
    name: 'Escrow',
    description: 'Secure peer-to-peer token swaps',
    options: [],
    generator: new EscrowGenerator(),
  });

  // Register Governance template
  registry.registerTemplate({
    id: 'governance',
    name: 'Governance',
    description: 'DAO voting and proposal system',
    options: [],
    generator: new GovernanceGenerator(),
  });

  // Register Marketplace template
  registry.registerTemplate({
    id: 'marketplace',
    name: 'Marketplace',
    description: 'Buy/sell NFTs with royalties',
    options: [],
    generator: new MarketplaceGenerator(),
  });

  // Register Vault template
  registry.registerTemplate({
    id: 'vault',
    name: 'Vault',
    description: 'Secure token custody with multi-sig',
    options: [],
    generator: new VaultGenerator(),
  });

  return registry;
}

/**
 * Default configured registry instance
 */
export const defaultRegistry = createTemplateRegistry();
