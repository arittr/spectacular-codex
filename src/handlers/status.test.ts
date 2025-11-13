/**
 * Unit tests for status handler.
 *
 * Tests the handleStatus function that retrieves job state from the Map
 * and formats status responses for MCP tool calls.
 *
 * @module handlers/status.test
 */

import { describe, expect, it } from 'vitest';
import type { ExecutionJob } from '../types.js';
import { handleStatus } from './status.js';

describe('handleStatus', () => {
  it('returns running status for active job', async () => {
    const jobs = new Map<string, ExecutionJob>();
    const job: ExecutionJob = {
      phase: 2,
      runId: 'abc123',
      startedAt: new Date(),
      status: 'running',
      tasks: [
        { branch: 'abc123-task-1-1-setup', id: '1-1', status: 'completed' },
        { id: '2-1', status: 'running' },
      ],
      totalPhases: 2,
    };
    jobs.set('abc123', job);

    const result = await handleStatus({ run_id: 'abc123' }, jobs);

    expect(result).toEqual({
      phase: 2,
      run_id: 'abc123',
      status: 'running',
      tasks: job.tasks,
      total_phases: 2,
    });
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
    expect(result.total_phases).toBe(3);
    expect(result.tasks?.length).toBe(3);
    expect(result.tasks?.every((t) => t.status === 'completed')).toBe(true);
  });

  it('returns not_found for unknown run_id', async () => {
    const jobs = new Map<string, ExecutionJob>();

    const result = await handleStatus({ run_id: 'unknown' }, jobs);

    expect(result).toEqual({
      run_id: 'unknown',
      status: 'not_found',
    });
  });

  it('returns failed status with error message', async () => {
    const jobs = new Map<string, ExecutionJob>();
    const job: ExecutionJob = {
      completedAt: new Date(),
      error: 'Phase 1 failed: task 1-1 compilation error',
      phase: 1,
      runId: 'err123',
      startedAt: new Date(),
      status: 'failed',
      tasks: [{ error: 'Compile error', id: '1-1', status: 'failed' }],
      totalPhases: 1,
    };
    jobs.set('err123', job);

    const result = await handleStatus({ run_id: 'err123' }, jobs);

    expect(result.status).toBe('failed');
    expect(result.run_id).toBe('err123');
    expect(result.error).toBe('Phase 1 failed: task 1-1 compilation error');
    expect(result.phase).toBe(1);
    expect(result.tasks?.[0]?.error).toBe('Compile error');
  });

  it('returns status with multiple pending tasks', async () => {
    const jobs = new Map<string, ExecutionJob>();
    const job: ExecutionJob = {
      phase: 2,
      runId: 'multi123',
      startedAt: new Date(),
      status: 'running',
      tasks: [
        { branch: 'multi123-task-1-1', id: '1-1', status: 'completed' },
        { branch: 'multi123-task-1-2', id: '1-2', status: 'completed' },
        { id: '2-1', status: 'running' },
        { id: '2-2', status: 'pending' },
        { id: '2-3', status: 'pending' },
      ],
      totalPhases: 2,
    };
    jobs.set('multi123', job);

    const result = await handleStatus({ run_id: 'multi123' }, jobs);

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
      runId: 'minimal',
      startedAt: new Date(),
      status: 'running',
      tasks: [{ id: '1-1', status: 'running' }],
      totalPhases: 1,
    };
    jobs.set('minimal', job);

    const result = await handleStatus({ run_id: 'minimal' }, jobs);

    expect(result.status).toBe('running');
    expect(result.error).toBeUndefined();
    expect(result.tasks?.[0]?.branch).toBeUndefined();
    expect(result.tasks?.[0]?.error).toBeUndefined();
  });
});
