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

import { promises as fs } from 'node:fs';
import { Codex } from '@openai/codex-sdk';
import { generateTaskPrompt } from '@/prompts/task-executor';
import type { CodexThreadResult, ExecutionJob, Phase, Plan } from '@/types';
import { checkExistingWork } from '@/utils/branch-tracker';
import { cleanupWorktree, createWorktree } from '@/utils/git';
import { detectQualityChecks } from '@/utils/project-config';
import { getStackingBackend } from '@/utils/stacking';

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
 * Stacks successful branches from parallel execution.
 *
 * @param results - Thread execution results
 * @param plan - Execution plan
 * @param job - Execution job (for error reporting)
 */
async function stackSuccessfulBranches(
  results: CodexThreadResult[],
  plan: Plan,
  job: ExecutionJob
): Promise<void> {
  const successfulBranches = results
    .filter((result) => result.success && result.branch)
    .map((result) => result.branch as string);

  if (successfulBranches.length > 0) {
    try {
      const backend = await getStackingBackend();
      const mainWorktreePath = `.worktrees/${plan.runId}-main`;

      // Stack all successful branches onto the base branch
      await backend.stackBranches(successfulBranches, 'main', mainWorktreePath);
    } catch (error) {
      // Log stacking error but don't fail the phase
      // Branches exist, just not stacked properly
      job.error = `Warning: Branch stacking failed: ${String(error)}`;
    }
  }
}

/**
 * Executes a parallel phase by spawning N Codex threads concurrently.
 *
 * This function implements the core parallel execution pattern:
 * 1. Check existing work (resume logic)
 * 2. Detect quality checks from AGENTS.md/CLAUDE.md (Codex convention)
 * 3. Create worktrees for pending tasks only
 * 4. Spawn threads in parallel via Promise.all() with full task prompts
 * 5. Handle individual failures gracefully (wait for all)
 * 6. Stack successful branches using git-spice
 * 7. Clean up worktrees after execution
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

    // Step 2: Detect quality checks from project config
    const qualityChecks = await detectQualityChecksFromConfig();

    // Step 3: Create worktrees for pending tasks
    const worktreePaths: string[] = [];
    for (const task of pendingTasks) {
      const worktreePath = `.worktrees/${plan.runId}-task-${task.id}`;
      worktreePaths.push(worktreePath);

      await createWorktree(worktreePath, 'HEAD', process.cwd());
    }

    // Step 4: Spawn threads in parallel via Promise.all()
    const threadPromises = pendingTasks.map(async (task) => {
      try {
        // Create Codex instance
        const codex = new Codex();

        // Start thread with working directory
        const thread = codex.startThread({
          workingDirectory: `.worktrees/${plan.runId}-task-${task.id}`,
        });

        // Generate prompt with full task-executor template
        const prompt = generateTaskPrompt(task, plan, qualityChecks);

        // Execute task
        const result = await thread.run(prompt);

        // Extract branch name from finalResponse
        const branch = extractBranchName(result.finalResponse);

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

    // Step 5: Update job status with task results
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

    // Step 6: Stack branches
    await stackSuccessfulBranches(results, plan, job);

    // Step 7: Clean up worktrees
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
