/**
 * Validation utilities for spectacular-codex.
 * Prevents security vulnerabilities (path traversal, shell injection)
 * and provides clear error messages for invalid inputs.
 */

/**
 * Validate plan path to prevent path traversal attacks.
 * Plan paths must be under specs/ directory and cannot contain "..".
 *
 * @param path - Plan path to validate (e.g., "specs/abc123/plan.md")
 * @throws {Error} If path is not under specs/ or contains path traversal
 *
 * @example
 * validatePlanPath('specs/abc123/plan.md'); // OK
 * validatePlanPath('other/plan.md'); // throws
 * validatePlanPath('specs/../etc/passwd'); // throws
 */
export function validatePlanPath(path: string): void {
  if (!path.startsWith('specs/')) {
    throw new Error('Invalid plan path: must be under specs/ directory');
  }
  if (path.includes('..')) {
    throw new Error('Invalid plan path: path traversal detected');
  }
}

/**
 * Validate runId format (6-character lowercase hex).
 * RunIds are used for branch prefixes and worktree directories.
 *
 * @param runId - Run ID to validate (e.g., "abc123")
 * @throws {Error} If runId is not 6-character lowercase hex
 *
 * @example
 * validateRunId('abc123'); // OK
 * validateRunId('ABC123'); // throws (uppercase)
 * validateRunId('abc12'); // throws (too short)
 */
export function validateRunId(runId: string): void {
  if (!/^[0-9a-f]{6}$/.test(runId)) {
    throw new Error('Invalid run_id: must be 6-character hex (e.g., "abc123")');
  }
}

/**
 * Validate branch name has correct runId prefix.
 * All branches must start with "{runId}-" for tracking.
 *
 * @param branchName - Branch name to validate (e.g., "abc123-task-1")
 * @param runId - Expected run ID prefix (e.g., "abc123")
 * @throws {Error} If branch name doesn't start with runId prefix
 *
 * @example
 * validateBranchName('abc123-task-1', 'abc123'); // OK
 * validateBranchName('task-1', 'abc123'); // throws
 * validateBranchName('def456-task-1', 'abc123'); // throws
 */
export function validateBranchName(branchName: string, runId: string): void {
  if (!branchName.startsWith(`${runId}-`)) {
    throw new Error(`Invalid branch name: must start with run_id prefix "${runId}-"`);
  }
}

/**
 * Sanitize file path to prevent shell injection.
 * Rejects paths with shell metacharacters (;, &, |, `, $).
 * Note: execa uses array args which prevents most injection,
 * but this adds defense-in-depth.
 *
 * @param path - File path to sanitize
 * @returns Sanitized path (same as input if valid)
 * @throws {Error} If path contains shell metacharacters
 *
 * @example
 * sanitizePath('specs/plan.md'); // 'specs/plan.md'
 * sanitizePath('file; rm -rf /'); // throws
 * sanitizePath('path with spaces/file.txt'); // OK (execa handles spaces)
 */
export function sanitizePath(path: string): string {
  if (/[;&|`$]/.test(path)) {
    throw new Error('Invalid path: contains shell metacharacters');
  }
  return path;
}
