import { describe, expect, it } from 'vitest';
import {
  sanitizePath,
  validateBranchName,
  validatePlanPath,
  validateRunId,
} from '@/utils/validation';

describe('validatePlanPath', () => {
  it('should accept valid plan paths under specs/', () => {
    expect(() => validatePlanPath('specs/abc123/plan.md')).not.toThrow();
    expect(() => validatePlanPath('specs/feature-x/plan.md')).not.toThrow();
    expect(() => validatePlanPath('specs/nested/dir/plan.md')).not.toThrow();
  });

  it('should reject paths not under specs/', () => {
    expect(() => validatePlanPath('other/plan.md')).toThrow(
      'Invalid plan path: must be under specs/ directory'
    );
    expect(() => validatePlanPath('plan.md')).toThrow(
      'Invalid plan path: must be under specs/ directory'
    );
    expect(() => validatePlanPath('/absolute/path/plan.md')).toThrow(
      'Invalid plan path: must be under specs/ directory'
    );
  });

  it('should reject path traversal attempts', () => {
    expect(() => validatePlanPath('specs/../etc/passwd')).toThrow(
      'Invalid plan path: path traversal detected'
    );
    expect(() => validatePlanPath('specs/subdir/../../etc/passwd')).toThrow(
      'Invalid plan path: path traversal detected'
    );
    expect(() => validatePlanPath('specs/./../../plan.md')).toThrow(
      'Invalid plan path: path traversal detected'
    );
  });

  it('should handle edge cases', () => {
    expect(() => validatePlanPath('')).toThrow('Invalid plan path: must be under specs/ directory');
    expect(() => validatePlanPath('specs/')).not.toThrow();
  });
});

describe('validateRunId', () => {
  it('should accept valid 6-character hex runIds', () => {
    expect(() => validateRunId('abc123')).not.toThrow();
    expect(() => validateRunId('000000')).not.toThrow();
    expect(() => validateRunId('ffffff')).not.toThrow();
    expect(() => validateRunId('123abc')).not.toThrow();
    expect(() => validateRunId('deadfe')).not.toThrow();
  });

  it('should reject non-hex characters', () => {
    expect(() => validateRunId('gggggg')).toThrow(
      'Invalid run_id: must be 6-character hex (e.g., "abc123")'
    );
    expect(() => validateRunId('abc12g')).toThrow(
      'Invalid run_id: must be 6-character hex (e.g., "abc123")'
    );
    expect(() => validateRunId('ABC123')).toThrow(
      'Invalid run_id: must be 6-character hex (e.g., "abc123")'
    );
    expect(() => validateRunId('abc-23')).toThrow(
      'Invalid run_id: must be 6-character hex (e.g., "abc123")'
    );
  });

  it('should reject incorrect lengths', () => {
    expect(() => validateRunId('abc12')).toThrow(
      'Invalid run_id: must be 6-character hex (e.g., "abc123")'
    );
    expect(() => validateRunId('abc1234')).toThrow(
      'Invalid run_id: must be 6-character hex (e.g., "abc123")'
    );
    expect(() => validateRunId('')).toThrow(
      'Invalid run_id: must be 6-character hex (e.g., "abc123")'
    );
  });

  it('should handle edge cases', () => {
    expect(() => validateRunId('000000')).not.toThrow();
    expect(() => validateRunId('   abc123   ')).toThrow(
      'Invalid run_id: must be 6-character hex (e.g., "abc123")'
    );
  });
});

describe('validateBranchName', () => {
  it('should accept branch names with correct runId prefix', () => {
    expect(() => validateBranchName('abc123-task-1', 'abc123')).not.toThrow();
    expect(() => validateBranchName('abc123-task-5-2-validation', 'abc123')).not.toThrow();
    expect(() => validateBranchName('abc123-main', 'abc123')).not.toThrow();
    expect(() => validateBranchName('def456-feature-branch', 'def456')).not.toThrow();
  });

  it('should reject branch names without runId prefix', () => {
    expect(() => validateBranchName('task-1', 'abc123')).toThrow(
      'Invalid branch name: must start with run_id prefix "abc123-"'
    );
    expect(() => validateBranchName('feature-branch', 'abc123')).toThrow(
      'Invalid branch name: must start with run_id prefix "abc123-"'
    );
    expect(() => validateBranchName('main', 'abc123')).toThrow(
      'Invalid branch name: must start with run_id prefix "abc123-"'
    );
  });

  it('should reject branch names with wrong runId prefix', () => {
    expect(() => validateBranchName('def456-task-1', 'abc123')).toThrow(
      'Invalid branch name: must start with run_id prefix "abc123-"'
    );
    expect(() => validateBranchName('abc124-task-1', 'abc123')).toThrow(
      'Invalid branch name: must start with run_id prefix "abc123-"'
    );
  });

  it('should handle edge cases', () => {
    expect(() => validateBranchName('abc123-', 'abc123')).not.toThrow();
    expect(() => validateBranchName('', 'abc123')).toThrow(
      'Invalid branch name: must start with run_id prefix "abc123-"'
    );
    expect(() => validateBranchName('abc123task-1', 'abc123')).toThrow(
      'Invalid branch name: must start with run_id prefix "abc123-"'
    );
  });
});

describe('sanitizePath', () => {
  it('should accept safe paths', () => {
    expect(sanitizePath('specs/abc123/plan.md')).toBe('specs/abc123/plan.md');
    expect(sanitizePath('src/utils/validation.ts')).toBe('src/utils/validation.ts');
    expect(sanitizePath('.worktrees/abc123-task-1')).toBe('.worktrees/abc123-task-1');
    expect(sanitizePath('/absolute/path/file.txt')).toBe('/absolute/path/file.txt');
  });

  it('should reject paths with shell metacharacters', () => {
    expect(() => sanitizePath('file; rm -rf /')).toThrow(
      'Invalid path: contains shell metacharacters'
    );
    expect(() => sanitizePath('file && echo hacked')).toThrow(
      'Invalid path: contains shell metacharacters'
    );
    expect(() => sanitizePath('file | cat')).toThrow('Invalid path: contains shell metacharacters');
    expect(() => sanitizePath('file`whoami`')).toThrow(
      'Invalid path: contains shell metacharacters'
    );
    expect(() => sanitizePath('file$(whoami)')).toThrow(
      'Invalid path: contains shell metacharacters'
    );
  });

  it('should handle edge cases', () => {
    expect(sanitizePath('')).toBe('');
    expect(sanitizePath('file-with-dashes.txt')).toBe('file-with-dashes.txt');
    expect(sanitizePath('file_with_underscores.txt')).toBe('file_with_underscores.txt');
    expect(sanitizePath('file.with.dots.txt')).toBe('file.with.dots.txt');
  });

  it('should allow paths with spaces (execa handles them)', () => {
    // Spaces are safe with execa's array args
    expect(sanitizePath('path with spaces/file.txt')).toBe('path with spaces/file.txt');
  });
});
