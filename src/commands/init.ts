import { resolve } from 'path';
import chalk from 'chalk';
import { TemplateRegistry } from '../templates/registry.js';
import { WorkspaceGenerator } from '../generator/workspace.js';
import { Validator } from '../utils/validator.js';
import { ProgressReporter } from '../utils/progress.js';
import {
  promptForProjectName,
  promptForTemplate,
  promptForTemplateOptions,
} from '../cli/prompts.js';

/**
 * Init command options interface
 */
export interface InitOptions {
  // No options - fully interactive
}

/**
 * Init command handler
 * Handles interactive project initialization with user prompts
 */
export async function initCommand(
  registry: TemplateRegistry,
  workspaceGenerator: WorkspaceGenerator,
  validator: Validator,
  progressReporter: ProgressReporter
): Promise<void> {
  try {
    console.log();
    console.log(chalk.cyan.bold('🚀 Initialize New Anchor Project'));
    console.log();

    // Step 1: Prompt for project details
    const { projectName, templateId, options } = await promptForProjectDetails(
      registry,
      validator
    );

    // Step 2: Get the selected template
    const template = registry.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    // Step 3: Resolve project path
    const projectPath = resolve(process.cwd(), projectName);

    // Step 4: Display summary
    console.log();
    console.log(chalk.cyan('Project Summary:'));
    console.log(chalk.gray('  Name:'), chalk.white(projectName));
    console.log(chalk.gray('  Template:'), chalk.white(template.name));
    console.log(chalk.gray('  Path:'), chalk.white(projectPath));
    if (Object.keys(options).length > 0) {
      console.log(chalk.gray('  Options:'));
      for (const [key, value] of Object.entries(options)) {
        console.log(chalk.gray(`    ${key}:`), chalk.white(value));
      }
    }
    console.log();

    // Step 5: Generate workspace
    progressReporter.startStep('Starting project generation...');
    await workspaceGenerator.generate({
      projectName,
      projectPath,
      template,
      options,
    });

    // Step 6: Display success message with next steps
    const nextSteps = [
      `cd ${projectName}`,
      'anchor build',
      'anchor test',
    ];
    progressReporter.displaySummary(projectName, nextSteps);

    console.log(chalk.green('Happy coding! 🎉'));
    console.log();
  } catch (error) {
    progressReporter.displayErrorSummary(
      error instanceof Error ? error.message : 'Unknown error occurred',
      [
        'Check that the project name is valid',
        'Ensure pnpm is installed: npm install -g pnpm',
        'Make sure the directory does not already exist',
      ]
    );
    process.exit(1);
  }
}

/**
 * Prompts the user for all project details
 */
async function promptForProjectDetails(
  registry: TemplateRegistry,
  validator: Validator
): Promise<{
  projectName: string;
  templateId: string;
  options: Record<string, any>;
}> {
  // Prompt for project name
  const projectName = await promptForProjectName((name: string) => {
    return validator.validateProjectName(name);
  });

  // Get all available templates
  const templates = registry.getAllTemplates();
  if (templates.length === 0) {
    throw new Error('No templates available');
  }

  // Prompt for template selection
  const templateId = await promptForTemplate(templates);

  // Get the selected template
  const template = registry.getTemplate(templateId);
  if (!template) {
    throw new Error(`Template "${templateId}" not found`);
  }

  // Prompt for template-specific options
  const options = await promptForTemplateOptions(template);

  return {
    projectName,
    templateId,
    options,
  };
}
