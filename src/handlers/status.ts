/**
 * Status handler for spectacular-codex MCP server.
 *
 * Retrieves current execution status from in-memory job tracker.
 *
 * @module handlers/status
 */

import type { ExecutionJob } from '@/types';
import { validateRunId } from '@/utils/validation';

/**
 * Arguments for the status handler.
 */
export interface StatusArgs {
  run_id: unknown;
}

/**
 * Response from the status handler.
 */
export interface StatusResponse {
  run_id: string;
  status: 'running' | 'completed' | 'failed';
  phase: number;
  tasks: Array<{
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    branch?: string;
    error?: string;
  }>;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

/**
 * Handles the spectacular_status MCP tool call.
 *
 * Retrieves execution status from the in-memory job tracker.
 *
 * @param args - Tool arguments containing run_id
 * @param jobs - In-memory job tracker (Map of runId -> ExecutionJob)
 * @returns Promise resolving to StatusResponse with job details
 * @throws {Error} If run_id is missing or job not found
 */
export async function handleStatus(
  args: StatusArgs,
  jobs: Map<string, ExecutionJob>
): Promise<StatusResponse> {
  // Validate inputs
  if (!args.run_id) {
    throw new Error('run_id is required');
  }

  if (typeof args.run_id !== 'string') {
    throw new Error('run_id must be a string');
  }

  const runId = args.run_id;

  // Validate run_id format (must be 6-char hex)
  validateRunId(runId);

  // Retrieve job
  const job = jobs.get(runId);
  if (!job) {
    throw new Error(`Job not found: ${runId}`);
  }

  // Format response
  const response: StatusResponse = {
    phase: job.phase,
    run_id: job.runId,
    started_at: job.startedAt.toISOString(),
    status: job.status,
    tasks: job.tasks,
  };

  // Add optional fields only if they exist (for exactOptionalPropertyTypes)
  if (job.completedAt !== undefined) {
    response.completed_at = job.completedAt.toISOString();
  }

  if (job.error !== undefined) {
    response.error = job.error;
  }

  return response;
}
