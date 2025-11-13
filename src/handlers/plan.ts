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
 * @returns Promise resolving to PlanResponse with run_id
 * @throws {Error} If spec_path is missing
 */
export async function handlePlan(args: PlanArgs): Promise<PlanResponse> {
  // Validate inputs
  if (!args.spec_path) {
    throw new Error('spec_path is required');
  }

  if (typeof args.spec_path !== 'string') {
    throw new Error('spec_path must be a string');
  }

  const specPath = args.spec_path;

  // Validate spec path (security: prevent path traversal)
  validatePlanPath(specPath);

  // TODO: Implement plan generation using Codex SDK
  // For now, return stub response
  throw new Error('spectacular_plan not yet implemented');
}
