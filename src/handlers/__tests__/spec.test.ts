/**
 * Tests for the spec handler.
 *
 * The spec handler implements the async job pattern - it returns immediately
 * with a run_id while spec generation continues in the background.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSpec } from '@/handlers/spec';
import type { ExecutionJob } from '@/types';
import { extractMCPData } from '@/utils/__tests__/test-helpers';

describe('handleSpec', () => {
  // Job tracker that handler will use
  const jobs = new Map<string, ExecutionJob>();

  beforeEach(() => {
    jobs.clear();
    vi.clearAllMocks();
  });

  describe('input validation', () => {
    it('throws error when feature_request is missing', async () => {
      await expect(handleSpec({ feature_request: undefined }, jobs)).rejects.toThrow(
        'feature_request is required'
      );
    });

    it('throws error when feature_request is not a string', async () => {
      await expect(handleSpec({ feature_request: 123 }, jobs)).rejects.toThrow(
        'feature_request must be a string'
      );
    });

    it('throws error when feature_request is empty', async () => {
      await expect(handleSpec({ feature_request: '' }, jobs)).rejects.toThrow(
        'feature_request cannot be empty'
      );
    });
  });

  describe('async job pattern', () => {
    it('returns immediately with run_id and status', async () => {
      const response = await handleSpec({ feature_request: 'Add dark mode' }, jobs);
      const result = extractMCPData<{ run_id: string; status: string }>(response);

      // Should return immediately
      expect(result).toHaveProperty('run_id');
      expect(result).toHaveProperty('status', 'started');
      expect(result.run_id).toMatch(/^[0-9a-f]{6}$/i);
    });

    it('generates unique runIds for different requests', async () => {
      const response1 = await handleSpec({ feature_request: 'Feature 1' }, jobs);
      const response2 = await handleSpec({ feature_request: 'Feature 2' }, jobs);
      const result1 = extractMCPData<{ run_id: string }>(response1);
      const result2 = extractMCPData<{ run_id: string }>(response2);

      expect(result1.run_id).not.toBe(result2.run_id);
      expect(result1.run_id).toMatch(/^[0-9a-f]{6}$/i);
      expect(result2.run_id).toMatch(/^[0-9a-f]{6}$/i);
    });

    it('creates job with correct initial state', async () => {
      const response = await handleSpec({ feature_request: 'Test feature' }, jobs);
      const result = extractMCPData<{ run_id: string }>(response);

      const job = jobs.get(result.run_id);
      expect(job).toBeDefined();
      expect(job).toMatchObject({
        phase: 0, // Spec generation is phase 0 (pre-implementation)
        runId: result.run_id,
        status: 'running',
        tasks: [],
      });
      expect(job?.startedAt).toBeInstanceOf(Date);
      expect(job?.completedAt).toBeUndefined();
      expect(job?.error).toBeUndefined();
    });

    it('does not block waiting for spec generation to complete', async () => {
      const startTime = Date.now();
      await handleSpec({ feature_request: 'Complex feature' }, jobs);
      const duration = Date.now() - startTime;

      // Should return in < 100ms (not wait for spec generation)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('background execution', () => {
    it('spawns spec generation in background after returning', async () => {
      const response = await handleSpec({ feature_request: 'Background test' }, jobs);
      const result = extractMCPData<{ run_id: string }>(response);

      // Give background execution time to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Job should still be running (spec generation not instant)
      expect(jobs.get(result.run_id)?.status).toBe('running');
    });
  });

  describe('runId format', () => {
    it('generates 6-character hexadecimal runId', async () => {
      const response = await handleSpec({ feature_request: 'Test' }, jobs);
      const result = extractMCPData<{ run_id: string }>(response);

      expect(result.run_id).toHaveLength(6);
      expect(result.run_id).toMatch(/^[0-9a-f]{6}$/i);
    });
  });
});
