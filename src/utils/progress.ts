import ora, { Ora } from 'ora';
import chalk from 'chalk';

/**
 * Progress step status
 */
export type ProgressStatus = 'pending' | 'in-progress' | 'complete' | 'error';

/**
 * Progress step interface
 */
export interface ProgressStep {
  message: string;
  status: ProgressStatus;
}

/**
 * Progress Reporter class
 * Provides visual feedback during generation process
 */
export class ProgressReporter {
  private spinner: Ora | null = null;
  private currentStep: string | null = null;

  /**
   * Starts a new progress step with a spinner
   */
  startStep(message: string): void {
    // Stop any existing spinner
    if (this.spinner) {
      this.spinner.stop();
    }

    this.currentStep = message;
    this.spinner = ora({
      text: message,
      color: 'cyan',
    }).start();
  }

  /**
   * Completes the current step with a success indicator
   */
  completeStep(message?: string): void {
    if (this.spinner) {
      this.spinner.succeed(message || this.currentStep || 'Done');
      this.spinner = null;
      this.currentStep = null;
    }
  }

  /**
   * Marks the current step as failed with an error indicator
   */
  failStep(error: string): void {
    if (this.spinner) {
      this.spinner.fail(error);
      this.spinner = null;
      this.currentStep = null;
    }
  }

  /**
   * Updates the text of the current spinner
   */
  updateStep(message: string): void {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  /**
   * Stops the current spinner without marking it as complete or failed
   */
  stopStep(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
      this.currentStep = null;
    }
  }

  /**
   * Displays a success message with checkmark
   */
  success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  /**
   * Displays an error message with X mark
   */
  error(message: string): void {
    console.log(chalk.red('✗'), message);
  }

  /**
   * Displays an info message with info icon
   */
  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  /**
   * Displays a warning message with warning icon
   */
  warning(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }

  /**
   * Displays a summary after generation is complete
   */
  displaySummary(projectName: string, nextSteps: string[]): void {
    console.log();
    console.log(chalk.green.bold('✓ Success!'), `Project "${projectName}" has been created!`);
    console.log();

    if (nextSteps.length > 0) {
      console.log(chalk.cyan.bold('Next steps:'));
      nextSteps.forEach((step, index) => {
        console.log(chalk.gray(`  ${index + 1}.`), step);
      });
      console.log();
    }
  }

  /**
   * Displays an error summary
   */
  displayErrorSummary(error: string, suggestions?: string[]): void {
    console.log();
    console.log(chalk.red.bold('✗ Error:'), error);
    console.log();

    if (suggestions && suggestions.length > 0) {
      console.log(chalk.yellow.bold('Suggestions:'));
      suggestions.forEach((suggestion) => {
        console.log(chalk.gray('  •'), suggestion);
      });
      console.log();
    }
  }

  /**
   * Displays a list of items
   */
  displayList(title: string, items: string[]): void {
    console.log();
    console.log(chalk.cyan.bold(title));
    items.forEach((item) => {
      console.log(chalk.gray('  •'), item);
    });
    console.log();
  }

  /**
   * Displays a separator line
   */
  displaySeparator(): void {
    console.log(chalk.gray('─'.repeat(60)));
  }

  /**
   * Clears the console
   */
  clear(): void {
    console.clear();
  }

  /**
   * Displays a blank line
   */
  newLine(): void {
    console.log();
  }
}

/**
 * Default progress reporter instance
 */
export const progressReporter = new ProgressReporter();
