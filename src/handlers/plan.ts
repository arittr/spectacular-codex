/**
 * Plan handler for spectacular-codex MCP server.
 *
 * Generates implementation plan from specification.
 * Implements the async job pattern - returns immediately with run_id while
 * plan generation continues in background.
 *
 * @module handlers/plan
 */

import { Codex } from '@openai/codex-sdk';
import { generatePlanPrompt } from '../prompts/plan-generator';
import type { ExecutionJob } from '../types';
import { validatePlanPath } from '../utils/validation';

/**
 * Arguments for the plan handler.
 */
export interface PlanArgs {
  // biome-ignore lint/style/useNamingConvention: MCP API uses snake_case
  spec_path: unknown;
}

/**
 * Response from the plan handler.
 */
export interface PlanResponse {
  // biome-ignore lint/style/useNamingConvention: MCP API uses snake_case
  run_id: string;
  status: 'created';
  // biome-ignore lint/style/useNamingConvention: MCP API uses snake_case
  plan_path: string;
}

/**
 * Handles the spectacular_plan MCP tool call.
 *
 * This implements the async job pattern:
 * 1. Validates spec_path input
 * 2. Extracts runId from spec path
 * 3. Creates ExecutionJob in job tracker
 * 4. Starts background plan generation (non-blocking)
 * 5. Returns immediately with run_id
 *
 * @param args - Tool arguments containing spec_path
 * @param jobs - In-memory job tracker (Map of runId -> ExecutionJob)
 * @returns Promise resolving to PlanResponse with run_id
 * @throws {Error} If spec_path is missing or invalid
 */
export async function handlePlan(
  args: PlanArgs,
  jobs: Map<string, ExecutionJob>
  // biome-ignore lint/style/useNamingConvention: MCP API uses snake_case
): Promise<{ run_id: string; status: string }> {
  // Validate inputs
  if (!args.spec_path) {
    throw new Error('spec_path is required');
  }

  if (typeof args.spec_path !== 'string') {
    throw new Error('spec_path must be a string');
  }

  const specPath = args.spec_path;

  // Extract runId from spec path (e.g., "specs/abc123-feature/spec.md" -> "abc123")
  // Check format first to provide specific error message
  const match = specPath.match(/specs\/([a-f0-9]{6})-/);
  if (!match || !match[1]) {
    throw new Error('Invalid spec path format: must be specs/{runId}-{feature}/spec.md');
  }

  const runId = match[1];

  // Validate spec path (security: prevent path traversal)
  // This runs after format check to provide specific error messages
  validatePlanPath(specPath);

  // Create job tracker
  const job: ExecutionJob = {
    phase: 0, // Phase 0 for plan generation (pre-implementation)
    runId,
    startedAt: new Date(),
    status: 'running',
    tasks: [],
    totalPhases: 0, // Plan generation doesn't have phases
  };

  jobs.set(runId, job);

  // Generate plan in background (non-blocking)
  generatePlan(specPath, runId, job).catch((error) => {
    job.status = 'failed';
    job.error = String(error);
    job.completedAt = new Date();
  });

  // Return immediately
  return {
    // biome-ignore lint/style/useNamingConvention: MCP API uses snake_case
    run_id: runId,
    status: 'started',
  };
}

/**
 * Generates plan in the background using Codex thread.
 *
 * This function runs in the background after handlePlan returns.
 * It spawns a Codex thread with the plan generation prompt.
 *
 * @param specPath - Path to the feature specification
 * @param runId - Unique run identifier
 * @param job - Job tracker to update with progress
 */
async function generatePlan(specPath: string, runId: string, job: ExecutionJob): Promise<void> {
  try {
    // Generate prompt
    const prompt = generatePlanPrompt(specPath, runId);

    // Spawn Codex thread with prompt
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: process.cwd(),
    });
    const result = await thread.run(prompt);

    // Parse PLAN_PATH from result finalResponse
    // Expected format: "PLAN: specs/abc123-feature/plan.md"
    const planPathMatch = result.finalResponse.match(/PLAN:\s*(.+\.md)/);
    const planPath = planPathMatch?.[1];

    // Update job with completion status
    job.status = 'completed';
    job.completedAt = new Date();

    // Store plan path in error field (reusing existing field for output)
    if (planPath) {
      job.error = `Plan generated at ${planPath}`;
    }
  } catch (error) {
    // Handle errors in background execution
    job.status = 'failed';
    job.error = String(error instanceof Error ? error.message : error);
    job.completedAt = new Date();
  }
}
