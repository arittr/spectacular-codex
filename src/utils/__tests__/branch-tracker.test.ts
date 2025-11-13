import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Phase, Task } from '@/types';
import { checkExistingWork, isTaskComplete } from '@/utils/branch-tracker';
import { findBranch } from '@/utils/git';

let testDir: string;

beforeEach(async () => {
  // Create a temporary git repo for testing
  testDir = await mkdtemp(join(tmpdir(), 'branch-tracker-test-'));

  // Initialize git repo with main as default branch
  await execa('git', ['init', '-b', 'main'], { cwd: testDir });
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: testDir });
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: testDir });

  // Create initial commit
  await execa('touch', ['README.md'], { cwd: testDir });
  await execa('git', ['add', '.'], { cwd: testDir });
  await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testDir });
});

afterEach(async () => {
  // Cleanup test directory
  await rm(testDir, { force: true, recursive: true });
});

describe('findBranch', () => {
  it('finds branch matching pattern', async () => {
    // Create a branch
    await execa('git', ['branch', 'abc123-task-1-1-schema'], { cwd: testDir });

    const branch = await findBranch('abc123-task-1-1-', testDir);
    expect(branch).toBe('abc123-task-1-1-schema');
  });

  it('returns undefined if no branch matches', async () => {
    const branch = await findBranch('nonexistent-', testDir);
    expect(branch).toBeUndefined();
  });

  it('returns first match if multiple branches match', async () => {
    await execa('git', ['branch', 'abc123-task-1-schema'], { cwd: testDir });
    await execa('git', ['branch', 'abc123-task-1-api'], { cwd: testDir });

    const branch = await findBranch('abc123-task-1-', testDir);
    // Should return one of them (alphabetically first)
    expect(branch).toBe('abc123-task-1-api');
  });

  it('uses current directory if cwd not provided', async () => {
    // This test verifies the default parameter works
    // We can't easily test it without mocking, so just verify it doesn't throw
    const branch = await findBranch('test-pattern-');
    expect(branch).toBeUndefined();
  });
});

describe('isTaskComplete', () => {
  it('returns true if branch exists with commits', async () => {
    // Create a task branch from main with commits
    // First ensure we're on main
    await execa('git', ['checkout', 'main'], { cwd: testDir });

    // Create and checkout the task branch
    await execa('git', ['checkout', '-b', 'abc123-task-1-1-schema'], { cwd: testDir });

    // Make a commit on the task branch
    await execa('touch', ['schema.ts'], { cwd: testDir });
    await execa('git', ['add', '.'], { cwd: testDir });
    await execa('git', ['commit', '-m', 'Add schema'], { cwd: testDir });

    // Go back to main (task branch now has 1 more commit than main)
    await execa('git', ['checkout', 'main'], { cwd: testDir });

    const task: Task = {
      acceptanceCriteria: ['Done'],
      description: 'Create schema',
      files: ['schema.ts'],
      id: '1-1',
      name: 'Schema',
    };

    const complete = await isTaskComplete(task, 'abc123', 1, testDir);
    expect(complete).toBe(true);
  });

  it('returns false if branch exists but has no commits', async () => {
    // Create empty branch (branched from main, no new commits)
    await execa('git', ['branch', 'abc123-task-1-2-empty'], { cwd: testDir });

    const task: Task = {
      acceptanceCriteria: [],
      description: 'Empty branch',
      files: [],
      id: '1-2',
      name: 'Empty',
    };

    const complete = await isTaskComplete(task, 'abc123', 1, testDir);
    expect(complete).toBe(false);
  });

  it('returns false if branch does not exist', async () => {
    const task: Task = {
      acceptanceCriteria: [],
      description: 'No branch',
      files: [],
      id: '1-3',
      name: 'Missing',
    };

    const complete = await isTaskComplete(task, 'abc123', 1, testDir);
    expect(complete).toBe(false);
  });
});

describe('checkExistingWork', () => {
  it('separates completed and pending tasks', async () => {
    // Create completed task branch
    await execa('git', ['checkout', '-b', 'abc123-task-1-1-done'], { cwd: testDir });
    await execa('touch', ['done.ts'], { cwd: testDir });
    await execa('git', ['add', '.'], { cwd: testDir });
    await execa('git', ['commit', '-m', 'Done'], { cwd: testDir });
    await execa('git', ['checkout', 'main'], { cwd: testDir });

    // Create empty branch (pending)
    await execa('git', ['branch', 'abc123-task-1-2-pending'], { cwd: testDir });

    const phase: Phase = {
      id: 1,
      name: 'Test Phase',
      strategy: 'parallel',
      tasks: [
        {
          acceptanceCriteria: ['Done'],
          description: 'Completed',
          files: ['done.ts'],
          id: '1-1',
          name: 'Done Task',
        },
        {
          acceptanceCriteria: ['Not done'],
          description: 'Not done',
          files: ['pending.ts'],
          id: '1-2',
          name: 'Pending Task',
        },
        {
          acceptanceCriteria: ['Missing'],
          description: 'No branch',
          files: ['missing.ts'],
          id: '1-3',
          name: 'Missing Task',
        },
      ],
    };

    const result = await checkExistingWork(phase, 'abc123', testDir);

    expect(result.completedTasks).toHaveLength(1);
    expect(result.completedTasks[0]?.id).toBe('1-1');
    expect(result.completedTasks[0]?.branch).toBe('abc123-task-1-1-done');
    expect(result.completedTasks[0]?.commitCount).toBeGreaterThan(0);

    expect(result.pendingTasks).toHaveLength(2);
    expect(result.pendingTasks[0]?.id).toBe('1-2');
    expect(result.pendingTasks[1]?.id).toBe('1-3');
  });

  it('returns all tasks as pending if none are complete', async () => {
    const phase: Phase = {
      id: 1,
      name: 'Test Phase',
      strategy: 'parallel',
      tasks: [
        {
          acceptanceCriteria: [],
          description: 'Task 1',
          files: [],
          id: '1-1',
          name: 'Task 1',
        },
      ],
    };

    const result = await checkExistingWork(phase, 'abc123', testDir);

    expect(result.completedTasks).toHaveLength(0);
    expect(result.pendingTasks).toHaveLength(1);
  });
});
