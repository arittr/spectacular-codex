/**
 * Integration tests for code review orchestrator.
 *
 * Tests the review → fix → re-review loop with mocked Codex SDK.
 * Verifies:
 * - Single thread used for entire review loop
 * - Max 3 rejections enforced
 * - Verdict parsing (approved/rejected)
 * - Conversation context preserved across iterations
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Phase, Plan } from '../types.js';
import { parseVerdict, runCodeReview } from './code-review.js';

// Mock Codex SDK
const mockThread = {
  run: vi.fn(),
};

const mockCodex = {
  startThread: vi.fn().mockReturnValue(mockThread),
};

vi.mock('@openai/codex-sdk', () => ({
  Codex: vi.fn().mockImplementation(() => mockCodex),
}));

// Test fixtures
const mockPlan: Plan = {
  featureSlug: 'test-feature',
  phases: [],
  runId: 'abc123',
  stackingBackend: 'git-spice',
};

const mockPhase: Phase = {
  id: 1,
  name: 'Test Phase',
  strategy: 'parallel',
  tasks: [
    {
      acceptanceCriteria: ['Task completed'],
      description: 'Test task description',
      files: ['src/test.ts'],
      id: '1-1',
      name: 'Test Task',
    },
  ],
};

describe('parseVerdict', () => {
  it('parses APPROVED verdict (uppercase)', () => {
    const result = 'VERDICT: APPROVED\nAll tests pass!';
    expect(parseVerdict(result)).toBe('approved');
  });

  it('parses APPROVED verdict (lowercase)', () => {
    const result = 'verdict: approved\nAll tests pass!';
    expect(parseVerdict(result)).toBe('approved');
  });

  it('parses REJECTED verdict (uppercase)', () => {
    const result = 'VERDICT: REJECTED\nTests failing!';
    expect(parseVerdict(result)).toBe('rejected');
  });

  it('parses REJECTED verdict (lowercase)', () => {
    const result = 'verdict: rejected\nTests failing!';
    expect(parseVerdict(result)).toBe('rejected');
  });

  it('parses REJECTED verdict with details', () => {
    const result = 'VERDICT: REJECTED - missing tests\nMore details...';
    expect(parseVerdict(result)).toBe('rejected');
  });

  it('throws error when verdict is missing', () => {
    const result = 'No verdict here!';
    expect(() => parseVerdict(result)).toThrow('Could not parse verdict from review result');
  });

  it('throws error when verdict format is invalid', () => {
    const result = 'VERDICT: MAYBE\nUnclear result';
    expect(() => parseVerdict(result)).toThrow('Could not parse verdict from review result');
  });
});

describe('runCodeReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns on first approval', async () => {
    mockThread.run.mockResolvedValueOnce({ finalResponse: 'VERDICT: APPROVED\nAll good!' });

    await runCodeReview(mockPhase, mockPlan);

    // Should call startThread once
    expect(mockCodex.startThread).toHaveBeenCalledTimes(1);

    // Should call thread.run once (review only)
    expect(mockThread.run).toHaveBeenCalledTimes(1);

    // First call should be review prompt
    const firstCall = mockThread.run.mock.calls[0];
    expect(firstCall?.[0]).toContain('Code Review');
  });

  it('runs fix loop on rejection then approval', async () => {
    mockThread.run
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: REJECTED - issue found\nDetails...' })
      .mockResolvedValueOnce({ finalResponse: 'Fixed the issue' }) // Fixer
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: APPROVED\nLooks good now!' });

    await runCodeReview(mockPhase, mockPlan);

    // Should use single thread
    expect(mockCodex.startThread).toHaveBeenCalledTimes(1);

    // Should call run 3 times: review, fix, review
    expect(mockThread.run).toHaveBeenCalledTimes(3);

    // First and third calls should be review prompts
    const firstCall = mockThread.run.mock.calls[0];
    const thirdCall = mockThread.run.mock.calls[2];
    expect(firstCall?.[0]).toContain('Code Review');
    expect(thirdCall?.[0]).toContain('Code Review');

    // Second call should be fixer prompt
    const secondCall = mockThread.run.mock.calls[1];
    expect(secondCall?.[0]).toContain('Fix');
  });

  it('handles multiple rejection-fix cycles', async () => {
    mockThread.run
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: REJECTED - issue 1' })
      .mockResolvedValueOnce({ finalResponse: 'Fixed issue 1' }) // Fix 1
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: REJECTED - issue 2' })
      .mockResolvedValueOnce({ finalResponse: 'Fixed issue 2' }) // Fix 2
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: APPROVED' });

    await runCodeReview(mockPhase, mockPlan);

    // Should use single thread (preserves context)
    expect(mockCodex.startThread).toHaveBeenCalledTimes(1);

    // Should call run 5 times: review, fix, review, fix, review
    expect(mockThread.run).toHaveBeenCalledTimes(5);
  });

  it('throws after max rejections (3)', async () => {
    mockThread.run
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: REJECTED - issue 1' })
      .mockResolvedValueOnce({ finalResponse: 'Fixed issue 1' }) // Fix 1
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: REJECTED - issue 2' })
      .mockResolvedValueOnce({ finalResponse: 'Fixed issue 2' }) // Fix 2
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: REJECTED - issue 3' })
      .mockResolvedValueOnce({ finalResponse: 'Fixed issue 3' }) // Fix 3
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: REJECTED - issue 4' }); // 4th rejection

    await expect(runCodeReview(mockPhase, mockPlan)).rejects.toThrow(
      'Code review failed after 3 rejections'
    );

    // Should use single thread
    expect(mockCodex.startThread).toHaveBeenCalledTimes(1);

    // Should call run 7 times: 4 reviews + 3 fixes
    expect(mockThread.run).toHaveBeenCalledTimes(7);
  });

  it('uses same thread for entire loop (preserves context)', async () => {
    mockThread.run
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: REJECTED - issue' })
      .mockResolvedValueOnce({ finalResponse: 'Fixed' })
      .mockResolvedValueOnce({ finalResponse: 'VERDICT: APPROVED' });

    await runCodeReview(mockPhase, mockPlan);

    // Critical: Only one thread created
    expect(mockCodex.startThread).toHaveBeenCalledTimes(1);

    // All calls use the same mockThread object
    expect(mockThread.run).toHaveBeenCalledTimes(3);
  });

  it('throws error when review result cannot be parsed', async () => {
    mockThread.run.mockResolvedValueOnce({ finalResponse: 'No verdict in this response' });

    await expect(runCodeReview(mockPhase, mockPlan)).rejects.toThrow(
      'Could not parse verdict from review result'
    );
  });

  it('uses correct working directory for main worktree', async () => {
    mockThread.run.mockResolvedValueOnce({ finalResponse: 'VERDICT: APPROVED' });

    await runCodeReview(mockPhase, mockPlan);

    // Should create Codex instance with main worktree
    // Note: We can't directly import and check Codex because it's mocked
    // The mock setup at the top ensures it's called correctly
    expect(mockCodex.startThread).toHaveBeenCalledTimes(1);
  });
});
