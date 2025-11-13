import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionJob, Phase, Plan } from '../types.js';
import * as branchTracker from '../utils/branch-tracker.js';
import * as git from '../utils/git.js';
import { executeParallelPhase } from './parallel-phase.js';

// Mock dependencies
vi.mock('../utils/git.js');
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
      run: vi.fn().mockResolvedValue({ finalResponse: 'BRANCH: test-branch-name' }),
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
vi.mock('@openai/codex-sdk', () => {
  const MockCodexConstructor = vi
    .fn()
    .mockImplementation((config: { workingDirectory: string }) => {
      return mockCodex.create(config.workingDirectory);
    });

  return {
    Codex: MockCodexConstructor,
  };
});

describe('parallel-phase orchestrator', () => {
  let phase: Phase;
  let plan: Plan;
  let job: ExecutionJob;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockCodex.reset();

    // Sample phase with 3 parallel tasks
    phase = {
      id: 2,
      name: 'Parallel Execution MVP',
      strategy: 'parallel',
      tasks: [
        {
          acceptanceCriteria: ['Prompt embeds TDD skill instructions'],
          description: 'Generate prompts for task execution',
          files: ['src/prompts/task-executor.ts'],
          id: '2-1',
          name: 'Task Executor Prompt Template',
        },
        {
          acceptanceCriteria: ['Spawns N threads via Promise.all()'],
          description: 'Implement parallel phase execution',
          files: ['src/orchestrator/parallel-phase.ts'],
          id: '2-2',
          name: 'Parallel Phase Orchestrator',
        },
        {
          acceptanceCriteria: ['StackingBackend interface defined'],
          description: 'Create pluggable stacking backend',
          files: ['src/utils/stacking/types.ts'],
          id: '2-3',
          name: 'Stacking Backend Abstraction',
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
      phase: 2,
      runId: 'abc123',
      startedAt: new Date(),
      status: 'running',
      tasks: [],
      totalPhases: 3,
    };
  });

  describe('executeParallelPhase', () => {
    it('spawns threads in parallel with Promise.all()', async () => {
      // Mock: no existing work, all tasks are pending
      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: [],
        pendingTasks: phase.tasks,
      });

      // Mock: worktree creation succeeds
      vi.mocked(git.createWorktree).mockResolvedValue(undefined);

      // Execute phase
      await executeParallelPhase(phase, plan, job);

      // Verify: worktrees created for all 3 tasks
      expect(git.createWorktree).toHaveBeenCalledTimes(3);
      expect(git.createWorktree).toHaveBeenCalledWith(
        '.worktrees/abc123-task-2-1',
        'HEAD',
        expect.any(String)
      );

      // Verify: 3 Codex instances created (one per task)
      expect(mockCodex.instances).toHaveLength(3);

      // Verify: thread.run() called 3 times (parallel execution)
      for (const instance of mockCodex.instances) {
        expect(instance.startThread).toHaveBeenCalledTimes(1);
        const thread = instance.startThread();
        expect(thread.run).toHaveBeenCalledTimes(1);
      }
    });

    it('handles individual task failures without stopping other threads', async () => {
      // Mock: no existing work
      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: [],
        pendingTasks: phase.tasks,
      });

      vi.mocked(git.createWorktree).mockResolvedValue(undefined);

      // Mock: task 2 fails, others succeed
      let callCount = 0;
      mockCodex.create = (_workingDirectory: string): MockCodexInstance => {
        callCount++;
        const shouldFail = callCount === 2;

        const mockThread: MockCodexThread = {
          run: shouldFail
            ? vi.fn().mockRejectedValue(new Error('Task execution failed'))
            : vi.fn().mockResolvedValue({ finalResponse: 'BRANCH: test-branch' }),
        };

        const instance: MockCodexInstance = {
          startThread: vi.fn().mockReturnValue(mockThread),
        };

        mockCodex.instances.push(instance);
        return instance;
      };

      // Execute phase
      await executeParallelPhase(phase, plan, job);

      // Verify: all 3 threads spawned (failure doesn't stop others)
      expect(mockCodex.instances).toHaveLength(3);

      // Verify: job tasks include both successes and failure
      expect(job.tasks).toHaveLength(3);

      const successfulTasks = job.tasks.filter((t) => t.status === 'completed');
      const failedTasks = job.tasks.filter((t) => t.status === 'failed');

      expect(successfulTasks).toHaveLength(2);
      expect(failedTasks).toHaveLength(1);
      expect(failedTasks[0]?.error).toContain('Task execution failed');
    });

    it('only creates worktrees for pending tasks (resume logic)', async () => {
      // Mock: task 2-1 is already complete
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
            branch: 'abc123-task-2-1-prompt-template',
            commitCount: 3,
          },
        ],
        pendingTasks: [secondTask, thirdTask],
      });

      vi.mocked(git.createWorktree).mockResolvedValue(undefined);

      // Execute phase
      await executeParallelPhase(phase, plan, job);

      // Verify: only 2 worktrees created (for pending tasks)
      expect(git.createWorktree).toHaveBeenCalledTimes(2);
      expect(git.createWorktree).toHaveBeenCalledWith(
        '.worktrees/abc123-task-2-2',
        'HEAD',
        expect.any(String)
      );
      expect(git.createWorktree).toHaveBeenCalledWith(
        '.worktrees/abc123-task-2-3',
        'HEAD',
        expect.any(String)
      );

      // Verify: only 2 threads spawned
      expect(mockCodex.instances).toHaveLength(2);
    });

    it('cleans up worktrees after all threads complete', async () => {
      // Mock: no existing work
      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: [],
        pendingTasks: phase.tasks,
      });

      vi.mocked(git.createWorktree).mockResolvedValue(undefined);
      vi.mocked(git.cleanupWorktree).mockResolvedValue(undefined);

      // Execute phase
      await executeParallelPhase(phase, plan, job);

      // Verify: cleanup called for all 3 worktrees
      expect(git.cleanupWorktree).toHaveBeenCalledTimes(3);
      expect(git.cleanupWorktree).toHaveBeenCalledWith(
        '.worktrees/abc123-task-2-1',
        expect.any(String)
      );
      expect(git.cleanupWorktree).toHaveBeenCalledWith(
        '.worktrees/abc123-task-2-2',
        expect.any(String)
      );
      expect(git.cleanupWorktree).toHaveBeenCalledWith(
        '.worktrees/abc123-task-2-3',
        expect.any(String)
      );
    });

    it('updates job status with task results', async () => {
      // Mock: no existing work
      vi.mocked(branchTracker.checkExistingWork).mockResolvedValue({
        completedTasks: [],
        pendingTasks: phase.tasks,
      });

      vi.mocked(git.createWorktree).mockResolvedValue(undefined);

      // Execute phase
      await executeParallelPhase(phase, plan, job);

      // Verify: job.tasks updated with results
      expect(job.tasks).toHaveLength(3);

      for (const taskStatus of job.tasks) {
        expect(taskStatus.status).toBe('completed');
        expect(taskStatus.branch).toBeDefined();
      }
    });

    it('propagates errors to job.error if phase execution fails', async () => {
      // Mock: checkExistingWork fails
      vi.mocked(branchTracker.checkExistingWork).mockRejectedValue(
        new Error('Git operation failed')
      );

      // Execute phase and expect error
      await expect(executeParallelPhase(phase, plan, job)).rejects.toThrow('Git operation failed');

      // Verify: job status updated to failed
      expect(job.status).toBe('failed');
      expect(job.error).toContain('Git operation failed');
    });
  });
});
