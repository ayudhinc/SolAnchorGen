import { execSync, spawn } from 'child_process';
import { resolve } from 'path';

/**
 * Package Manager class
 * Manages pnpm operations and dependency installation
 */
export class PackageManager {
  /**
   * Checks if pnpm is installed on the system
   * Returns true if installed, false otherwise
   */
  async checkPnpmInstalled(): Promise<boolean> {
    try {
      execSync('pnpm --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Synchronously checks if pnpm is installed
   */
  checkPnpmInstalledSync(): boolean {
    try {
      execSync('pnpm --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Installs dependencies in the specified project directory
   * Throws an error if installation fails
   */
  async installDependencies(projectPath: string): Promise<void> {
    // First check if pnpm is installed
    const isPnpmInstalled = await this.checkPnpmInstalled();
    if (!isPnpmInstalled) {
      throw new Error(
        'pnpm is not installed. Install it with: npm install -g pnpm'
      );
    }

    return new Promise((resolve, reject) => {
      const absolutePath = this.resolveProjectPath(projectPath);

      // Spawn pnpm install process
      const child = spawn('pnpm', ['install'], {
        cwd: absolutePath,
        stdio: 'inherit',
        shell: true,
      });

      child.on('error', (error) => {
        reject(
          new Error(`Failed to install dependencies: ${error.message}`)
        );
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `pnpm install exited with code ${code}. Check the output above for details.`
            )
          );
        }
      });
    });
  }

  /**
   * Adds a single dependency to the project
   */
  async addDependency(
    projectPath: string,
    packageName: string,
    version: string
  ): Promise<void> {
    const isPnpmInstalled = await this.checkPnpmInstalled();
    if (!isPnpmInstalled) {
      throw new Error(
        'pnpm is not installed. Install it with: npm install -g pnpm'
      );
    }

    return new Promise((resolve, reject) => {
      const absolutePath = this.resolveProjectPath(projectPath);
      const packageSpec = `${packageName}@${version}`;

      const child = spawn('pnpm', ['add', packageSpec], {
        cwd: absolutePath,
        stdio: 'inherit',
        shell: true,
      });

      child.on('error', (error) => {
        reject(
          new Error(
            `Failed to add dependency ${packageSpec}: ${error.message}`
          )
        );
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `pnpm add ${packageSpec} exited with code ${code}`
            )
          );
        }
      });
    });
  }

  /**
   * Returns the install command string for documentation
   */
  getInstallCommand(): string {
    return 'pnpm install';
  }

  /**
   * Returns the build command string for documentation
   */
  getBuildCommand(): string {
    return 'pnpm build';
  }

  /**
   * Returns the test command string for documentation
   */
  getTestCommand(): string {
    return 'pnpm test';
  }

  /**
   * Gets the pnpm version
   */
  async getPnpmVersion(): Promise<string | null> {
    try {
      const version = execSync('pnpm --version', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return version.trim();
    } catch {
      return null;
    }
  }

  /**
   * Resolves the project path to an absolute path
   */
  private resolveProjectPath(projectPath: string): string {
    if (resolve(projectPath) === projectPath) {
      // Already absolute
      return projectPath;
    }
    // Relative path
    return resolve(process.cwd(), projectPath);
  }

  /**
   * Gets installation instructions for pnpm
   */
  getInstallInstructions(): string {
    return `
pnpm is not installed. Please install it using one of these methods:

  npm install -g pnpm
  
Or visit: https://pnpm.io/installation
`;
  }
}

/**
 * Default package manager instance
 */
export const packageManager = new PackageManager();
