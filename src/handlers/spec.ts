/**
 * Spec handler for spectacular-codex MCP server.
 *
 * Implements the async job pattern - returns immediately with run_id while
 * spec generation continues in background.
 *
 * @module handlers/spec
 */

import { randomBytes } from 'node:crypto';
import { generateSpecPrompt } from '../prompts/spec-generator.js';
import type { ExecutionJob } from '../types.js';

/**
 * Arguments for the spec handler.
 */
export interface SpecArgs {
  // biome-ignore lint/style/useNamingConvention: MCP API uses snake_case
  feature_request: unknown;
}

/**
 * Response from the spec handler.
 */
export interface SpecResponse {
  // biome-ignore lint/style/useNamingConvention: MCP API uses snake_case
  run_id: string;
  status: 'started';
}

/**
 * Generates a unique 6-character hexadecimal run identifier.
 *
 * @returns A 6-character hex string (e.g., "abc123", "def456")
 */
export function generateRunId(): string {
  return randomBytes(3).toString('hex');
}

/**
 * Handles the spectacular_spec MCP tool call.
 *
 * This implements the async job pattern:
 * 1. Validates feature_request input
 * 2. Generates unique runId
 * 3. Creates ExecutionJob in job tracker
 * 4. Starts background spec generation (non-blocking)
 * 5. Returns immediately with run_id
 *
 * @param args - Tool arguments containing feature_request
 * @param jobs - In-memory job tracker (Map of runId -> ExecutionJob)
 * @returns Promise resolving to SpecResponse with run_id
 * @throws {Error} If inputs are invalid
 */
export async function handleSpec(
  args: SpecArgs,
  jobs: Map<string, ExecutionJob>
): Promise<SpecResponse> {
  // Validate inputs
  if (args.feature_request === undefined || args.feature_request === null) {
    throw new Error('feature_request is required');
  }

  if (typeof args.feature_request !== 'string') {
    throw new Error('feature_request must be a string');
  }

  if (args.feature_request.trim() === '') {
    throw new Error('feature_request cannot be empty');
  }

  const featureRequest = args.feature_request.trim();

  // Generate unique runId
  const runId = generateRunId();

  // Create job tracker
  const job: ExecutionJob = {
    phase: 0, // Phase 0 for spec generation (pre-implementation)
    runId,
    startedAt: new Date(),
    status: 'running',
    tasks: [],
  };

  jobs.set(runId, job);

  // Generate spec in background (non-blocking)
  generateSpec(featureRequest, runId, job).catch((error) => {
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
 * Generates spec in the background using Codex thread.
 *
 * This function runs in the background after handleSpec returns.
 * It spawns a Codex thread with the spec generation prompt.
 *
 * @param featureRequest - Feature description from user
 * @param runId - Unique run identifier
 * @param job - Job tracker to update with progress
 */
async function generateSpec(
  featureRequest: string,
  runId: string,
  job: ExecutionJob
): Promise<void> {
  // Generate prompt
  const _prompt = generateSpecPrompt(featureRequest, runId);

  // TODO: Spawn Codex thread with prompt
  // const codex = new Codex({ workingDirectory: '.' });
  // const thread = codex.startThread();
  // const result = await thread.run(_prompt);
  // Parse SPEC_PATH from result and update job

  // For now, simulate async work with a delay
  // (Real implementation will spawn Codex thread)
  await new Promise((resolve) => setTimeout(resolve, 100));

  job.status = 'completed';
  job.completedAt = new Date();
}
