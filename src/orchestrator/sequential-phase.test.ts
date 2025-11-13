import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionJob, Phase, Plan } from '../types.js';
import * as branchTracker from '../utils/branch-tracker.js';
import { executeSequentialPhase } from './sequential-phase.js';

// Mock dependencies
vi.mock('../utils/branch-tracker.js');

// Mock Codex SDK (not yet installed, so we'll stub it)
interface MockCodexThread {
  run: ReturnType<typeof vi.fn>;
}

interface MockCodexInstance {
  startThread: ReturnType<typeof vi.fn>;
}

const mockCodex = {
  create(_workingDirectory: string): MockCodexInstance {
    const mockThread: MockCodexThread = {
      run: vi.fn().mockResolvedValue({ output: 'BRANCH: test-branch-name' }),
    };

    const instance: MockCodexInstance = {
      startThread: vi.fn().mockReturnValue(mockThread),
    };

    this.instances.push(instance);
    return instance;
  },
  instances: [] as MockCodexInstance[],
  reset() {
    this.instances = [];
  },
};

// Stub Codex constructor for now (will be replaced when SDK is installed)
vi.mock('@openai/codex', () => {
  const MockCodexConstructor = vi
    .fn()
    .mockImplementation((config: { workingDirectory: string }) => {
      return mockCodex.create(config.workingDirectory);
    });

  return {
    Codex: MockCodexConstructor,
  };
});

describe('sequential-phase orchestrator', () => {
  let phase: Phase;
  let plan: Plan;
  let job: ExecutionJob;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockCodex.reset();

    // Sample phase with 3 sequential tasks
    phase = {
      id: 4,
      name: 'Sequential Execution',
      strategy: 'sequential',
      tasks: [
        {
          acceptanceCriteria: ['Execute tasks one-by-one'],
          description: 'Implement sequential orchestrator',
          files: ['src/orchestrator/sequential-phase.ts'],
          id: '4-1',
          name: 'Sequential Phase Orchestrator',
        },
        {
          acceptanceCriteria: ['Natural git-spice stacking'],
          description: 'Stack branches automatically',
          files: ['src/orchestrator/sequential-phase.ts'],
          id: '4-2',
          name: 'Branch Stacking',
        },
        {
          acceptanceCriteria: ['Resume from last completed task'],
          description: 'Resume logic for sequential phases',
          files: ['src/orchestrator/sequential-phase.ts'],
          id: '4-3',
          name: 'Resume Logic',
        },
      ],
    };

    plan = {
      featureSlug: 'test-feature',
      phases: [phase],
      runId: 'abc123',
      stackingBackend: 'git-spice',
    };

    job = {
      phase: 4,
      runId: 'abc123',
      startedAt: new Date(),
      status: 'running',
      tasks: [],
      totalPhases: 5,
    };
  });

  describe('executeSequentialPhase', () => {
    it('executes tasks sequentially (one after another)', async () => {
      // Mock: no existing work, all tasks are pending
      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: [],
        pendingTasks: phase.tasks,
      });

      // Track execution order
      const executionOrder: string[] = [];

      // Mock thread.run() to track execution order
      mockCodex.create = (_workingDirectory: string): MockCodexInstance => {
        const mockThread: MockCodexThread = {
          run: vi.fn().mockImplementation(async (prompt: string) => {
            // Extract task ID from prompt instead of working directory
            const match = /Task ([0-9-]+)/.exec(prompt);
            const taskId = match?.[1];
            if (taskId) {
              executionOrder.push(taskId);
            }
            return { output: `BRANCH: abc123-task-${taskId}-impl` };
          }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockReturnValue(mockThread),
        };

        mockCodex.instances.push(instance);
        return instance;
      };

      // Execute phase
      await executeSequentialPhase(phase, plan, job);

      // Verify: 3 Codex instances created (one per task)
      expect(mockCodex.instances).toHaveLength(3);

      // Verify: tasks executed in order (4-1, then 4-2, then 4-3)
      expect(executionOrder).toEqual(['4-1', '4-2', '4-3']);

      // Verify: all tasks completed
      expect(job.tasks).toHaveLength(3);
      for (const taskStatus of job.tasks) {
        expect(taskStatus.status).toBe('completed');
      }
    });

    it('uses main worktree (not isolated worktrees)', async () => {
      // Mock: no existing work
      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: [],
        pendingTasks: phase.tasks,
      });

      // Track worktree paths used
      const worktreePaths: string[] = [];
      mockCodex.create = (workingDirectory: string): MockCodexInstance => {
        worktreePaths.push(workingDirectory);

        const mockThread: MockCodexThread = {
          run: vi.fn().mockResolvedValue({ output: 'BRANCH: test-branch' }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockReturnValue(mockThread),
        };

        mockCodex.instances.push(instance);
        return instance;
      };

      // Execute phase
      await executeSequentialPhase(phase, plan, job);

      // Verify: all Codex instances use same main worktree
      expect(mockCodex.instances).toHaveLength(3);

      // All instances should use abc123-main worktree
      expect(worktreePaths).toHaveLength(3);
      for (const path of worktreePaths) {
        expect(path).toBe('.worktrees/abc123-main');
      }
    });

    it('resumes from last completed task (resume logic)', async () => {
      // Mock: task 4-1 is already complete
      const firstTask = phase.tasks[0];
      const secondTask = phase.tasks[1];
      const thirdTask = phase.tasks[2];

      if (!firstTask || !secondTask || !thirdTask) {
        throw new Error('Missing phase tasks in test setup');
      }

      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: [
          {
            ...firstTask,
            branch: 'abc123-task-4-1-sequential-orchestrator',
            commitCount: 5,
          },
        ],
        pendingTasks: [secondTask, thirdTask],
      });

      // Execute phase
      await executeSequentialPhase(phase, plan, job);

      // Verify: only 2 threads spawned (for pending tasks)
      expect(mockCodex.instances).toHaveLength(2);

      // Verify: job includes completed task from resume
      expect(job.tasks).toHaveLength(3); // 1 from resume + 2 newly executed
      const completedFromResume = job.tasks.find((t) => t.id === '4-1');
      expect(completedFromResume?.status).toBe('completed');
      expect(completedFromResume?.branch).toBe('abc123-task-4-1-sequential-orchestrator');
    });

    it('fails fast on first task failure (sequential = fail fast)', async () => {
      // Mock: no existing work
      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: [],
        pendingTasks: phase.tasks,
      });

      // Mock: task 4-2 (second task) fails
      let callCount = 0;
      mockCodex.create = (_workingDirectory: string): MockCodexInstance => {
        callCount++;
        const shouldFail = callCount === 2; // Fail on second task

        const mockThread: MockCodexThread = {
          run: shouldFail
            ? vi.fn().mockRejectedValue(new Error('Task 4-2 failed'))
            : vi.fn().mockResolvedValue({ output: 'BRANCH: test-branch' }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockReturnValue(mockThread),
        };

        mockCodex.instances.push(instance);
        return instance;
      };

      // Execute phase and expect error
      await expect(executeSequentialPhase(phase, plan, job)).rejects.toThrow('Task 4-2 failed');

      // Verify: only 2 threads spawned (stopped after failure)
      expect(mockCodex.instances).toHaveLength(2);

      // Verify: job tasks include 1 success and 1 failure (no 4-3)
      expect(job.tasks).toHaveLength(2);
      expect(job.tasks[0]?.status).toBe('completed');
      expect(job.tasks[1]?.status).toBe('failed');
      expect(job.tasks[1]?.error).toContain('Task 4-2 failed');
    });

    it('updates job status with task results', async () => {
      // Mock: no existing work
      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: [],
        pendingTasks: phase.tasks,
      });

      // Mock thread to return proper branch names
      let taskCounter = 0;
      mockCodex.create = (_workingDirectory: string): MockCodexInstance => {
        taskCounter++;
        const taskId = `4-${taskCounter}`;

        const mockThread: MockCodexThread = {
          run: vi.fn().mockResolvedValue({
            output: `BRANCH: abc123-task-${taskId}-impl`,
          }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockReturnValue(mockThread),
        };

        mockCodex.instances.push(instance);
        return instance;
      };

      // Execute phase
      await executeSequentialPhase(phase, plan, job);

      // Verify: job.tasks updated with results
      expect(job.tasks).toHaveLength(3);

      for (const taskStatus of job.tasks) {
        expect(taskStatus.status).toBe('completed');
        expect(taskStatus.branch).toBeDefined();
        expect(taskStatus.branch).toMatch(/^abc123-task-[0-9]+-[0-9]+-/);
      }
    });

    it('propagates errors to job.error if phase execution fails', async () => {
      // Mock: checkExistingWork fails
      vi.mocked(branchTracker.checkExistingWork).mockRejectedValue(
        new Error('Git operation failed')
      );

      // Execute phase and expect error
      await expect(executeSequentialPhase(phase, plan, job)).rejects.toThrow(
        'Git operation failed'
      );

      // Verify: job status updated to failed
      expect(job.status).toBe('failed');
      expect(job.error).toContain('Git operation failed');
    });

    it('naturally stacks branches via git-spice (no manual upstack)', async () => {
      // Mock: no existing work
      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: [],
        pendingTasks: phase.tasks,
      });

      // Mock thread output with different branch names
      let callCount = 0;
      mockCodex.create = (_workingDirectory: string): MockCodexInstance => {
        callCount++;
        const taskId = `4-${callCount}`;

        const mockThread: MockCodexThread = {
          run: vi
            .fn()
            .mockResolvedValue({ output: `BRANCH: abc123-task-${taskId}-branch-${callCount}` }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockReturnValue(mockThread),
        };

        mockCodex.instances.push(instance);
        return instance;
      };

      // Execute phase
      await executeSequentialPhase(phase, plan, job);

      // Verify: each task creates a branch (natural stacking via git-spice)
      expect(job.tasks).toHaveLength(3);
      expect(job.tasks[0]?.branch).toBe('abc123-task-4-1-branch-1');
      expect(job.tasks[1]?.branch).toBe('abc123-task-4-2-branch-2');
      expect(job.tasks[2]?.branch).toBe('abc123-task-4-3-branch-3');

      // Note: Natural stacking means each branch builds on previous
      // No manual `gs upstack onto` commands needed
      // This is tested implicitly by running in main worktree where HEAD advances
    });

    it('handles empty task list gracefully', async () => {
      // Mock: all tasks already completed
      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: phase.tasks.map((task) => ({
          ...task,
          branch: `abc123-task-${task.id}-completed`,
          commitCount: 3,
        })),
        pendingTasks: [],
      });

      // Execute phase
      await executeSequentialPhase(phase, plan, job);

      // Verify: no threads spawned
      expect(mockCodex.instances).toHaveLength(0);

      // Verify: all tasks marked as completed from resume
      expect(job.tasks).toHaveLength(3);
      for (const taskStatus of job.tasks) {
        expect(taskStatus.status).toBe('completed');
      }
    });
  });
});
