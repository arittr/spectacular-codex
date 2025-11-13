/**
 * Unit tests for status handler.
 *
 * Tests the handleStatus function that retrieves job state from the Map
 * and formats status responses for MCP tool calls.
 *
 * @module handlers/status.test
 */

import { describe, expect, it } from 'vitest';
import { handleStatus } from '@/handlers/status';
import type { ExecutionJob } from '@/types';

describe('handleStatus', () => {
  it('returns running status for active job', async () => {
    const jobs = new Map<string, ExecutionJob>();
    const startedAt = new Date();
    const job: ExecutionJob = {
      phase: 2,
      runId: 'abc123',
      startedAt,
      status: 'running',
      tasks: [
        { branch: 'abc123-task-1-1-setup', id: '1-1', status: 'completed' },
        { id: '2-1', status: 'running' },
      ],
      totalPhases: 2,
    };
    jobs.set('abc123', job);

    const result = await handleStatus({ run_id: 'abc123' }, jobs);

    expect(result.status).toBe('running');
    expect(result.run_id).toBe('abc123');
    expect(result.phase).toBe(2);
    expect(result.tasks).toEqual(job.tasks);
    expect(result.started_at).toBe(startedAt.toISOString());
  });

  it('returns completed status with all tasks', async () => {
    const jobs = new Map<string, ExecutionJob>();
    const completedAt = new Date();
    const job: ExecutionJob = {
      completedAt,
      phase: 3,
      runId: 'def456',
      startedAt: new Date(),
      status: 'completed',
      tasks: [
        { branch: 'def456-task-1-1', id: '1-1', status: 'completed' },
        { branch: 'def456-task-2-1', id: '2-1', status: 'completed' },
        { branch: 'def456-task-3-1', id: '3-1', status: 'completed' },
      ],
      totalPhases: 3,
    };
    jobs.set('def456', job);

    const result = await handleStatus({ run_id: 'def456' }, jobs);

    expect(result.status).toBe('completed');
    expect(result.run_id).toBe('def456');
    expect(result.phase).toBe(3);
    expect(result.tasks?.length).toBe(3);
    expect(result.tasks?.every((t) => t.status === 'completed')).toBe(true);
    expect(result.completed_at).toBe(completedAt.toISOString());
  });

  it('returns not_found for unknown run_id', async () => {
    const jobs = new Map<string, ExecutionJob>();

    await expect(handleStatus({ run_id: '999999' }, jobs)).rejects.toThrow('Job not found: 999999');
  });

  it('returns failed status with error message', async () => {
    const jobs = new Map<string, ExecutionJob>();
    const job: ExecutionJob = {
      completedAt: new Date(),
      error: 'Phase 1 failed: task 1-1 compilation error',
      phase: 1,
      runId: 'aaa123',
      startedAt: new Date(),
      status: 'failed',
      tasks: [{ error: 'Compile error', id: '1-1', status: 'failed' }],
      totalPhases: 1,
    };
    jobs.set('aaa123', job);

    const result = await handleStatus({ run_id: 'aaa123' }, jobs);

    expect(result.status).toBe('failed');
    expect(result.run_id).toBe('aaa123');
    expect(result.error).toBe('Phase 1 failed: task 1-1 compilation error');
    expect(result.phase).toBe(1);
    expect(result.tasks?.[0]?.error).toBe('Compile error');
  });

  it('returns status with multiple pending tasks', async () => {
    const jobs = new Map<string, ExecutionJob>();
    const job: ExecutionJob = {
      phase: 2,
      runId: 'bbb456',
      startedAt: new Date(),
      status: 'running',
      tasks: [
        { branch: 'bbb456-task-1-1', id: '1-1', status: 'completed' },
        { branch: 'bbb456-task-1-2', id: '1-2', status: 'completed' },
        { id: '2-1', status: 'running' },
        { id: '2-2', status: 'pending' },
        { id: '2-3', status: 'pending' },
      ],
      totalPhases: 2,
    };
    jobs.set('bbb456', job);

    const result = await handleStatus({ run_id: 'bbb456' }, jobs);

    expect(result.status).toBe('running');
    expect(result.tasks?.length).toBe(5);
    expect(result.tasks?.filter((t) => t.status === 'completed').length).toBe(2);
    expect(result.tasks?.filter((t) => t.status === 'pending').length).toBe(2);
    expect(result.tasks?.filter((t) => t.status === 'running').length).toBe(1);
  });

  it('omits optional fields when not present', async () => {
    const jobs = new Map<string, ExecutionJob>();
    const job: ExecutionJob = {
      phase: 1,
      runId: 'ccc789',
      startedAt: new Date(),
      status: 'running',
      tasks: [{ id: '1-1', status: 'running' }],
      totalPhases: 1,
    };
    jobs.set('ccc789', job);

    const result = await handleStatus({ run_id: 'ccc789' }, jobs);

    expect(result.status).toBe('running');
    expect(result.error).toBeUndefined();
    expect(result.tasks?.[0]?.branch).toBeUndefined();
    expect(result.tasks?.[0]?.error).toBeUndefined();
  });
});
