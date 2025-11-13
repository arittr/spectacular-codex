/**
 * Parallel phase orchestrator for spectacular-codex MCP server.
 *
 * This module implements parallel phase execution using Promise.all() to spawn
 * multiple Codex threads concurrently. Each task gets an isolated worktree,
 * and individual task failures don't stop other threads.
 *
 * Key patterns:
 * - Promise.all() for true parallelism
 * - Resume logic: only execute pending tasks
 * - Individual task failure handling (wait for all)
 * - Worktree cleanup after execution
 *
 * @module orchestrator/parallel-phase
 */

import type { CodexThreadResult, ExecutionJob, Phase, Plan } from '../types.js';
import { checkExistingWork } from '../utils/branch-tracker.js';
import { cleanupWorktree, createWorktree } from '../utils/git.js';

// Stub Codex SDK import (will be replaced when SDK is installed)
// For now, we'll define a minimal interface to satisfy TypeScript
interface CodexConfig {
  workingDirectory: string;
}

interface CodexThread {
  run(prompt: string): Promise<{ output: string }>;
}

interface CodexInstance {
  startThread(): CodexThread;
}

// Stub Codex constructor (will be imported from @openai/codex)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let Codex: new (config: CodexConfig) => CodexInstance;

// Try to import real Codex SDK, fall back to stub if not available
try {
  // @ts-expect-error - Module may not exist yet
  const codexModule = await import('@openai/codex');
  Codex = codexModule.Codex;
} catch {
  // SDK not installed yet, create a stub for type checking
  Codex = function StubCodex(_config: CodexConfig): CodexInstance {
    return {
      startThread(): CodexThread {
        return {
          async run(_prompt: string): Promise<{ output: string }> {
            throw new Error('Codex SDK not installed. This is a stub implementation.');
          },
        };
      },
    };
  } as unknown as new (
    config: CodexConfig
  ) => CodexInstance;
}

/**
 * Extracts branch name from Codex thread output.
 *
 * Looks for "BRANCH: {branch-name}" in the output.
 *
 * @param output - Thread output text
 * @returns Branch name if found, undefined otherwise
 */
function extractBranchName(output: string): string | undefined {
  const match = /BRANCH:\s*(\S+)/.exec(output);
  return match?.[1];
}

/**
 * Generates a basic task execution prompt.
 *
 * NOTE: This is a stub implementation. The real prompt generation should be
 * delegated to src/prompts/task-executor.ts (Task 2-1).
 *
 * @param taskId - Task identifier
 * @param plan - Execution plan
 * @returns Prompt string
 */
function generateTaskPrompt(taskId: string, plan: Plan): string {
  return `
You are implementing Task ${taskId} for run ${plan.runId}.

## Your Process

### 1. Navigate to Worktree
cd .worktrees/${plan.runId}-task-${taskId}

### 2. Implement Task (TDD)
- Write test first
- Watch it fail
- Write minimal code to pass
- Watch it pass

### 3. Create Branch
gs branch create ${plan.runId}-task-${taskId}-{name} -m "Task ${taskId}"

### 4. Detach HEAD
git switch --detach

### 5. Report Completion
Output: BRANCH: {branch-name}
`;
}

/**
 * Executes a parallel phase by spawning N Codex threads concurrently.
 *
 * This function implements the core parallel execution pattern:
 * 1. Check existing work (resume logic)
 * 2. Create worktrees for pending tasks only
 * 3. Spawn threads in parallel via Promise.all()
 * 4. Handle individual failures gracefully (wait for all)
 * 5. Clean up worktrees after execution
 *
 * Individual task failures are tracked but don't stop other threads.
 * Git branches are the source of truth for task completion.
 *
 * @param phase - Phase to execute
 * @param plan - Implementation plan
 * @param job - Execution job (updated in-place with task results)
 * @throws {Error} If phase execution setup fails
 */
export async function executeParallelPhase(
  phase: Phase,
  plan: Plan,
  job: ExecutionJob
): Promise<void> {
  try {
    // Step 1: Check existing work (resume logic)
    const { completedTasks, pendingTasks } = await checkExistingWork(
      phase,
      plan.runId,
      process.cwd()
    );

    // Add completed tasks to job status
    for (const completedTask of completedTasks) {
      job.tasks.push({
        branch: completedTask.branch,
        id: completedTask.id,
        status: 'completed',
      });
    }

    // If no pending tasks, phase is already complete
    if (pendingTasks.length === 0) {
      return;
    }

    // Step 2: Create worktrees for pending tasks
    const worktreePaths: string[] = [];
    for (const task of pendingTasks) {
      const worktreePath = `.worktrees/${plan.runId}-task-${task.id}`;
      worktreePaths.push(worktreePath);

      await createWorktree(worktreePath, 'HEAD', process.cwd());
    }

    // Step 3: Spawn threads in parallel via Promise.all()
    const threadPromises = pendingTasks.map(async (task) => {
      try {
        // Create isolated Codex instance
        const codex = new Codex({
          workingDirectory: `.worktrees/${plan.runId}-task-${task.id}`,
        });

        const thread = codex.startThread();

        // Generate prompt (stub for now, will use task-executor.ts later)
        const prompt = generateTaskPrompt(task.id, plan);

        // Execute task
        const result = await thread.run(prompt);

        // Extract branch name from output
        const branch = extractBranchName(result.output);

        const threadResult: CodexThreadResult = {
          success: true,
          taskId: task.id,
        };

        if (branch) {
          threadResult.branch = branch;
        }

        return threadResult;
      } catch (error) {
        // Individual task failure - return error result
        const errorResult: CodexThreadResult = {
          success: false,
          taskId: task.id,
        };

        if (error) {
          errorResult.error = String(error);
        }

        return errorResult;
      }
    });

    // Wait for ALL threads to complete (even if some fail)
    const results = await Promise.all(threadPromises);

    // Step 4: Update job status with task results
    for (const result of results) {
      if (result.success) {
        const taskStatus: {
          id: string;
          status: 'completed';
          branch?: string;
        } = {
          id: result.taskId,
          status: 'completed',
        };

        if (result.branch) {
          taskStatus.branch = result.branch;
        }

        job.tasks.push(taskStatus);
      } else {
        const failedStatus: {
          id: string;
          status: 'failed';
          error?: string;
        } = {
          id: result.taskId,
          status: 'failed',
        };

        if (result.error) {
          failedStatus.error = result.error;
        }

        job.tasks.push(failedStatus);
      }
    }

    // Step 5: Clean up worktrees
    for (const worktreePath of worktreePaths) {
      await cleanupWorktree(worktreePath, process.cwd());
    }
  } catch (error) {
    // Phase-level error (setup/coordination failure)
    job.status = 'failed';
    job.error = String(error);
    throw error;
  }
}
