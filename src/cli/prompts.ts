import inquirer from 'inquirer';

/**
 * Prompt question interface
 */
export interface PromptQuestion {
  type: string;
  name: string;
  message: string;
  choices?: string[] | { name: string; value: string }[];
  validate?: (input: any) => boolean | string;
  default?: any;
}

/**
 * Template interface for prompts
 */
export interface Template {
  id: string;
  name: string;
  description: string;
  options: TemplateOption[];
}

/**
 * Template option interface
 */
export interface TemplateOption {
  name: string;
  flag: string;
  description: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue?: any;
  validate?: (value: any) => boolean;
}

/**
 * Prompts the user with a set of questions
 */
export async function promptUser(questions: PromptQuestion[]): Promise<any> {
  return await inquirer.prompt(questions);
}

/**
 * Prompts the user to select a template
 */
export async function promptForTemplate(templates: Template[]): Promise<string> {
  const choices = templates.map(template => ({
    name: `${template.name} - ${template.description}`,
    value: template.id,
  }));

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'template',
      message: 'Select a template:',
      choices,
    },
  ]);

  return answer.template;
}

/**
 * Prompts the user for template-specific options
 */
export async function promptForTemplateOptions(
  template: Template
): Promise<Record<string, any>> {
  if (template.options.length === 0) {
    return {};
  }

  const questions: PromptQuestion[] = template.options.map(option => {
    const question: PromptQuestion = {
      type: option.type === 'boolean' ? 'confirm' : 'input',
      name: option.name,
      message: option.description,
      default: option.defaultValue,
    };

    // Add validation if provided
    if (option.validate) {
      question.validate = (input: any) => {
        if (option.type === 'number') {
          const num = Number(input);
          if (isNaN(num)) {
            return 'Please enter a valid number';
          }
          return option.validate!(num);
        }
        return option.validate!(input);
      };
    }

    return question;
  });

  const answers = await inquirer.prompt(questions);

  // Convert string inputs to appropriate types
  const result: Record<string, any> = {};
  for (const option of template.options) {
    const value = answers[option.name];
    if (option.type === 'number' && typeof value === 'string') {
      result[option.name] = Number(value);
    } else {
      result[option.name] = value;
    }
  }

  return result;
}

/**
 * Prompts the user for a project name with validation
 */
export async function promptForProjectName(
  validate?: (name: string) => boolean | string
): Promise<string> {
  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Enter project name:',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Project name cannot be empty';
        }
        if (validate) {
          return validate(input);
        }
        return true;
      },
    },
  ]);

  return answer.projectName;
}
