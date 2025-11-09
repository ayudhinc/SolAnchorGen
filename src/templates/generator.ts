/**
 * Generator context interface
 * Contains all information needed to generate a template
 */
export interface GeneratorContext {
  projectName: string;
  projectPath: string;
  options: Record<string, any>;
}

/**
 * Generated file interface
 * Represents a file to be created in the workspace
 */
export interface GeneratedFile {
  path: string;
  content: string;
}

/**
 * Dependencies type
 * Maps package names to version strings
 */
export type Dependencies = Record<string, string>;

/**
 * Template Generator interface
 * Defines the contract that all template implementations must follow
 * 
 * Each template generator is responsible for:
 * - Generating all necessary files (program code, tests, SDK, documentation)
 * - Specifying runtime dependencies
 * - Specifying development dependencies
 * 
 * Example implementation:
 * ```typescript
 * export class MyTemplateGenerator implements TemplateGenerator {
 *   async generate(context: GeneratorContext): Promise<GeneratedFile[]> {
 *     return [
 *       { path: 'programs/my-program/src/lib.rs', content: '...' },
 *       { path: 'tests/my-program.ts', content: '...' },
 *       // ... more files
 *     ];
 *   }
 * 
 *   getDependencies(context: GeneratorContext): Dependencies {
 *     return {
 *       '@coral-xyz/anchor': '^0.29.0',
 *       '@solana/web3.js': '^1.87.0',
 *     };
 *   }
 * 
 *   getDevDependencies(context: GeneratorContext): Dependencies {
 *     return {
 *       '@types/node': '^20.0.0',
 *       'typescript': '^5.0.0',
 *     };
 *   }
 * }
 * ```
 */
export interface TemplateGenerator {
  /**
   * Generates all files for the template
   * 
   * @param context - The generation context with project details and options
   * @returns Array of generated files with paths and content
   */
  generate(context: GeneratorContext): Promise<GeneratedFile[]>;

  /**
   * Returns the runtime dependencies for the template
   * 
   * @param context - The generation context (may affect dependency versions)
   * @returns Object mapping package names to version strings
   */
  getDependencies(context: GeneratorContext): Dependencies;

  /**
   * Returns the development dependencies for the template
   * 
   * @param context - The generation context (may affect dependency versions)
   * @returns Object mapping package names to version strings
   */
  getDevDependencies(context: GeneratorContext): Dependencies;
}

/**
 * Base template generator class
 * Provides common functionality for template implementations
 */
export abstract class BaseTemplateGenerator implements TemplateGenerator {
  abstract generate(context: GeneratorContext): Promise<GeneratedFile[]>;

  /**
   * Default dependencies for Anchor projects
   */
  getDependencies(context: GeneratorContext): Dependencies {
    return {
      '@coral-xyz/anchor': '^0.29.0',
      '@solana/web3.js': '^1.87.0',
    };
  }

  /**
   * Default dev dependencies for Anchor projects
   */
  getDevDependencies(context: GeneratorContext): Dependencies {
    return {
      '@types/node': '^20.0.0',
      'typescript': '^5.3.0',
      'ts-node': '^10.9.0',
      'chai': '^4.3.0',
      '@types/chai': '^4.3.0',
    };
  }

  /**
   * Helper method to create a generated file
   */
  protected createFile(path: string, content: string): GeneratedFile {
    return { path, content };
  }

  /**
   * Helper method to replace placeholders in template content
   */
  protected replacePlaceholders(
    content: string,
    replacements: Record<string, string>
  ): string {
    let result = content;
    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }
}
