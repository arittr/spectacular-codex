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

import { promises as fs } from 'node:fs';
import { Codex } from '@openai/codex-sdk';
import { generateTaskPrompt } from '@/prompts/task-executor';
import type { ExecutionJob, Phase, Plan } from '@/types';
import { checkExistingWork } from '@/utils/branch-tracker';
import { detectQualityChecks } from '@/utils/project-config';

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
 * Detects quality checks from project config files.
 *
 * Tries AGENTS.md first (Codex convention), then CLAUDE.md as fallback.
 *
 * @returns Quality checks object with test, typeCheck, and lint commands
 */
async function detectQualityChecksFromConfig(): Promise<{
  test: string;
  typeCheck: string;
  lint: string;
}> {
  const defaults = { lint: 'pnpm lint', test: 'pnpm test', typeCheck: 'pnpm check-types' };

  try {
    // Try reading AGENTS.md first (Codex convention), then CLAUDE.md fallback
    let configContent: string | undefined;
    try {
      configContent = await fs.readFile('AGENTS.md', 'utf-8');
    } catch {
      try {
        configContent = await fs.readFile('CLAUDE.md', 'utf-8');
      } catch {
        // Use defaults if neither file exists
        return defaults;
      }
    }

    if (configContent) {
      const detected = detectQualityChecks(configContent);
      return {
        lint: detected.lintCommand || defaults.lint,
        test: detected.testCommand || defaults.test,
        typeCheck: detected.typeCheckCommand || defaults.typeCheck,
      };
    }
  } catch (_error) {
    // If detection fails, use defaults
  }

  return defaults;
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
 * 2. Detect quality checks from AGENTS.md/CLAUDE.md (Codex convention)
 * 3. Execute each pending task sequentially in main worktree with full task prompts
 * 4. Natural git-spice stacking (each branch builds on previous)
 * 5. Fail fast on first error
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

    // Step 2: Detect quality checks from project config
    const qualityChecks = await detectQualityChecksFromConfig();

    // Step 3: Execute each task sequentially in MAIN worktree
    const mainWorktreePath = `.worktrees/${plan.runId}-main`;

    for (const task of pendingTasks) {
      // Update job status: task is now running
      updateJobTaskStatus(job, task.id, { status: 'running' });

      try {
        // Create Codex instance
        const codex = new Codex();

        // Start thread with working directory
        const thread = codex.startThread({
          workingDirectory: mainWorktreePath,
        });

        // Generate prompt with full task-executor template
        const prompt = generateTaskPrompt(task, plan, qualityChecks);

        // Execute task
        const result = await thread.run(prompt);

        // Extract branch name from finalResponse
        const branch = extractBranchName(result.finalResponse);

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
