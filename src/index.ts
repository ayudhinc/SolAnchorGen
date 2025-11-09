#!/usr/bin/env node

/**
 * SolAnchorGen CLI Entry Point
 * Main entry point for the Anchor program scaffolding tool
 */

import { createProgram } from './cli/commander.js';

/**
 * Main function that initializes and runs the CLI
 */
async function main(): Promise<void> {
  try {
    const program = createProgram();

    // Register commands here (will be added in later tasks)
    // registerCommands(program);

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
