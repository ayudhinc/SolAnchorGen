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
 * Template generator interface (forward declaration)
 */
export interface TemplateGenerator {
  generate(context: any): Promise<any[]>;
  getDependencies(context: any): Record<string, string>;
  getDevDependencies(context: any): Record<string, string>;
}

/**
 * Template metadata interface
 */
export interface Template {
  id: string;
  name: string;
  description: string;
  options: TemplateOption[];
  generator: TemplateGenerator;
}

/**
 * Template Registry class
 * Manages the catalog of available templates
 */
export class TemplateRegistry {
  private templates: Map<string, Template> = new Map();

  /**
   * Registers a template in the registry
   */
  registerTemplate(template: Template): void {
    if (this.templates.has(template.id)) {
      throw new Error(`Template with id "${template.id}" is already registered`);
    }
    this.templates.set(template.id, template);
  }

  /**
   * Retrieves a template by its ID
   * Returns undefined if template is not found
   */
  getTemplate(id: string): Template | undefined {
    return this.templates.get(id);
  }

  /**
   * Retrieves all registered templates
   */
  getAllTemplates(): Template[] {
    return Array.from(this.templates.values());
  }

  /**
   * Retrieves the configuration options for a specific template
   * Returns an empty array if template is not found
   */
  getTemplateOptions(id: string): TemplateOption[] {
    const template = this.templates.get(id);
    return template ? template.options : [];
  }

  /**
   * Checks if a template exists in the registry
   */
  hasTemplate(id: string): boolean {
    return this.templates.has(id);
  }

  /**
   * Gets the count of registered templates
   */
  getTemplateCount(): number {
    return this.templates.size;
  }

  /**
   * Clears all registered templates (useful for testing)
   */
  clear(): void {
    this.templates.clear();
  }
}

/**
 * Default registry instance
 */
export const registry = new TemplateRegistry();
