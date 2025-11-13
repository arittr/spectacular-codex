import { execa } from 'execa';
import type { CompletedTask, ExistingWork, Phase, Task } from '../types';
import { findBranch } from './git';

/**
 * Checks if a branch has commits beyond its base.
 *
 * @param branch - Branch name to check
 * @param cwd - Working directory
 * @returns Number of commits in the branch
 */
async function countBranchCommits(branch: string, cwd: string): Promise<number> {
  try {
    // Count commits in this branch that aren't in main
    const { stdout } = await execa('git', ['rev-list', '--count', `main..${branch}`], { cwd });

    return Number.parseInt(stdout.trim(), 10);
  } catch {
    return 0;
  }
}

/**
 * Checks if a task has been completed (has a branch with commits).
 *
 * Task IDs already include the phase (e.g., "1-1", "2-3"), so the branch
 * pattern is {runId}-task-{taskId}- (e.g., "abc123-task-1-1-").
 *
 * @param task - Task to check
 * @param runId - Run identifier
 * @param phaseId - Phase identifier (unused, kept for API compatibility)
 * @param cwd - Working directory (defaults to current directory)
 * @returns True if task is complete (branch exists with commits)
 */
export async function isTaskComplete(
  task: Task,
  runId: string,
  _phaseId: number,
  cwd = process.cwd()
): Promise<boolean> {
  const branchPattern = `${runId}-task-${task.id}-`;
  const branch = await findBranch(branchPattern, cwd);

  if (!branch) {
    return false;
  }

  const commitCount = await countBranchCommits(branch, cwd);
  return commitCount > 0;
}

/**
 * Checks existing work in git to separate completed and pending tasks.
 *
 * Git branches are the source of truth. A task is complete if:
 * 1. A branch exists matching the pattern {runId}-task-{phaseId}-{taskId}-*
 * 2. The branch has commits beyond the base branch
 *
 * @param phase - Phase containing tasks to check
 * @param runId - Run identifier (6-char hex)
 * @param cwd - Working directory (defaults to current directory)
 * @returns Object with completed and pending tasks
 */
export async function checkExistingWork(
  phase: Phase,
  runId: string,
  cwd = process.cwd()
): Promise<ExistingWork> {
  const completedTasks: CompletedTask[] = [];
  const pendingTasks: Task[] = [];

  for (const task of phase.tasks) {
    const branchPattern = `${runId}-task-${task.id}-`;
    const branch = await findBranch(branchPattern, cwd);

    if (branch) {
      const commitCount = await countBranchCommits(branch, cwd);

      if (commitCount > 0) {
        // Task is complete
        completedTasks.push({
          ...task,
          branch,
          commitCount,
        });
      } else {
        // Branch exists but no commits
        pendingTasks.push(task);
      }
    } else {
      // No branch exists
      pendingTasks.push(task);
    }
  }

  return {
    completedTasks,
    pendingTasks,
  };
}
