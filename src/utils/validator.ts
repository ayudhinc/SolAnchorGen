import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Template registry interface for validation
 */
interface TemplateRegistry {
  getTemplate(id: string): any;
  getAllTemplates(): any[];
}

/**
 * Template option interface for validation
 */
interface TemplateOption {
  name: string;
  type: 'string' | 'number' | 'boolean';
  validate?: (value: any) => boolean;
}

/**
 * Validator class for input validation
 */
export class Validator {
  /**
   * Validates a project name
   * Returns true if valid, or an error message string if invalid
   */
  validateProjectName(name: string): boolean | string {
    if (!name || name.trim().length === 0) {
      return 'Project name cannot be empty';
    }

    // Check for valid characters (alphanumeric, hyphens, underscores)
    const validNamePattern = /^[a-zA-Z0-9_-]+$/;
    if (!validNamePattern.test(name)) {
      return 'Project name can only contain letters, numbers, hyphens, and underscores';
    }

    // Check if name starts with a letter
    if (!/^[a-zA-Z]/.test(name)) {
      return 'Project name must start with a letter';
    }

    // Check length
    if (name.length > 50) {
      return 'Project name must be 50 characters or less';
    }

    // Check for reserved names
    const reservedNames = ['node_modules', 'test', 'dist', 'build', '.git'];
    if (reservedNames.includes(name.toLowerCase())) {
      return `Project name "${name}" is reserved and cannot be used`;
    }

    // Check if directory already exists
    const projectPath = resolve(process.cwd(), name);
    if (existsSync(projectPath)) {
      return `Directory "${name}" already exists in the current location`;
    }

    return true;
  }

  /**
   * Validates a template name against the registry
   * Returns true if valid, or an error message string if invalid
   */
  validateTemplateName(
    name: string,
    registry: TemplateRegistry
  ): boolean | string {
    if (!name || name.trim().length === 0) {
      return 'Template name cannot be empty';
    }

    const template = registry.getTemplate(name);
    if (!template) {
      const availableTemplates = registry
        .getAllTemplates()
        .map((t) => t.id)
        .join(', ');
      return `Template "${name}" not found. Available templates: ${availableTemplates}`;
    }

    return true;
  }

  /**
   * Validates an option value based on the template option configuration
   * Returns true if valid, or an error message string if invalid
   */
  validateOptionValue(value: any, option: TemplateOption): boolean | string {
    // Check if value is provided
    if (value === undefined || value === null) {
      return `Value for option "${option.name}" is required`;
    }

    // Type validation
    switch (option.type) {
      case 'string':
        if (typeof value !== 'string') {
          return `Option "${option.name}" must be a string`;
        }
        if (value.trim().length === 0) {
          return `Option "${option.name}" cannot be empty`;
        }
        break;

      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          return `Option "${option.name}" must be a valid number`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Option "${option.name}" must be a boolean`;
        }
        break;
    }

    // Custom validation if provided
    if (option.validate) {
      const result = option.validate(value);
      if (result === false) {
        return `Invalid value for option "${option.name}"`;
      }
    }

    return true;
  }

  /**
   * Validates a file system path
   * Returns true if valid, or an error message string if invalid
   */
  validatePath(path: string): boolean | string {
    if (!path || path.trim().length === 0) {
      return 'Path cannot be empty';
    }

    // Check for invalid characters
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(path)) {
      return 'Path contains invalid characters';
    }

    // Check for absolute path attempts with suspicious patterns
    if (path.includes('..')) {
      return 'Path cannot contain ".." (parent directory references)';
    }

    return true;
  }

  /**
   * Validates that pnpm is installed
   * Returns true if installed, or an error message if not
   */
  validatePnpmInstalled(): boolean | string {
    try {
      const { execSync } = require('child_process');
      execSync('pnpm --version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return 'pnpm is not installed. Install it with: npm install -g pnpm';
    }
  }
}

/**
 * Default validator instance
 */
export const validator = new Validator();
