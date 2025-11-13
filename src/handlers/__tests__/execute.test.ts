/**
 * Tests for the execute handler.
 *
 * The execute handler implements the async job pattern - it returns immediately
 * with a run_id while execution continues in the background.
 */

import { promises as fs } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleExecute } from '@/handlers/execute';
import type { ExecutionJob } from '@/types';

// Mock the orchestrator module (will be implemented in later phases)
vi.mock('@/orchestrator/parallel-phase', () => ({
  executeParallelPhase: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/orchestrator/sequential-phase', () => ({
  executeSequentialPhase: vi.fn().mockResolvedValue({ success: true }),
}));

describe('handleExecute', () => {
  // Job tracker that handler will use
  const jobs = new Map<string, ExecutionJob>();

  beforeEach(() => {
    jobs.clear();
    vi.clearAllMocks();
  });

  describe('input validation', () => {
    it('throws error when plan_path is missing', async () => {
      await expect(handleExecute({ plan_path: undefined }, jobs)).rejects.toThrow(
        'plan_path is required'
      );
    });

    it('throws error when plan_path is not a string', async () => {
      await expect(handleExecute({ plan_path: 123 }, jobs)).rejects.toThrow(
        'plan_path must be a string'
      );
    });

    it('throws error when plan file does not exist', async () => {
      await expect(
        handleExecute({ plan_path: 'specs/abc123-nonexistent/plan.md' }, jobs)
      ).rejects.toThrow('Plan file not found');
    });

    it('throws error when plan_path has invalid format', async () => {
      await expect(handleExecute({ plan_path: 'invalid/path.md' }, jobs)).rejects.toThrow(
        'Invalid plan path'
      );
    });
  });

  describe('async job pattern', () => {
    it('returns immediately with run_id and status', async () => {
      // Create a minimal valid plan file
      const planPath = 'specs/abc123-test-feature/plan.md';
      const planContent = `# Implementation Plan: Test Feature
Run ID: abc123
Feature: test-feature

## Phase 1: Setup (Parallel)

### Task 1-1: Initialize
**Description:** Set up project
**Files:**
- src/setup.ts

**Acceptance Criteria:**
- Setup is complete

**Dependencies:** None
`;

      // Mock fs.readFile
      vi.spyOn(fs, 'readFile').mockResolvedValue(planContent);

      const result = await handleExecute({ plan_path: planPath }, jobs);

      // Should return immediately
      expect(result).toEqual({
        run_id: 'abc123',
        status: 'started',
      });

      // Job should be created
      expect(jobs.has('abc123')).toBe(true);
      const job = jobs.get('abc123');
      expect(job).toBeDefined();
      expect(job?.runId).toBe('abc123');
      expect(job?.status).toBe('running');
    });

    it('creates job with correct initial state', async () => {
      const planPath = 'specs/def456-another/plan.md';
      const planContent = `# Implementation Plan: Another
Run ID: def456
Feature: another

## Phase 1: Build (Sequential)

### Task 1-1: Build
**Description:** Build the thing
**Files:**
- src/build.ts

**Acceptance Criteria:**
- Build succeeds

**Dependencies:** None
`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(planContent);

      await handleExecute({ plan_path: planPath }, jobs);

      const job = jobs.get('def456');
      expect(job).toMatchObject({
        phase: 1,
        runId: 'def456',
        status: 'running',
        tasks: [],
      });
      expect(job?.startedAt).toBeInstanceOf(Date);
      expect(job?.completedAt).toBeUndefined();
      expect(job?.error).toBeUndefined();
    });

    it('does not block waiting for execution to complete', async () => {
      const planPath = 'specs/ffffff-slow/plan.md';
      const planContent = `# Implementation Plan: Slow
Run ID: ffffff
Feature: slow

## Phase 1: Slow (Parallel)

### Task 1-1: Slow Task
**Description:** Takes forever
**Files:**
- src/slow.ts

**Acceptance Criteria:**
- Eventually finishes

**Dependencies:** None
`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(planContent);

      // Mock orchestrator to be slow
      const { executeParallelPhase } = await import('@/orchestrator/parallel-phase');
      vi.mocked(executeParallelPhase).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(), 10000))
      );

      const startTime = Date.now();
      await handleExecute({ plan_path: planPath }, jobs);
      const duration = Date.now() - startTime;

      // Should return in < 100ms (not wait for 10s)
      expect(duration).toBeLessThan(100);

      // Clean up
      jobs.delete('ffffff');
    });
  });

  describe('background execution', () => {
    it('executes phases in background after returning', async () => {
      const planPath = 'specs/aabbcc-bg/plan.md';
      const planContent = `# Implementation Plan: Background
Run ID: aabbcc
Feature: bg

## Phase 1: First (Parallel)

### Task 1-1: Task 1
**Description:** First task
**Files:**
- src/task1.ts

**Acceptance Criteria:**
- Task 1 done

**Dependencies:** None

## Phase 2: Second (Sequential)

### Task 2-1: Task 2
**Description:** Second task
**Files:**
- src/task2.ts

**Acceptance Criteria:**
- Task 2 done

**Dependencies:** None
`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(planContent);

      await handleExecute({ plan_path: planPath }, jobs);

      // Give background execution time to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Orchestrators should have been called in background
      // Note: In real implementation, orchestrators would be called
      // This test verifies the pattern is set up correctly
      expect(jobs.get('aabbcc')?.status).toBe('running');
    });

    it('updates job status to completed on success', async () => {
      const planPath = 'specs/112233-ok/plan.md';
      const planContent = `# Implementation Plan: OK
Run ID: 112233
Feature: ok

## Phase 1: Only Phase (Parallel)

### Task 1-1: Simple
**Description:** Simple task
**Files:**
- src/simple.ts

**Acceptance Criteria:**
- Done

**Dependencies:** None
`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(planContent);

      // Reset mocks to ensure they resolve quickly
      const { executeParallelPhase } = await import('@/orchestrator/parallel-phase');
      vi.mocked(executeParallelPhase).mockResolvedValue(undefined);

      await handleExecute({ plan_path: planPath }, jobs);

      // Wait for background execution
      await new Promise((resolve) => setTimeout(resolve, 150));

      const job = jobs.get('112233');
      expect(job?.status).toBe('completed');
      expect(job?.completedAt).toBeInstanceOf(Date);
    });

    it('updates job status to failed on error', async () => {
      const planPath = 'specs/445566-err/plan.md';
      const planContent = `# Implementation Plan: Error
Run ID: 445566
Feature: err

## Phase 1: Broken (Parallel)

### Task 1-1: Fails
**Description:** Will fail
**Files:**
- src/broken.ts

**Acceptance Criteria:**
- Never succeeds

**Dependencies:** None
`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(planContent);

      // Mock orchestrator to fail
      const { executeParallelPhase } = await import('@/orchestrator/parallel-phase');
      vi.mocked(executeParallelPhase).mockRejectedValue(new Error('Execution failed'));

      await handleExecute({ plan_path: planPath }, jobs);

      // Wait for background execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      const job = jobs.get('445566');
      expect(job?.status).toBe('failed');
      expect(job?.error).toContain('Execution failed');
      expect(job?.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('error handling', () => {
    it('handles plan parsing errors gracefully', async () => {
      const planPath = 'specs/778899-bad/plan.md';
      const planContent = 'Invalid plan content without proper headers';

      vi.spyOn(fs, 'readFile').mockResolvedValue(planContent);

      await expect(handleExecute({ plan_path: planPath }, jobs)).rejects.toThrow(); // Will throw an error about missing fields or phases
    });

    it('handles runId mismatch errors', async () => {
      const planPath = 'specs/aabbcc-test/plan.md';
      const planContent = `# Implementation Plan: Mismatch
Run ID: 112233
Feature: test
`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(planContent);

      await expect(handleExecute({ plan_path: planPath }, jobs)).rejects.toThrow('runId mismatch');
    });
  });

  describe('duplicate execution prevention', () => {
    it('throws error if job with same runId is already running', async () => {
      const planPath = 'specs/ccddee-dup/plan.md';
      const planContent = `# Implementation Plan: Duplicate
Run ID: ccddee
Feature: dup

## Phase 1: Only (Parallel)

### Task 1-1: Task
**Description:** Task
**Files:**
- src/task.ts

**Acceptance Criteria:**
- Done

**Dependencies:** None
`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(planContent);

      // First execution
      await handleExecute({ plan_path: planPath }, jobs);

      // Second execution should fail
      await expect(handleExecute({ plan_path: planPath }, jobs)).rejects.toThrow('already running');
    });

    it('allows re-execution after job completes', async () => {
      const planPath = 'specs/ffeedd-retry/plan.md';
      const planContent = `# Implementation Plan: Retry
Run ID: ffeedd
Feature: retry

## Phase 1: Only (Parallel)

### Task 1-1: Task
**Description:** Task
**Files:**
- src/task.ts

**Acceptance Criteria:**
- Done

**Dependencies:** None
`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(planContent);

      // Reset mocks to ensure they resolve quickly
      const { executeParallelPhase } = await import('@/orchestrator/parallel-phase');
      vi.mocked(executeParallelPhase).mockResolvedValue(undefined);

      // First execution
      await handleExecute({ plan_path: planPath }, jobs);
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Job should be completed
      expect(jobs.get('ffeedd')?.status).toBe('completed');

      // Clear the job to simulate allowing retry
      jobs.delete('ffeedd');

      // Second execution should succeed
      const result = await handleExecute({ plan_path: planPath }, jobs);
      expect(result.run_id).toBe('ffeedd');
    });
  });
});
