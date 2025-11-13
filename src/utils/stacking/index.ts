/**
 * Stacking backend factory.
 *
 * Provides factory function to get the configured stacking backend.
 * In v1, only git-spice is supported. Future versions may add graphite, gh-stack.
 *
 * @module utils/stacking
 */

import { GitSpiceBackend } from '@/utils/stacking/git-spice';
import type { StackingBackend } from '@/utils/stacking/types';

/**
 * Get the configured stacking backend.
 *
 * Backend selection:
 * 1. Check STACKING_BACKEND env var
 * 2. Default to git-spice if not set
 *
 * In v1, only git-spice is supported. Other backends will be added in future versions.
 *
 * @returns Promise resolving to configured stacking backend
 * @throws {Error} If backend is not available or unsupported
 *
 * @example
 * ```typescript
 * const backend = await getStackingBackend();
 * await backend.stackBranches(branches, 'main', '.worktrees/abc123-main');
 * ```
 */
export async function getStackingBackend(): Promise<StackingBackend> {
  const backendName = process.env.STACKING_BACKEND?.toLowerCase() || 'git-spice';

  // v1: Only git-spice supported
  if (backendName !== 'git-spice') {
    throw new Error(
      `Unsupported stacking backend: ${backendName}. Only git-spice is supported in v1.`
    );
  }

  const backend = new GitSpiceBackend();

  // Verify backend is available
  const isAvailable = await backend.detectBackend();
  if (!isAvailable) {
    throw new Error(
      `${backendName} backend not available. Install git-spice: https://github.com/abhinav/git-spice`
    );
  }

  return backend;
}

export { GitSpiceBackend } from '@/utils/stacking/git-spice';
// Re-export types for convenience
export type { StackingBackend } from '@/utils/stacking/types';
