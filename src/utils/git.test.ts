import { realpathSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  branchHasCommits,
  cleanupWorktree,
  createWorktree,
  findBranch,
  listWorktrees,
} from './git.js';

describe('Git Utils', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    const rawTestDir = await mkdtemp(join(tmpdir(), 'git-utils-test-'));
    // Resolve symlinks (macOS /var -> /private/var)
    testDir = realpathSync(rawTestDir);

    // Initialize git repo
    await execa('git', ['init'], { cwd: testDir });
    await execa('git', ['config', 'user.email', 'test@example.com'], {
      cwd: testDir,
    });
    await execa('git', ['config', 'user.name', 'Test User'], {
      cwd: testDir,
    });

    // Create initial commit
    await execa('touch', ['README.md'], { cwd: testDir });
    await execa('git', ['add', '.'], { cwd: testDir });
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testDir });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { force: true, recursive: true });
  });

  describe('createWorktree', () => {
    it('creates a worktree at the specified path', async () => {
      const worktreePath = join(testDir, '.worktrees/test-worktree');
      const baseRef = 'HEAD';

      await createWorktree(worktreePath, baseRef, testDir);

      // Verify worktree exists
      const result = await execa('git', ['worktree', 'list'], {
        cwd: testDir,
      });
      expect(result.stdout).toContain(worktreePath);
    });

    it('creates worktree in detached HEAD state', async () => {
      const worktreePath = join(testDir, '.worktrees/test-worktree');
      const baseRef = 'HEAD';

      await createWorktree(worktreePath, baseRef, testDir);

      // Verify detached HEAD (message varies by git version)
      const result = await execa('git', ['status'], { cwd: worktreePath });
      const isDetached =
        result.stdout.includes('HEAD detached') ||
        result.stdout.includes('Not currently on any branch');
      expect(isDetached).toBe(true);
    });
  });

  describe('cleanupWorktree', () => {
    it('removes a worktree', async () => {
      const worktreePath = join(testDir, '.worktrees/test-worktree');
      await createWorktree(worktreePath, 'HEAD', testDir);

      await cleanupWorktree(worktreePath, testDir);

      // Verify worktree removed
      const result = await execa('git', ['worktree', 'list'], {
        cwd: testDir,
      });
      expect(result.stdout).not.toContain(worktreePath);
    });

    it('handles non-existent worktree gracefully', async () => {
      const worktreePath = join(testDir, '.worktrees/non-existent');

      // Should not throw
      await expect(cleanupWorktree(worktreePath, testDir)).resolves.toBeUndefined();
    });
  });

  describe('findBranch', () => {
    it('finds a branch by pattern', async () => {
      // Create test branch
      await execa('git', ['branch', 'abc123-task-1-database'], {
        cwd: testDir,
      });

      const branch = await findBranch('abc123-task-1-', testDir);

      expect(branch).toBe('abc123-task-1-database');
    });

    it('returns undefined if no branch matches', async () => {
      const branch = await findBranch('nonexistent-pattern-', testDir);

      expect(branch).toBeUndefined();
    });

    it('returns first match if multiple branches match', async () => {
      // Create multiple test branches
      await execa('git', ['branch', 'abc123-task-1-database'], {
        cwd: testDir,
      });
      await execa('git', ['branch', 'abc123-task-1-schema'], {
        cwd: testDir,
      });

      const branch = await findBranch('abc123-task-1-', testDir);

      expect(branch).toBeDefined();
      expect(branch?.startsWith('abc123-task-1-')).toBe(true);
    });
  });

  describe('branchHasCommits', () => {
    it('returns true for branch with commits', async () => {
      // Create branch with commit
      await execa('git', ['branch', 'test-branch'], { cwd: testDir });

      const hasCommits = await branchHasCommits('test-branch', testDir);

      expect(hasCommits).toBe(true);
    });

    it('returns false for empty branch', async () => {
      // Create empty branch (orphan)
      await execa('git', ['checkout', '--orphan', 'empty-branch'], {
        cwd: testDir,
      });
      await execa('git', ['rm', '-rf', '.'], { cwd: testDir });
      await execa('git', ['checkout', 'main'], { cwd: testDir });

      const hasCommits = await branchHasCommits('empty-branch', testDir);

      expect(hasCommits).toBe(false);
    });

    it('returns false for non-existent branch', async () => {
      const hasCommits = await branchHasCommits('non-existent-branch', testDir);

      expect(hasCommits).toBe(false);
    });
  });

  describe('listWorktrees', () => {
    it('lists all worktrees', async () => {
      // Create worktrees
      const worktree1 = join(testDir, '.worktrees/test-1');
      const worktree2 = join(testDir, '.worktrees/test-2');
      await createWorktree(worktree1, 'HEAD', testDir);
      await createWorktree(worktree2, 'HEAD', testDir);

      const worktrees = await listWorktrees(testDir);

      expect(worktrees).toContain(testDir); // Main worktree
      expect(worktrees).toContain(worktree1);
      expect(worktrees).toContain(worktree2);
      expect(worktrees.length).toBe(3);
    });

    it('returns only main worktree if no additional worktrees', async () => {
      const worktrees = await listWorktrees(testDir);

      expect(worktrees).toEqual([testDir]);
    });
  });
});
