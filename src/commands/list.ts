import Table from 'cli-table3';
import chalk from 'chalk';
import { TemplateRegistry } from '../templates/registry.js';

/**
 * List command handler
 * Displays all available templates with descriptions and options
 */
export async function listCommand(registry: TemplateRegistry): Promise<void> {
  const templates = registry.getAllTemplates();

  if (templates.length === 0) {
    console.log(chalk.yellow('No templates available.'));
    return;
  }

  console.log();
  console.log(chalk.cyan.bold('Available Templates:'));
  console.log();

  // Create table for templates
  const table = new Table({
    head: [
      chalk.white.bold('Template'),
      chalk.white.bold('Description'),
      chalk.white.bold('Options'),
    ],
    colWidths: [20, 40, 30],
    wordWrap: true,
    style: {
      head: [],
      border: ['gray'],
    },
  });

  // Add each template to the table
  for (const template of templates) {
    const optionsText =
      template.options.length > 0
        ? template.options.map((opt) => `--${opt.flag}`).join('\n')
        : chalk.gray('None');

    table.push([
      chalk.cyan(template.name),
      template.description,
      optionsText,
    ]);
  }

  console.log(table.toString());
  console.log();

  // Display detailed options for templates that have them
  const templatesWithOptions = templates.filter((t) => t.options.length > 0);
  if (templatesWithOptions.length > 0) {
    console.log(chalk.cyan.bold('Template Options:'));
    console.log();

    for (const template of templatesWithOptions) {
      console.log(chalk.yellow(`${template.name}:`));
      for (const option of template.options) {
        console.log(
          chalk.gray('  --' + option.flag.padEnd(20)),
          option.description
        );
        if (option.defaultValue !== undefined) {
          console.log(
            chalk.gray('    Default:'),
            chalk.white(option.defaultValue)
          );
        }
      }
      console.log();
    }
  }

  // Display usage examples
  console.log(chalk.cyan.bold('Usage Examples:'));
  console.log();
  console.log(
    chalk.gray('  # Interactive mode')
  );
  console.log(
    chalk.white('  $ sol-anchor-gen init')
  );
  console.log();
  console.log(
    chalk.gray('  # Generate specific template')
  );
  console.log(
    chalk.white('  $ sol-anchor-gen new --template nft-minting my-nft-project')
  );
  console.log();
  console.log(
    chalk.gray('  # With custom options')
  );
  console.log(
    chalk.white('  $ sol-anchor-gen new --template staking --token-decimals 9 my-staking')
  );
  console.log();
}
