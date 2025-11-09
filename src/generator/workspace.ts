import { resolve } from 'path';
import { Template } from '../templates/registry.js';
import { GeneratorContext, GeneratedFile } from '../templates/generator.js';
import { FileSystemWriter } from '../utils/fs-writer.js';
import { PackageManager } from '../utils/package-manager.js';
import { ProgressReporter } from '../utils/progress.js';
import { rmSync } from 'fs';

/**
 * Workspace configuration interface
 */
export interface WorkspaceConfig {
  projectName: string;
  projectPath: string;
  template: Template;
  options: Record<string, any>;
}

/**
 * Workspace Generator class
 * Orchestrates the complete workspace generation process
 */
export class WorkspaceGenerator {
  private fsWriter: FileSystemWriter;
  private packageManager: PackageManager;
  private progressReporter: ProgressReporter;

  constructor(
    fsWriter: FileSystemWriter,
    packageManager: PackageManager,
    progressReporter: ProgressReporter
  ) {
    this.fsWriter = fsWriter;
    this.packageManager = packageManager;
    this.progressReporter = progressReporter;
  }

  /**
   * Generates a complete Anchor workspace
   */
  async generate(config: WorkspaceConfig): Promise<void> {
    const { projectName, projectPath, template, options } = config;

    try {
      // Step 1: Create directory structure
      this.progressReporter.startStep('Creating project directory...');
      await this.createDirectoryStructure(projectPath);
      this.progressReporter.completeStep('Created project directory');

      // Step 2: Generate files from template
      this.progressReporter.startStep('Generating template files...');
      const context: GeneratorContext = {
        projectName,
        projectPath,
        options,
      };
      const files = await template.generator.generate(context);
      await this.generateFiles(files);
      this.progressReporter.completeStep('Generated template files');

      // Step 3: Generate Anchor.toml
      this.progressReporter.startStep('Creating Anchor configuration...');
      await this.generateAnchorConfig(config);
      this.progressReporter.completeStep('Created Anchor.toml');

      // Step 4: Generate package.json
      this.progressReporter.startStep('Creating package.json...');
      await this.generatePackageJson(config);
      this.progressReporter.completeStep('Created package.json');

      // Step 5: Install dependencies
      this.progressReporter.startStep('Installing dependencies with pnpm...');
      await this.installDependencies(projectPath);
      this.progressReporter.completeStep('Installed dependencies');

    } catch (error) {
      // Cleanup on failure
      await this.cleanupPartialGeneration(projectPath);
      throw error;
    }
  }

  /**
   * Creates the Anchor workspace directory structure
   */
  private async createDirectoryStructure(path: string): Promise<void> {
    const directories = [
      path,
      resolve(path, 'programs'),
      resolve(path, 'tests'),
      resolve(path, 'app'),
      resolve(path, 'migrations'),
      resolve(path, 'target'),
    ];

    for (const dir of directories) {
      await this.fsWriter.ensureDirectory(dir);
    }
  }

  /**
   * Writes all generated files to disk
   */
  private async generateFiles(files: GeneratedFile[]): Promise<void> {
    for (const file of files) {
      await this.fsWriter.writeFile(file.path, file.content);
    }
  }

  /**
   * Generates the Anchor.toml configuration file
   */
  private async generateAnchorConfig(config: WorkspaceConfig): Promise<void> {
    const { projectName, projectPath } = config;
    
    const anchorToml = `[toolchain]

[features]
seeds = false
skip-lint = false

[programs.localnet]
${projectName.replace(/-/g, '_')} = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "pnpm exec ts-node -r tsconfig-paths/register tests/**/*.ts"
`;

    const anchorTomlPath = resolve(projectPath, 'Anchor.toml');
    await this.fsWriter.writeFile(anchorTomlPath, anchorToml);
  }

  /**
   * Generates the package.json file with dependencies
   */
  private async generatePackageJson(config: WorkspaceConfig): Promise<void> {
    const { projectName, projectPath, template, options } = config;

    const context: GeneratorContext = {
      projectName,
      projectPath,
      options,
    };

    const dependencies = template.generator.getDependencies(context);
    const devDependencies = template.generator.getDevDependencies(context);

    const packageJson = {
      name: projectName,
      version: '0.1.0',
      description: `Anchor program generated with SolAnchorGen`,
      scripts: {
        build: 'anchor build',
        test: 'anchor test',
        deploy: 'anchor deploy',
        'test:unit': 'ts-node tests/**/*.ts',
      },
      dependencies,
      devDependencies,
      keywords: ['solana', 'anchor', 'blockchain'],
      author: '',
      license: 'MIT',
    };

    const packageJsonPath = resolve(projectPath, 'package.json');
    await this.fsWriter.writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2)
    );
  }

  /**
   * Installs dependencies using pnpm
   */
  private async installDependencies(projectPath: string): Promise<void> {
    await this.packageManager.installDependencies(projectPath);
  }

  /**
   * Cleans up partially generated files on failure
   */
  private async cleanupPartialGeneration(projectPath: string): Promise<void> {
    try {
      if (await this.fsWriter.pathExists(projectPath)) {
        rmSync(projectPath, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
      console.error('Warning: Failed to cleanup partial generation:', error);
    }
  }
}

/**
 * Creates a workspace generator with default dependencies
 */
export function createWorkspaceGenerator(): WorkspaceGenerator {
  const fsWriter = new FileSystemWriter();
  const packageManager = new PackageManager();
  const progressReporter = new ProgressReporter();

  return new WorkspaceGenerator(fsWriter, packageManager, progressReporter);
}
