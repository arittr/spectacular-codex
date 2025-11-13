import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSequentialPhase } from '@/orchestrator/sequential-phase';
import type { ExecutionJob, Phase, Plan } from '@/types';
import * as branchTracker from '@/utils/branch-tracker';

// Mock dependencies
vi.mock('@/utils/branch-tracker');

// Mock Codex SDK
interface MockCodexThread {
  run: ReturnType<typeof vi.fn>;
}

interface MockCodexInstance {
  startThread: ReturnType<typeof vi.fn>;
}

// Global mock instances tracker
const mockInstances: MockCodexInstance[] = [];
const resetMockInstances = () => {
  mockInstances.length = 0;
};

vi.mock('@openai/codex-sdk', () => {
  // Mock Codex constructor (defined inside vi.mock to avoid initialization issues)
  const MockCodexConstructor = vi.fn().mockImplementation(() => {
    const mockThread: MockCodexThread = {
      run: vi.fn().mockResolvedValue({ finalResponse: 'BRANCH: test-branch-name' }),
    };

    const instance: MockCodexInstance = {
      startThread: vi.fn().mockReturnValue(mockThread),
    };

    mockInstances.push(instance);
    return instance as any;
  });

  return {
    Codex: MockCodexConstructor,
  };
});

// Export MockCodexConstructor for test access (get from vi.mocked)
import { Codex } from '@openai/codex-sdk';

const MockCodexConstructor = vi.mocked(Codex);

describe('sequential-phase orchestrator', () => {
  let phase: Phase;
  let plan: Plan;
  let job: ExecutionJob;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    resetMockInstances();

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

      // Override Codex constructor to track execution order
      MockCodexConstructor.mockImplementation(() => {
        const mockThread: MockCodexThread = {
          run: vi.fn().mockImplementation(async (prompt: string) => {
            // Extract task ID from prompt
            const match = /Task ([0-9-]+)/.exec(prompt);
            const taskId = match?.[1];
            if (taskId) {
              executionOrder.push(taskId);
            }
            return { finalResponse: `BRANCH: abc123-task-${taskId}-impl` };
          }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockReturnValue(mockThread),
        };

        mockInstances.push(instance);
        return instance as any;
      });

      // Execute phase
      await executeSequentialPhase(phase, plan, job);

      // Verify: 3 Codex instances created (one per task)
      expect(mockInstances).toHaveLength(3);

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

      // Override Codex constructor to capture workingDirectory from startThread()
      MockCodexConstructor.mockImplementation(() => {
        const mockThread: MockCodexThread = {
          run: vi.fn().mockResolvedValue({ finalResponse: 'BRANCH: test-branch' }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockImplementation((config: { workingDirectory: string }) => {
            worktreePaths.push(config.workingDirectory);
            return mockThread;
          }),
        };

        mockInstances.push(instance);
        return instance as any;
      });

      // Execute phase
      await executeSequentialPhase(phase, plan, job);

      // Verify: all Codex instances use same main worktree
      expect(mockInstances).toHaveLength(3);

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
      expect(mockInstances).toHaveLength(2);

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
      MockCodexConstructor.mockImplementation(() => {
        callCount++;
        const shouldFail = callCount === 2; // Fail on second task

        const mockThread: MockCodexThread = {
          run: shouldFail
            ? vi.fn().mockRejectedValue(new Error('Task 4-2 failed'))
            : vi.fn().mockResolvedValue({ finalResponse: 'BRANCH: test-branch' }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockReturnValue(mockThread),
        };

        mockInstances.push(instance);
        return instance as any;
      });

      // Execute phase and expect error
      await expect(executeSequentialPhase(phase, plan, job)).rejects.toThrow('Task 4-2 failed');

      // Verify: only 2 threads spawned (stopped after failure)
      expect(mockInstances).toHaveLength(2);

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
      MockCodexConstructor.mockImplementation(() => {
        taskCounter++;
        const taskId = `4-${taskCounter}`;

        const mockThread: MockCodexThread = {
          run: vi.fn().mockResolvedValue({
            finalResponse: `BRANCH: abc123-task-${taskId}-impl`,
          }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockReturnValue(mockThread),
        };

        mockInstances.push(instance);
        return instance as any;
      });

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
      MockCodexConstructor.mockImplementation(() => {
        callCount++;
        const taskId = `4-${callCount}`;

        const mockThread: MockCodexThread = {
          run: vi.fn().mockResolvedValue({
            finalResponse: `BRANCH: abc123-task-${taskId}-branch-${callCount}`,
          }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockReturnValue(mockThread),
        };

        mockInstances.push(instance);
        return instance as any;
      });

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
      expect(mockInstances).toHaveLength(0);

      // Verify: all tasks marked as completed from resume
      expect(job.tasks).toHaveLength(3);
      for (const taskStatus of job.tasks) {
        expect(taskStatus.status).toBe('completed');
      }
    });
  });
});
