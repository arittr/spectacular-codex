/**
 * MCP tool handler for spectacular_status.
 *
 * Retrieves job status from in-memory Map and formats response for polling.
 * Returns not_found if job isn't in memory (resume logic is Phase 5).
 *
 * @module handlers/status
 */

import type { ExecutionJob } from '../types.js';

/**
 * Status response format for MCP tool.
 *
 * Uses snake_case for field names to match MCP protocol conventions.
 */
export interface StatusResponse {
  /** Run identifier */
  // biome-ignore lint/style/useNamingConvention: MCP protocol uses snake_case
  run_id: string;

  /** Job status */
  status: 'running' | 'completed' | 'failed' | 'not_found';

  /** Current phase number (1-based) */
  phase?: number;

  /** Total number of phases */
  // biome-ignore lint/style/useNamingConvention: MCP protocol uses snake_case
  total_phases?: number;

  /** Task status array */
  tasks?: Array<{
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    branch?: string;
    error?: string;
  }>;

  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Arguments for handleStatus.
 */
export interface StatusArgs {
  /** Run identifier to query */
  // biome-ignore lint/style/useNamingConvention: MCP protocol uses snake_case
  run_id: string;
}

/**
 * Handle spectacular_status MCP tool call.
 *
 * Retrieves job from in-memory Map and formats status response.
 * If job is not in memory, returns 'not_found' (resume logic is in Phase 5).
 *
 * @param args - Tool arguments containing run_id
 * @param jobs - In-memory job tracker (Map from execute handler)
 * @returns Status response for MCP client
 */
export async function handleStatus(
  args: StatusArgs,
  jobs: Map<string, ExecutionJob>
): Promise<StatusResponse> {
  const { run_id } = args;

  // Check in-memory job tracker
  const job = jobs.get(run_id);

  if (job) {
    // Job exists - return current status
    const response: StatusResponse = {
      phase: job.phase,
      // biome-ignore lint/style/useNamingConvention: MCP protocol uses snake_case
      run_id,
      status: job.status,
      tasks: job.tasks,
      // biome-ignore lint/style/useNamingConvention: MCP protocol uses snake_case
      total_phases: job.totalPhases,
    };

    // Only include error if present
    if (job.error !== undefined) {
      response.error = job.error;
    }

    return response;
  }

  // Job not in memory - resume logic is Phase 5 (not yet implemented)
  // For now, just return not_found
  return {
    // biome-ignore lint/style/useNamingConvention: MCP protocol uses snake_case
    run_id,
    status: 'not_found',
  };
}
