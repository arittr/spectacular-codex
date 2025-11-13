/**
 * Plan handler for spectacular-codex MCP server.
 *
 * Implements the async job pattern - returns immediately with run_id while
 * plan generation continues in background.
 *
 * @module handlers/plan
 */

import type { ExecutionJob } from '../types.js';

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
  status: 'started';
}

/**
 * Extracts the runId from a spec.md file path.
 *
 * Expected path format: specs/{runId}-{feature-slug}/spec.md
 *
 * @param specPath - Path to the spec.md file
 * @returns The 6-character hex runId
 * @throws {Error} If path format is invalid or runId is malformed
 */
function extractRunIdFromSpecPath(specPath: string): string {
  // Extract the directory name containing the runId
  const match = specPath.match(/specs\/([^/]+)\/spec\.md$/);
  if (!match) {
    throw new Error('Invalid spec path format: must be specs/{runId}-{feature}/spec.md');
  }

  // Extract runId (first part before optional dash)
  const dirName = match[1];
  if (!dirName) {
    throw new Error('Invalid spec path format: missing directory name');
  }

  const runId = dirName.split('-')[0];
  if (!runId) {
    throw new Error('Invalid spec path format: missing runId');
  }

  // Validate runId format (6 hex characters)
  if (!/^[0-9a-f]{6}$/.test(runId)) {
    throw new Error(`Invalid runId format: ${runId} (expected 6 hex characters)`);
  }

  return runId;
}

/**
 * Handles the spectacular_plan MCP tool call.
 *
 * This implements the async job pattern:
 * 1. Validates inputs and extracts runId from spec path
 * 2. Spawns background Codex thread for plan generation (non-blocking)
 * 3. Returns immediately with run_id
 *
 * Plan generation is idempotent - calling multiple times with same spec_path
 * returns the same run_id.
 *
 * @param args - Tool arguments containing spec_path
 * @param jobs - In-memory job tracker (Map of runId -> ExecutionJob)
 * @returns Promise resolving to PlanResponse with run_id
 * @throws {Error} If inputs are invalid or spec path format is wrong
 */
export async function handlePlan(
  args: PlanArgs,
  jobs: Map<string, ExecutionJob>
): Promise<PlanResponse> {
  // Validate inputs
  if (!args.spec_path) {
    throw new Error('spec_path is required');
  }

  if (typeof args.spec_path !== 'string') {
    throw new Error('spec_path must be a string');
  }

  const specPath = args.spec_path;

  // Extract runId from spec path
  const runId = extractRunIdFromSpecPath(specPath);

  // TODO: Spawn Codex thread for plan generation in background
  // This will be implemented when Codex SDK integration is added
  // For now, we just return the runId immediately
  generatePlanInBackground(specPath, runId, jobs).catch(() => {
    // Log error but don't throw (background execution)
    // TODO: Add proper error logging when implementing Codex SDK integration
  });

  // Return immediately
  return {
    // biome-ignore lint/style/useNamingConvention: MCP API uses snake_case
    run_id: runId,
    status: 'started',
  };
}

/**
 * Generates plan in background (non-blocking).
 *
 * This function runs after handlePlan returns. It spawns a Codex thread
 * to read the spec and generate plan.md.
 *
 * @param specPath - Path to spec.md
 * @param runId - Unique run identifier
 * @param jobs - Job tracker for status updates
 */
async function generatePlanInBackground(
  _specPath: string,
  _runId: string,
  _jobs: Map<string, ExecutionJob>
): Promise<void> {
  // TODO: Implement Codex thread spawning when SDK is integrated
  // This will:
  // 1. Generate plan prompt using generatePlanPrompt()
  // 2. Spawn Codex thread with prompt
  // 3. Parse thread output to extract plan path
  // 4. Validate plan.md was created successfully
  //
  // For now, this is a placeholder that will be implemented in a later task
}
