#!/usr/bin/env node

/**
 * SolAnchorGen CLI Entry Point
 * Main entry point for the Anchor program scaffolding tool
 */

import { Command } from 'commander';
import { createProgram } from './cli/commander.js';
import { displayLogo } from './utils/logo.js';
import { defaultRegistry } from './templates/index.js';
import { createWorkspaceGenerator } from './generator/workspace.js';
import { Validator } from './utils/validator.js';
import { ProgressReporter } from './utils/progress.js';
import { listCommand } from './commands/list.js';
import { initCommand } from './commands/init.js';
import { newCommand } from './commands/new.js';

/**
 * Registers all CLI commands
 */
function registerCommands(program: Command): void {
  const registry = defaultRegistry;
  const workspaceGenerator = createWorkspaceGenerator();
  const validator = new Validator();
  const progressReporter = new ProgressReporter();

  // List command
  program
    .command('list')
    .description('List all available templates')
    .action(async () => {
      await listCommand(registry);
    });

  // Init command
  program
    .command('init')
    .description('Initialize a new Anchor project interactively')
    .action(async () => {
      await initCommand(registry, workspaceGenerator, validator, progressReporter);
    });

  // New command
  program
    .command('new <project-name>')
    .description('Generate a new Anchor project with a specific template')
    .requiredOption('-t, --template <template>', 'Template to use')
    .option('--token-decimals <decimals>', 'Token decimals for staking template', '9')
    .action(async (projectName: string, options: any) => {
      await newCommand(projectName, options, registry, workspaceGenerator, validator, progressReporter);
    });
}

/**
 * Main function that initializes and runs the CLI
 */
async function main(): Promise<void> {
  try {
    // Display logo when no arguments or only help/version flags
    const args = process.argv.slice(2);
    const shouldShowLogo = args.length === 0 || 
                          args.includes('--help') || 
                          args.includes('-h') ||
                          args.includes('--version') ||
                          args.includes('-V');
    
    if (shouldShowLogo) {
      displayLogo();
    }

    const program = createProgram();

    // Register all commands
    registerCommands(program);

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Global error handlers for uncaught exceptions
 */
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Run the CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
