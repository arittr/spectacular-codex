/**
 * Git-spice stacking backend implementation.
 *
 * Uses git-spice (gs) CLI for branch stacking operations.
 * Implements the StackingBackend interface with git-spice specific commands.
 *
 * @module utils/stacking/git-spice
 */

import { execa } from 'execa';
import type { StackingBackend } from './types';

/**
 * Git-spice backend for branch stacking.
 *
 * Stacks branches using `gs upstack onto` command. Requires git-spice
 * to be installed and accessible in PATH.
 */
export class GitSpiceBackend implements StackingBackend {
  readonly name = 'git-spice';

  /**
   * Detect if git-spice is available.
   *
   * Checks if `gs` command exists by running `gs --version`.
   *
   * @returns Promise resolving to true if gs is available
   */
  async detectBackend(): Promise<boolean> {
    try {
      await execa('gs', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stack branches in linear order using git-spice.
   *
   * For each branch:
   * 1. Checkout branch
   * 2. Run `gs upstack onto <base>` to stack onto previous branch
   *
   * Example:
   * - branches[0] → baseRef (main)
   * - branches[1] → branches[0]
   * - branches[2] → branches[1]
   *
   * @param branches - Array of branch names to stack (in order)
   * @param baseRef - Base branch to stack first branch onto
   * @param workingDirectory - Directory to execute git commands in
   * @throws {Error} If git or gs command fails
   */
  async stackBranches(
    branches: string[],
    baseRef: string,
    workingDirectory: string
  ): Promise<void> {
    if (branches.length === 0) {
      return;
    }

    // Stack first branch onto baseRef
    let previousBranch = baseRef;

    for (const branch of branches) {
      // Checkout the branch
      await execa('git', ['checkout', branch], {
        cwd: workingDirectory,
      });

      // Stack onto previous branch using gs upstack onto
      await execa('gs', ['upstack', 'onto', previousBranch], {
        cwd: workingDirectory,
      });

      // Next branch stacks onto this one
      previousBranch = branch;
    }
  }
}
