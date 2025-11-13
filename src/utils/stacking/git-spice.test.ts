/**
 * Tests for git-spice stacking backend.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitSpiceBackend } from './git-spice.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const { execa } = await import('execa');
const mockedExeca = vi.mocked(execa);

describe('GitSpiceBackend', () => {
  let backend: GitSpiceBackend;

  beforeEach(() => {
    backend = new GitSpiceBackend();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('name', () => {
    it('should return "git-spice"', () => {
      expect(backend.name).toBe('git-spice');
    });
  });

  describe('detectBackend', () => {
    it('should return true if gs command exists', async () => {
      mockedExeca.mockResolvedValueOnce({
        exitCode: 0,
        stderr: '',
        stdout: 'gs version 0.3.0',
      } as never);

      const result = await backend.detectBackend();

      expect(result).toBe(true);
      expect(mockedExeca).toHaveBeenCalledWith('gs', ['--version']);
    });

    it('should return false if gs command not found', async () => {
      mockedExeca.mockRejectedValueOnce(new Error('Command not found: gs'));

      const result = await backend.detectBackend();

      expect(result).toBe(false);
      expect(mockedExeca).toHaveBeenCalledWith('gs', ['--version']);
    });
  });

  describe('stackBranches', () => {
    it('should stack single branch onto baseRef', async () => {
      mockedExeca.mockResolvedValue({
        exitCode: 0,
        stderr: '',
        stdout: '',
      } as never);

      await backend.stackBranches(['abc123-task-1-1-schema'], 'main', '/path/to/worktree');

      // Should checkout first branch and stack onto base
      expect(mockedExeca).toHaveBeenCalledTimes(2);
      expect(mockedExeca).toHaveBeenNthCalledWith(
        1,
        'git',
        ['checkout', 'abc123-task-1-1-schema'],
        { cwd: '/path/to/worktree' }
      );
      expect(mockedExeca).toHaveBeenNthCalledWith(2, 'gs', ['upstack', 'onto', 'main'], {
        cwd: '/path/to/worktree',
      });
    });

    it('should stack multiple branches in linear order', async () => {
      mockedExeca.mockResolvedValue({
        exitCode: 0,
        stderr: '',
        stdout: '',
      } as never);

      const branches = ['abc123-task-1-1-schema', 'abc123-task-1-2-service', 'abc123-task-1-3-api'];

      await backend.stackBranches(branches, 'main', '/path/to/worktree');

      // Should checkout and stack each branch
      expect(mockedExeca).toHaveBeenCalledTimes(6); // 3 checkouts + 3 stacks

      // First branch onto main
      expect(mockedExeca).toHaveBeenNthCalledWith(
        1,
        'git',
        ['checkout', 'abc123-task-1-1-schema'],
        { cwd: '/path/to/worktree' }
      );
      expect(mockedExeca).toHaveBeenNthCalledWith(2, 'gs', ['upstack', 'onto', 'main'], {
        cwd: '/path/to/worktree',
      });

      // Second branch onto first
      expect(mockedExeca).toHaveBeenNthCalledWith(
        3,
        'git',
        ['checkout', 'abc123-task-1-2-service'],
        { cwd: '/path/to/worktree' }
      );
      expect(mockedExeca).toHaveBeenNthCalledWith(
        4,
        'gs',
        ['upstack', 'onto', 'abc123-task-1-1-schema'],
        { cwd: '/path/to/worktree' }
      );

      // Third branch onto second
      expect(mockedExeca).toHaveBeenNthCalledWith(5, 'git', ['checkout', 'abc123-task-1-3-api'], {
        cwd: '/path/to/worktree',
      });
      expect(mockedExeca).toHaveBeenNthCalledWith(
        6,
        'gs',
        ['upstack', 'onto', 'abc123-task-1-2-service'],
        { cwd: '/path/to/worktree' }
      );
    });

    it('should handle empty branch array', async () => {
      await backend.stackBranches([], 'main', '/path/to/worktree');

      expect(mockedExeca).not.toHaveBeenCalled();
    });

    it('should propagate git command errors', async () => {
      mockedExeca.mockRejectedValueOnce(new Error('fatal: branch not found'));

      await expect(
        backend.stackBranches(['nonexistent-branch'], 'main', '/path/to/worktree')
      ).rejects.toThrow('fatal: branch not found');
    });

    it('should propagate gs command errors', async () => {
      // First call (checkout) succeeds
      mockedExeca.mockResolvedValueOnce({
        exitCode: 0,
        stderr: '',
        stdout: '',
      } as never);

      // Second call (gs upstack) fails
      mockedExeca.mockRejectedValueOnce(new Error('gs error: cannot rebase'));

      await expect(
        backend.stackBranches(['abc123-task-1-1-schema'], 'main', '/path/to/worktree')
      ).rejects.toThrow('gs error: cannot rebase');
    });
  });
});
