import { mkdir, writeFile, copyFile, access, constants } from 'fs/promises';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

/**
 * File System Writer class
 * Handles all file system operations with proper error handling
 */
export class FileSystemWriter {
  /**
   * Creates a directory at the specified path
   * Throws an error if the operation fails
   */
  async createDirectory(path: string): Promise<void> {
    try {
      await mkdir(path, { recursive: false });
    } catch (error) {
      throw new Error(
        `Failed to create directory at ${path}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Writes content to a file at the specified path
   * Creates parent directories if they don't exist
   */
  async writeFile(path: string, content: string): Promise<void> {
    try {
      // Ensure parent directory exists
      const dir = dirname(path);
      await this.ensureDirectory(dir);

      // Write the file with UTF-8 encoding
      await writeFile(path, content, { encoding: 'utf-8' });
    } catch (error) {
      throw new Error(
        `Failed to write file at ${path}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Copies a file from source to destination
   * Creates parent directories if they don't exist
   */
  async copyFile(source: string, destination: string): Promise<void> {
    try {
      // Ensure parent directory exists
      const dir = dirname(destination);
      await this.ensureDirectory(dir);

      // Copy the file
      await copyFile(source, destination);
    } catch (error) {
      throw new Error(
        `Failed to copy file from ${source} to ${destination}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Checks if a path exists (file or directory)
   */
  async pathExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Synchronously checks if a path exists
   */
  pathExistsSync(path: string): boolean {
    return existsSync(path);
  }

  /**
   * Ensures a directory exists, creating it and any parent directories if needed
   */
  async ensureDirectory(path: string): Promise<void> {
    try {
      await mkdir(path, { recursive: true });
    } catch (error) {
      throw new Error(
        `Failed to ensure directory at ${path}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Resolves a path relative to the current working directory
   */
  resolvePath(...paths: string[]): string {
    return resolve(process.cwd(), ...paths);
  }

  /**
   * Writes multiple files in batch
   * Returns the number of files successfully written
   */
  async writeFiles(
    files: Array<{ path: string; content: string }>
  ): Promise<number> {
    let successCount = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        await this.writeFile(file.path, file.content);
        successCount++;
      } catch (error) {
        errors.push(
          `${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to write ${errors.length} file(s):\n${errors.join('\n')}`
      );
    }

    return successCount;
  }
}

/**
 * Default file system writer instance
 */
export const fsWriter = new FileSystemWriter();
