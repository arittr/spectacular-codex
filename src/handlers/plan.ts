/**
 * Plan handler for spectacular-codex MCP server.
 *
 * Generates implementation plan from specification.
 * This is a stub implementation - will be implemented in future tasks.
 *
 * @module handlers/plan
 */

import { validatePlanPath } from '../utils/validation.js';

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
 * This is a stub implementation that will be expanded in future tasks.
 *
 * @param args - Tool arguments containing spec_path
 * @param _jobs - Job tracker (unused in stub)
 * @returns Promise resolving to PlanResponse with run_id
 * @throws {Error} If spec_path is missing or invalid
 */
export async function handlePlan(
  args: PlanArgs,
  _jobs?: Map<string, unknown>
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

  // TODO: Implement plan generation using Codex SDK
  // For now, return stub response with extracted runId
  return {
    // biome-ignore lint/style/useNamingConvention: MCP API uses snake_case
    run_id: runId,
    status: 'started',
  };
}
