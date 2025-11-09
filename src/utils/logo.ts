import chalk from 'chalk';

/**
 * Displays the SolAnchorGen ASCII art logo
 */
export function displayLogo(): void {
  const logo = `
${chalk.magenta('   _____ ____  __       ___                __                 ______')}
${chalk.magenta('  / ___// __ \\/ /      /   |  ____  _____/ /_  ____  _____  / ____/__  ____')}
${chalk.cyan('  \\__ \\/ / / / /      / /| | / __ \\/ ___/ __ \\/ __ \\/ ___/ / / __/ _ \\/ __ \\')}
${chalk.cyan(' ___/ / /_/ / /___   / ___ |/ / / / /__/ / / / /_/ / /    / /_/ /  __/ / / /')}
${chalk.blue('/____/\\____/_____/  /_/  |_/_/ /_/\\___/_/ /_/\\____/_/     \\____/\\___/_/ /_/')}

${chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
${chalk.yellow('⚡ Scaffold Solana Anchor programs with production-ready templates')}
${chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
`;
  console.log(logo);
}

/**
 * Displays a compact version of the logo for command outputs
 */
export function displayCompactLogo(): void {
  console.log(chalk.magenta('⚓ SolAnchorGen') + chalk.gray(' v0.1.0'));
}
