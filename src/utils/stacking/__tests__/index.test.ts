/**
 * Tests for stacking backend factory.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitSpiceBackend } from '../git-spice';
import { getStackingBackend } from '../index';

// Mock git-spice backend
vi.mock('../git-spice.js', () => ({
  GitSpiceBackend: vi.fn(),
}));

const MockedGitSpiceBackend = vi.mocked(GitSpiceBackend);

describe('getStackingBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STACKING_BACKEND;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return git-spice backend by default', async () => {
    const mockBackend = {
      detectBackend: vi.fn().mockResolvedValue(true),
      name: 'git-spice',
      stackBranches: vi.fn(),
    };

    MockedGitSpiceBackend.mockImplementation(() => mockBackend as never);

    const backend = await getStackingBackend();

    expect(backend).toBe(mockBackend);
    expect(MockedGitSpiceBackend).toHaveBeenCalledOnce();
    expect(mockBackend.detectBackend).toHaveBeenCalledOnce();
  });

  it('should throw error if git-spice not installed', async () => {
    const mockBackend = {
      detectBackend: vi.fn().mockResolvedValue(false),
      name: 'git-spice',
      stackBranches: vi.fn(),
    };

    MockedGitSpiceBackend.mockImplementation(() => mockBackend as never);

    await expect(getStackingBackend()).rejects.toThrow(
      'git-spice backend not available. Install git-spice: https://github.com/abhinav/git-spice'
    );

    expect(mockBackend.detectBackend).toHaveBeenCalledOnce();
  });

  it('should return git-spice when STACKING_BACKEND=git-spice', async () => {
    process.env.STACKING_BACKEND = 'git-spice';

    const mockBackend = {
      detectBackend: vi.fn().mockResolvedValue(true),
      name: 'git-spice',
      stackBranches: vi.fn(),
    };

    MockedGitSpiceBackend.mockImplementation(() => mockBackend as never);

    const backend = await getStackingBackend();

    expect(backend).toBe(mockBackend);
    expect(MockedGitSpiceBackend).toHaveBeenCalledOnce();
  });

  it('should throw error for unsupported backend', async () => {
    process.env.STACKING_BACKEND = 'graphite';

    await expect(getStackingBackend()).rejects.toThrow(
      'Unsupported stacking backend: graphite. Only git-spice is supported in v1.'
    );
  });

  it('should throw error for unknown backend', async () => {
    process.env.STACKING_BACKEND = 'unknown-tool';

    await expect(getStackingBackend()).rejects.toThrow(
      'Unsupported stacking backend: unknown-tool. Only git-spice is supported in v1.'
    );
  });
});
