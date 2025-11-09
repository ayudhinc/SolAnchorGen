import { resolve } from 'path';
import chalk from 'chalk';
import { TemplateRegistry } from '../templates/registry.js';
import { WorkspaceGenerator } from '../generator/workspace.js';
import { Validator } from '../utils/validator.js';
import { ProgressReporter } from '../utils/progress.js';

/**
 * New command options interface
 */
export interface NewCommandOptions {
  template: string;
  tokenDecimals?: number;
  // Additional template-specific options can be added here
  [key: string]: any;
}

/**
 * New command handler
 * Handles direct template generation with command-line arguments
 */
export async function newCommand(
  projectName: string,
  options: NewCommandOptions,
  registry: TemplateRegistry,
  workspaceGenerator: WorkspaceGenerator,
  validator: Validator,
  progressReporter: ProgressReporter
): Promise<void> {
  try {
    console.log();
    console.log(chalk.cyan.bold('🚀 Generate New Anchor Project'));
    console.log();

    // Step 1: Validate project name
    const nameValidation = validator.validateProjectName(projectName);
    if (nameValidation !== true) {
      throw new Error(String(nameValidation));
    }

    // Step 2: Validate template name
    const templateValidation = validator.validateTemplateName(
      options.template,
      registry
    );
    if (templateValidation !== true) {
      throw new Error(String(templateValidation));
    }

    // Step 3: Get the template
    const template = registry.getTemplate(options.template);
    if (!template) {
      throw new Error(`Template "${options.template}" not found`);
    }

    // Step 4: Extract and validate template-specific options
    const templateOptions = extractTemplateOptions(options, template.options);

    // Validate each option
    for (const templateOption of template.options) {
      const value = templateOptions[templateOption.name];
      if (value !== undefined) {
        const optionValidation = validator.validateOptionValue(
          value,
          templateOption
        );
        if (optionValidation !== true) {
          throw new Error(String(optionValidation));
        }
      }
    }

    // Step 5: Resolve project path
    const projectPath = resolve(process.cwd(), projectName);

    // Step 6: Display summary
    console.log(chalk.cyan('Project Summary:'));
    console.log(chalk.gray('  Name:'), chalk.white(projectName));
    console.log(chalk.gray('  Template:'), chalk.white(template.name));
    console.log(chalk.gray('  Path:'), chalk.white(projectPath));
    if (Object.keys(templateOptions).length > 0) {
      console.log(chalk.gray('  Options:'));
      for (const [key, value] of Object.entries(templateOptions)) {
        console.log(chalk.gray(`    ${key}:`), chalk.white(value));
      }
    }
    console.log();

    // Step 7: Generate workspace
    progressReporter.startStep('Starting project generation...');
    await workspaceGenerator.generate({
      projectName,
      projectPath,
      template,
      options: templateOptions,
    });

    // Step 8: Display success message with next steps
    const nextSteps = [
      `cd ${projectName}`,
      'anchor build',
      'anchor test',
    ];
    progressReporter.displaySummary(projectName, nextSteps);

    console.log(chalk.green('Happy coding! 🎉'));
    console.log();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    // Check if it's a template not found error
    if (errorMessage.includes('not found')) {
      const availableTemplates = registry
        .getAllTemplates()
        .map((t) => t.id)
        .join(', ');

      progressReporter.displayErrorSummary(errorMessage, [
        `Available templates: ${availableTemplates}`,
        'Use "sol-anchor-gen list" to see all templates with descriptions',
      ]);
    } else {
      progressReporter.displayErrorSummary(errorMessage, [
        'Check that the project name is valid',
        'Ensure pnpm is installed: npm install -g pnpm',
        'Make sure the directory does not already exist',
        'Verify template options are correct',
      ]);
    }

    process.exit(1);
  }
}

/**
 * Extracts template-specific options from command options
 */
function extractTemplateOptions(
  commandOptions: NewCommandOptions,
  templateOptions: Array<{ name: string; flag: string; type: string }>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const templateOption of templateOptions) {
    // Check if the option was provided in command options
    // Try both camelCase and kebab-case versions
    const camelCaseKey = templateOption.name;
    const kebabCaseKey = templateOption.flag;

    let value = commandOptions[camelCaseKey] || commandOptions[kebabCaseKey];

    if (value !== undefined) {
      // Convert to appropriate type
      if (templateOption.type === 'number') {
        value = Number(value);
      } else if (templateOption.type === 'boolean') {
        value = Boolean(value);
      }

      result[templateOption.name] = value;
    }
  }

  return result;
}
