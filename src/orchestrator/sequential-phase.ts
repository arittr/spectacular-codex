/**
 * Sequential phase orchestrator for spectacular-codex MCP server.
 *
 * This module implements sequential phase execution where tasks run one-by-one
 * in the main worktree. Each task builds on the previous via natural git-spice
 * stacking (no manual upstack commands needed).
 *
 * Key patterns:
 * - Sequential execution: tasks run one after another (not parallel)
 * - Main worktree: all tasks execute in .worktrees/{runId}-main
 * - Natural stacking: each branch builds on previous (git-spice handles this)
 * - Resume logic: only execute pending tasks
 * - Fail fast: first task failure stops execution
 *
 * @module orchestrator/sequential-phase
 */

import type { ExecutionJob, Phase, Plan } from '../types.js';
import { checkExistingWork } from '../utils/branch-tracker.js';

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
cd .worktrees/${plan.runId}-main

### 2. Implement Task (TDD)
- Write test first
- Watch it fail
- Write minimal code to pass
- Watch it pass

### 3. Create Branch
gs branch create ${plan.runId}-task-${taskId}-{name} -m "Task ${taskId}"

### 4. Report Completion
Output: BRANCH: {branch-name}
`;
}

/**
 * Updates job task status in-place.
 *
 * @param job - Execution job
 * @param taskId - Task identifier
 * @param status - Task status update
 */
function updateJobTaskStatus(
  job: ExecutionJob,
  taskId: string,
  status:
    | { status: 'running' }
    | { status: 'completed'; branch?: string }
    | { status: 'failed'; error?: string }
): void {
  const taskIndex = job.tasks.findIndex((t) => t.id === taskId);

  const updatedTask = {
    id: taskId,
    ...status,
  };

  if (taskIndex >= 0) {
    job.tasks[taskIndex] = updatedTask;
  } else {
    job.tasks.push(updatedTask);
  }
}

/**
 * Executes a sequential phase by running tasks one-by-one in main worktree.
 *
 * This function implements the sequential execution pattern:
 * 1. Check existing work (resume logic)
 * 2. Execute each pending task sequentially in main worktree
 * 3. Natural git-spice stacking (each branch builds on previous)
 * 4. Fail fast on first error
 *
 * Unlike parallel phases, sequential phases:
 * - Use single main worktree (not isolated worktrees per task)
 * - Execute tasks one after another (not concurrently)
 * - Stop immediately on first failure (fail fast)
 * - Rely on git-spice for natural stacking (no manual upstack commands)
 *
 * @param phase - Phase to execute
 * @param plan - Implementation plan
 * @param job - Execution job (updated in-place with task results)
 * @throws {Error} If any task fails or phase setup fails
 */
export async function executeSequentialPhase(
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
      updateJobTaskStatus(job, completedTask.id, {
        branch: completedTask.branch,
        status: 'completed',
      });
    }

    // If no pending tasks, phase is already complete
    if (pendingTasks.length === 0) {
      return;
    }

    // Step 2: Execute each task sequentially in MAIN worktree
    const mainWorktreePath = `.worktrees/${plan.runId}-main`;

    for (const task of pendingTasks) {
      // Update job status: task is now running
      updateJobTaskStatus(job, task.id, { status: 'running' });

      try {
        // Create isolated Codex instance
        const codex = new Codex({
          workingDirectory: mainWorktreePath,
        });

        const thread = codex.startThread();

        // Generate prompt (stub for now, will use task-executor.ts later)
        const prompt = generateTaskPrompt(task.id, plan);

        // Execute task
        const result = await thread.run(prompt);

        // Extract branch name from output
        const branch = extractBranchName(result.output);

        // Update task status: completed
        const completedStatus: { status: 'completed'; branch?: string } = {
          status: 'completed',
        };

        if (branch) {
          completedStatus.branch = branch;
        }

        updateJobTaskStatus(job, task.id, completedStatus);
      } catch (error) {
        // Individual task failure - update status and fail fast
        updateJobTaskStatus(job, task.id, {
          error: String(error),
          status: 'failed',
        });

        // Sequential = fail fast: throw immediately
        throw error;
      }
    }
  } catch (error) {
    // Phase-level error (setup/coordination failure or task failure)
    job.status = 'failed';
    job.error = String(error);
    throw error;
  }
}
