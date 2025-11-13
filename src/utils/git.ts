import { execa } from 'execa';

/**
 * Creates an isolated git worktree for parallel task execution.
 *
 * Each worktree is created in detached HEAD state from baseRef.
 * Worktrees enable true parallelism by providing isolated working directories.
 *
 * @param path - Absolute path where worktree should be created
 * @param baseRef - Git ref to branch worktree from (e.g., 'HEAD', 'main')
 * @param cwd - Working directory for git command (defaults to process.cwd())
 * @throws {Error} If git worktree add fails
 */
export async function createWorktree(path: string, baseRef: string, cwd?: string): Promise<void> {
  await execa('git', ['worktree', 'add', path, '--detach', baseRef], {
    cwd: cwd ?? process.cwd(),
  });
}

/**
 * Removes a git worktree and cleans up references.
 *
 * Safely handles non-existent worktrees (no-op instead of error).
 *
 * @param path - Absolute path to worktree to remove
 * @param cwd - Working directory for git command (defaults to process.cwd())
 */
export async function cleanupWorktree(path: string, cwd?: string): Promise<void> {
  try {
    await execa('git', ['worktree', 'remove', path], {
      cwd: cwd ?? process.cwd(),
    });
  } catch (_error) {
    // Worktree doesn't exist or already removed - this is fine
    // No-op instead of throwing
  }
}

/**
 * Finds a git branch matching the given pattern.
 *
 * Used for resume logic to check if a task has already been completed.
 * Returns the first matching branch if multiple matches exist.
 *
 * @param pattern - Branch name pattern to search for (e.g., 'abc123-task-1-')
 * @param cwd - Working directory for git command (defaults to process.cwd())
 * @returns Branch name if found, undefined otherwise
 */
export async function findBranch(pattern: string, cwd?: string): Promise<string | undefined> {
  try {
    const result = await execa('git', ['branch', '--list', `${pattern}*`], {
      cwd: cwd ?? process.cwd(),
    });

    const branches = result.stdout
      .split('\n')
      .map((line) => line.trim().replace(/^\*\s+/, '')) // Remove leading * and whitespace
      .filter((line) => line.length > 0);

    return branches[0]; // Return first match
  } catch (_error) {
    return undefined;
  }
}

/**
 * Checks if a git branch has any commits.
 *
 * Used for resume logic to verify task completion.
 * Empty branches (no commits) indicate incomplete tasks.
 *
 * @param branch - Branch name to check
 * @param cwd - Working directory for git command (defaults to process.cwd())
 * @returns true if branch has commits, false otherwise
 */
export async function branchHasCommits(branch: string, cwd?: string): Promise<boolean> {
  try {
    const result = await execa('git', ['log', '--oneline', '-1', branch, '--'], {
      cwd: cwd ?? process.cwd(),
    });

    return result.stdout.length > 0;
  } catch (_error) {
    // Branch doesn't exist or has no commits
    return false;
  }
}

/**
 * Lists all git worktrees in the repository.
 *
 * Returns absolute paths to all worktrees (main + additional).
 *
 * @param cwd - Working directory for git command (defaults to process.cwd())
 * @returns Array of worktree paths
 */
export async function listWorktrees(cwd?: string): Promise<string[]> {
  const result = await execa('git', ['worktree', 'list', '--porcelain'], {
    cwd: cwd ?? process.cwd(),
  });

  // Parse porcelain output: each worktree starts with "worktree <path>"
  const worktrees: string[] = [];
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      worktrees.push(line.substring('worktree '.length));
    }
  }

  return worktrees;
}
