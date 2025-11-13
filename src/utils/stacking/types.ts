/**
 * Stacking backend abstraction types.
 *
 * This module defines the interface for stacking backends (git-spice, graphite, etc.)
 * that organize task branches into stacks. Follows selective abstraction per constitution.
 *
 * @module utils/stacking/types
 */

/**
 * Stacking backend interface for organizing task branches.
 *
 * Implementations provide backend-specific logic for stacking branches
 * in a linear chain (e.g., task-1 → task-2 → task-3).
 */
export interface StackingBackend {
  /**
   * Stack branches in linear order onto base branch.
   *
   * Each branch is stacked onto the previous one:
   * - branches[0] → baseRef
   * - branches[1] → branches[0]
   * - branches[2] → branches[1]
   *
   * @param branches - Array of branch names to stack (in order)
   * @param baseRef - Base branch to stack first branch onto
   * @param workingDirectory - Directory to execute stacking commands in
   * @throws {Error} If stacking command fails
   */
  stackBranches(branches: string[], baseRef: string, workingDirectory: string): Promise<void>;

  /**
   * Detect if this backend is available in the current environment.
   *
   * Checks if the backend's CLI tool is installed and accessible.
   *
   * @returns Promise resolving to true if backend is available
   */
  detectBackend(): Promise<boolean>;

  /**
   * Backend name (e.g., "git-spice", "graphite", "gh-stack")
   */
  readonly name: string;
}
