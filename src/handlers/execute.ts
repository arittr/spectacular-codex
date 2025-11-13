/**
 * Execute handler for spectacular-codex MCP server.
 *
 * Implements the async job pattern - returns immediately with run_id while
 * execution continues in background.
 *
 * @module handlers/execute
 */

import { promises as fs } from 'node:fs';
import type { ExecutionJob, Plan } from '@/types';
import { formatMCPResponse, type MCPToolResponse } from '@/utils/mcp-response';
import { extractRunId, parsePlan } from '@/utils/plan-parser';
import { validatePlanPath } from '@/utils/validation';

/**
 * Arguments for the execute handler.
 */
export interface ExecuteArgs {
  plan_path: unknown;
}

/**
 * Response from the execute handler.
 */
export interface ExecuteResponse {
  run_id: string;
  status: 'started';
}

/**
 * Handles the spectacular_execute MCP tool call.
 *
 * This implements the async job pattern:
 * 1. Validates inputs and parses plan
 * 2. Creates ExecutionJob in job tracker
 * 3. Starts background execution (non-blocking)
 * 4. Returns immediately with run_id
 *
 * @param args - Tool arguments containing plan_path
 * @param jobs - In-memory job tracker (Map of runId -> ExecutionJob)
 * @returns Promise resolving to ExecuteResponse with run_id
 * @throws {Error} If inputs are invalid, plan missing, or job already running
 */
export async function handleExecute(
  args: ExecuteArgs,
  jobs: Map<string, ExecutionJob>
): Promise<MCPToolResponse> {
  // Validate inputs
  if (!args.plan_path) {
    throw new Error('plan_path is required');
  }

  if (typeof args.plan_path !== 'string') {
    throw new Error('plan_path must be a string');
  }

  const planPath = args.plan_path;

  // Validate plan path (security: prevent path traversal)
  validatePlanPath(planPath);

  // Extract runId from path
  const runId = extractRunId(planPath);

  // Check if job already running
  const existingJob = jobs.get(runId);
  if (existingJob?.status === 'running') {
    throw new Error(`Job ${runId} is already running`);
  }

  // Read and parse plan
  let planContent: string;
  try {
    planContent = await fs.readFile(planPath, 'utf-8');
  } catch (_error) {
    throw new Error(`Plan file not found: ${planPath}`);
  }

  const plan = parsePlan(planContent, runId);

  // Create job tracker
  const job: ExecutionJob = {
    phase: 1,
    runId,
    startedAt: new Date(),
    status: 'running',
    tasks: [],
    totalPhases: plan.phases.length,
  };

  jobs.set(runId, job);

  // Execute in background (non-blocking)
  executePhases(plan, job).catch((error) => {
    job.status = 'failed';
    job.error = String(error);
    job.completedAt = new Date();
  });

  // Return immediately (MCP format)
  return formatMCPResponse({
    run_id: runId,
    status: 'started',
  });
}

/**
 * Executes all phases in the plan sequentially with per-phase code review.
 *
 * This function runs in the background after handleExecute returns.
 * It updates the job status as execution progresses.
 *
 * Review frequency: per-phase (after each phase completes)
 * This ensures quality gates at each major checkpoint.
 *
 * @param plan - Parsed implementation plan
 * @param job - Job tracker to update with progress
 */
async function executePhases(plan: Plan, job: ExecutionJob): Promise<void> {
  for (const phase of plan.phases) {
    job.phase = phase.id;

    // Execute phase
    if (phase.strategy === 'parallel') {
      // Dynamic import to avoid circular dependency
      const { executeParallelPhase } = await import('@/orchestrator/parallel-phase');
      await executeParallelPhase(phase, plan, job);
    } else {
      // Sequential phase
      const { executeSequentialPhase } = await import('@/orchestrator/sequential-phase');
      await executeSequentialPhase(phase, plan, job);
    }

    // Code review after phase completes (per-phase frequency)
    try {
      const { runCodeReview } = await import('@/orchestrator/code-review');
      await runCodeReview(phase, plan);
    } catch (error) {
      // Code review failure fails the job
      job.status = 'failed';
      job.error = `Code review failed for phase ${phase.id}: ${String(error)}`;
      job.completedAt = new Date();
      throw error;
    }
  }

  // All phases completed successfully
  job.status = 'completed';
  job.completedAt = new Date();
}
