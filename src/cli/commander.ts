import { Command } from 'commander';

/**
 * Command configuration interface
 */
export interface CommandConfig {
  name: string;
  description: string;
  options: CommandOption[];
  action: CommandAction;
}

/**
 * Command option interface
 */
export interface CommandOption {
  flags: string;
  description: string;
  defaultValue?: any;
}

/**
 * Command action type
 */
export type CommandAction = (options: any) => Promise<void>;

/**
 * Creates and configures the Commander program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('sol-anchor-gen')
    .description('CLI tool for generating Anchor program scaffolding for Solana development')
    .version('0.1.0')
    .addHelpText('after', `
Examples:
  $ sol-anchor-gen init
    Start interactive project initialization

  $ sol-anchor-gen new --template nft-minting my-nft-project
    Generate an NFT minting program

  $ sol-anchor-gen list
    List all available templates

  $ sol-anchor-gen new --template staking --token-decimals 9 my-staking-program
    Generate a staking program with custom token decimals
`);

  return program;
}

/**
 * Adds a command to the program
 */
export function addCommand(program: Command, config: CommandConfig): void {
  const command = program
    .command(config.name)
    .description(config.description);

  // Add options to the command
  for (const option of config.options) {
    command.option(option.flags, option.description, option.defaultValue);
  }

  // Set the action handler
  command.action(config.action);
}

/**
 * Adds help text to a command with examples
 */
export function addCommandHelp(command: Command, examples: string[]): void {
  if (examples.length > 0) {
    const examplesText = '\nExamples:\n' + examples.map(ex => `  $ ${ex}`).join('\n');
    command.addHelpText('after', examplesText);
  }
}
