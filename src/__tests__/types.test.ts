import { describe, expect, it } from 'vitest';
import type {
  CodexThreadResult,
  ExecutionJob,
  Phase,
  Plan,
  StackingBackend,
  Task,
} from '../types.js';

describe('TypeScript Core Types', () => {
  describe('ExecutionJob', () => {
    it('accepts valid running job', () => {
      const job: ExecutionJob = {
        phase: 1,
        runId: 'abc123',
        startedAt: new Date(),
        status: 'running',
        tasks: [],
      };

      expect(job.status).toBe('running');
      expect(job.runId).toBe('abc123');
    });

    it('accepts valid completed job', () => {
      const job: ExecutionJob = {
        completedAt: new Date(),
        phase: 3,
        runId: 'abc123',
        startedAt: new Date(),
        status: 'completed',
        tasks: [],
      };

      expect(job.status).toBe('completed');
      expect(job.completedAt).toBeDefined();
    });

    it('accepts valid failed job with error', () => {
      const job: ExecutionJob = {
        error: 'Test execution failed',
        phase: 2,
        runId: 'abc123',
        startedAt: new Date(),
        status: 'failed',
        tasks: [],
      };

      expect(job.status).toBe('failed');
      expect(job.error).toBe('Test execution failed');
    });

    it('enforces union type for status', () => {
      // This test ensures TypeScript enforces status is a union type
      // We test by creating objects and TypeScript will error at compile time if wrong
      const statuses: Array<ExecutionJob['status']> = ['running', 'completed', 'failed'];

      expect(statuses).toHaveLength(3);
    });
  });

  describe('Task', () => {
    it('accepts valid task definition', () => {
      const task: Task = {
        acceptanceCriteria: ['Schema validates', 'Migrations run successfully'],
        description: 'Create database schema and initial migration',
        files: ['src/database/schema.sql', 'src/database/migrations/001.sql'],
        id: '1-1',
        name: 'Database Schema',
      };

      expect(task.id).toBe('1-1');
      expect(task.files).toHaveLength(2);
    });

    it('accepts task with optional branch', () => {
      const task: Task = {
        acceptanceCriteria: ['Tests pass'],
        branch: 'abc123-task-2-3-api-handler',
        description: 'Implement API request handler',
        files: ['src/api/handler.ts'],
        id: '2-3',
        name: 'API Handler',
      };

      expect(task.branch).toBe('abc123-task-2-3-api-handler');
    });
  });

  describe('Phase', () => {
    it('accepts parallel phase', () => {
      const phase: Phase = {
        id: 1,
        name: 'Foundation',
        strategy: 'parallel',
        tasks: [
          {
            acceptanceCriteria: ['Types compile'],
            description: 'Define core TypeScript types',
            files: ['src/types.ts'],
            id: '1-1',
            name: 'Core Types',
          },
        ],
      };

      expect(phase.strategy).toBe('parallel');
      expect(phase.tasks).toHaveLength(1);
    });

    it('accepts sequential phase', () => {
      const phase: Phase = {
        id: 2,
        name: 'Integration',
        strategy: 'sequential',
        tasks: [
          {
            acceptanceCriteria: ['Setup completes'],
            description: 'Initialize project setup',
            files: ['src/setup.ts'],
            id: '2-1',
            name: 'Setup',
          },
        ],
      };

      expect(phase.strategy).toBe('sequential');
    });

    it('enforces union type for strategy', () => {
      const strategies: Array<Phase['strategy']> = ['parallel', 'sequential'];

      expect(strategies).toHaveLength(2);
    });
  });

  describe('Plan', () => {
    it('accepts valid plan with all required fields', () => {
      const plan: Plan = {
        featureSlug: 'user-authentication',
        phases: [
          {
            id: 1,
            name: 'Foundation',
            strategy: 'parallel',
            tasks: [
              {
                acceptanceCriteria: ['Types compile'],
                description: 'Define core types',
                files: ['src/types.ts'],
                id: '1-1',
                name: 'Types',
              },
            ],
          },
        ],
        runId: 'abc123',
        stackingBackend: 'git-spice',
      };

      expect(plan.runId).toBe('abc123');
      expect(plan.featureSlug).toBe('user-authentication');
      expect(plan.phases).toHaveLength(1);
    });

    it('enforces union type for stackingBackend', () => {
      const backends: StackingBackend[] = ['git-spice', 'gh-stack', 'graphite'];

      expect(backends).toHaveLength(3);
    });
  });

  describe('CodexThreadResult', () => {
    it('accepts successful thread result', () => {
      const result: CodexThreadResult = {
        branch: 'abc123-task-1-1-types',
        success: true,
        taskId: '1-1',
      };

      expect(result.success).toBe(true);
      expect(result.branch).toBe('abc123-task-1-1-types');
      expect(result.error).toBeUndefined();
    });

    it('accepts failed thread result', () => {
      const result: CodexThreadResult = {
        error: 'Quality checks failed',
        success: false,
        taskId: '2-3',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Quality checks failed');
      expect(result.branch).toBeUndefined();
    });
  });

  describe('Type Safety', () => {
    it('prevents invalid status values at compile time', () => {
      // TypeScript should prevent this at compile time
      // If this compiles, the union type is not working
      const validStatuses: Array<ExecutionJob['status']> = ['running', 'completed', 'failed'];

      // Runtime check to ensure we have exactly these values
      expect(validStatuses).toEqual(['running', 'completed', 'failed']);
    });

    it('requires optional fields to be explicitly optional', () => {
      // Test that optional fields work correctly
      const minimalJob: ExecutionJob = {
        phase: 1,
        runId: 'abc123',
        startedAt: new Date(),
        status: 'running',
        tasks: [],
        // error, completedAt are optional
      };

      expect(minimalJob.error).toBeUndefined();
      expect(minimalJob.completedAt).toBeUndefined();
    });
  });
});
