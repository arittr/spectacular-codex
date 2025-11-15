/**
 * Execute handler for spectacular-codex MCP server.
 *
 * Implements the async job pattern - returns immediately with run_id while
 * execution continues in background.
 *
 * @module handlers/execute
 */

import { promises as fs } from 'node:fs';
import type { ExecutionJob, ExecutionOptions, Phase, Plan, TaskOverride } from '@/types';
import { bootstrapSkills } from '@/utils/bootstrap';
import { ensureWorktree } from '@/utils/git';
import { formatMCPResponse, type MCPToolResponse } from '@/utils/mcp-response';
import { extractRunId, parsePlan } from '@/utils/plan-parser';
import { validatePlanPath } from '@/utils/validation';

/**
 * Arguments for the execute handler.
 */
export interface ExecuteArgs {
  plan_path?: unknown;
  plan?: unknown;
  base_branch?: unknown;
  tasks?: unknown;
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
  // Derive plan data either from explicit payload or plan_path
  const { plan, runId } = await resolvePlan(args);

  const { taskFilter, taskOverrides } = parseTaskOverrides(args.tasks);

  // Create job tracker
  const job: ExecutionJob = {
    phase: 1,
    runId,
    startedAt: new Date(),
    status: 'running',
    tasks: [],
    totalPhases: plan.phases.length,
  };

  if (plan.featureSlug) {
    job.featureSlug = plan.featureSlug;
  }

  jobs.set(runId, job);

  const executionOptions: ExecutionOptions = {};

  if (typeof args.base_branch === 'string' && args.base_branch.trim().length > 0) {
    executionOptions.baseBranch = args.base_branch;
  }

  if (taskFilter && taskFilter.size > 0) {
    executionOptions.taskFilter = taskFilter;
  }

  if (taskOverrides && taskOverrides.size > 0) {
    executionOptions.taskOverrides = taskOverrides;
  }

  // Execute in background (non-blocking)
  executePhases(plan, job, executionOptions).catch((error) => {
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

async function resolvePlan(args: ExecuteArgs): Promise<{ plan: Plan; runId: string }> {
  if (args.plan) {
    return resolveInlinePlan(args.plan);
  }

  return resolvePlanFromPath(args.plan_path);
}

/**
 * Drives the plan execution by iterating through phases, honoring strategy, and
 * delegating each task to a Codex CLI subagent.
 */
async function executePhases(
  plan: Plan,
  job: ExecutionJob,
  options: ExecutionOptions
): Promise<void> {
  const cwd = process.cwd();
  const baseBranch = options.baseBranch ?? 'main';
  await bootstrapSkills(cwd);
  await ensureWorktree(`.worktrees/${plan.runId}-main`, baseBranch, cwd);

  for (const phase of plan.phases) {
    const selectedTasks =
      options.taskFilter && options.taskFilter.size > 0
        ? phase.tasks.filter((task) => options.taskFilter?.has(task.id))
        : phase.tasks;

    if (selectedTasks.length === 0) {
      continue;
    }

    job.phase = phase.id;
    const phaseToRun: Phase = {
      ...phase,
      tasks: selectedTasks,
    };

    if (phase.strategy === 'parallel') {
      const { executeParallelPhase } = await import('@/orchestrator/parallel-phase');
      await executeParallelPhase(phaseToRun, plan, job, options);
    } else {
      const { executeSequentialPhase } = await import('@/orchestrator/sequential-phase');
      await executeSequentialPhase(phaseToRun, plan, job, options);
    }
  }

  job.status = 'completed';
  job.completedAt = new Date();
}

function parseTaskOverrides(tasks: unknown): {
  taskFilter?: Set<string>;
  taskOverrides?: Map<string, TaskOverride>;
} {
  if (!tasks) {
    return {};
  }

  if (!Array.isArray(tasks)) {
    throw new Error('tasks must be an array of { id, branch?, worktree_path? } objects');
  }

  const filter = new Set<string>();
  const overrides = new Map<string, TaskOverride>();

  for (const entry of tasks) {
    const normalized = normalizeTaskOverride(entry);
    filter.add(normalized.id);

    if (normalized.override) {
      overrides.set(normalized.id, normalized.override);
    }
  }

  const result: {
    taskFilter?: Set<string>;
    taskOverrides?: Map<string, TaskOverride>;
  } = {};

  if (filter.size > 0) {
    result.taskFilter = filter;
  }

  if (overrides.size > 0) {
    result.taskOverrides = overrides;
  }

  return result;
}

function normalizeTaskOverride(entry: unknown): { id: string; override?: TaskOverride } {
  if (!entry || typeof entry !== 'object') {
    throw new Error('task entries must be objects');
  }

  const candidate = entry as Record<string, unknown>;
  const id = candidate.id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('task id must be a non-empty string');
  }

  const override: TaskOverride = {};
  const branch = candidate.branch;
  if (branch !== undefined) {
    if (typeof branch !== 'string' || branch.trim() === '') {
      throw new Error(`branch override for task ${id} must be a non-empty string`);
    }

    override.branch = branch;
  }

  const worktree = candidate.worktree_path;
  if (worktree !== undefined) {
    if (typeof worktree !== 'string' || worktree.trim() === '') {
      throw new Error(`worktree_path override for task ${id} must be a non-empty string`);
    }

    override.worktreePath = worktree;
  }

  if (override.branch || override.worktreePath) {
    return { id, override };
  }

  return { id };
}

function ensurePhaseStructure(plan: Plan): void {
  if (!plan.phases || plan.phases.length === 0) {
    throw new Error('plan must include at least one phase with tasks');
  }

  for (const phase of plan.phases) {
    if (!phase.tasks || phase.tasks.length === 0) {
      throw new Error(`phase ${phase.id} is missing tasks`);
    }
  }
}

function resolveInlinePlan(planPayload: unknown): { plan: Plan; runId: string } {
  if (typeof planPayload !== 'object' || planPayload === null) {
    throw new Error('plan must be an object when provided inline');
  }

  const rawPlan = planPayload as Plan;
  if (!rawPlan.runId) {
    throw new Error('plan.runId is required');
  }

  ensurePhaseStructure(rawPlan);
  return { plan: rawPlan, runId: rawPlan.runId };
}

async function resolvePlanFromPath(planPathValue: unknown): Promise<{ plan: Plan; runId: string }> {
  if (!planPathValue || typeof planPathValue !== 'string') {
    throw new Error('plan_path or plan must be provided');
  }

  validatePlanPath(planPathValue);
  const runId = extractRunId(planPathValue);

  let planContent: string;
  try {
    planContent = await fs.readFile(planPathValue, 'utf-8');
  } catch {
    throw new Error(`Plan file not found: ${planPathValue}`);
  }

  const plan = parsePlan(planContent, runId);
  ensurePhaseStructure(plan);
  return { plan, runId };
}
