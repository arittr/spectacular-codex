/**
 * Tests for plan handler.
 *
 * Verifies the async job pattern:
 * - Returns immediately with run_id
 * - Spawns background Codex thread for plan generation
 * - Extracts runId from spec path
 * - Validates inputs
 *
 * @module handlers/plan.test
 */

import { describe, expect, it } from 'vitest';
import { handlePlan } from '@/handlers/plan';
import type { ExecutionJob } from '@/types';

describe('handlePlan', () => {
  it('should return immediately with run_id and status', async () => {
    const args = { spec_path: 'specs/abc123-feature/spec.md' };
    const jobs = new Map<string, ExecutionJob>();

    const result = await handlePlan(args, jobs);

    expect(result).toEqual({
      run_id: 'abc123',
      status: 'started',
    });
  });

  it('should extract runId from spec path', async () => {
    const args = { spec_path: 'specs/def456-auth-system/spec.md' };
    const jobs = new Map<string, ExecutionJob>();

    const result = await handlePlan(args, jobs);

    expect(result.run_id).toBe('def456');
  });

  it('should throw error if spec_path is missing', async () => {
    const args = { spec_path: undefined };
    const jobs = new Map<string, ExecutionJob>();

    await expect(handlePlan(args, jobs)).rejects.toThrow('spec_path is required');
  });

  it('should throw error if spec_path is not a string', async () => {
    const args = { spec_path: 123 };
    const jobs = new Map<string, ExecutionJob>();

    await expect(handlePlan(args, jobs)).rejects.toThrow('spec_path must be a string');
  });

  it('should throw error if spec_path has invalid format', async () => {
    const args = { spec_path: 'invalid/path.md' };
    const jobs = new Map<string, ExecutionJob>();

    await expect(handlePlan(args, jobs)).rejects.toThrow('Invalid spec path format');
  });

  it('should return existing run_id if already in progress', async () => {
    const args = { spec_path: 'specs/abc123-feature/spec.md' };
    const jobs = new Map<string, ExecutionJob>();

    // First call
    await handlePlan(args, jobs);

    // Second call should succeed (plan generation is idempotent)
    const result = await handlePlan(args, jobs);

    expect(result.run_id).toBe('abc123');
  });
});
