/**
 * Tests for fixer prompt template generation.
 *
 * Verifies that prompts include all required sections:
 * - Rejection reasons from code review
 * - Fix strategy instructions
 * - Scope creep detection ("DO NOT implement features from other tasks")
 * - Quality check re-run instructions
 *
 * @module prompts/fixer.test
 */

import { describe, expect, it } from 'vitest';
import { generateFixerPrompt } from '@/prompts/fixer';
import type { Plan } from '@/types';

describe('generateFixerPrompt', () => {
  const mockPlan: Plan = {
    featureSlug: 'spectacular-codex',
    phases: [],
    runId: '98ae37',
    stackingBackend: 'git-spice',
  };

  const mockReviewResult = `
VERDICT: REJECTED

**Reasoning**:
1. TypeScript Error - src/prompts/code-reviewer.ts:42 - Missing return type annotation
2. Test Failure - code-reviewer.test.ts - Expected binary verdict format not found
3. Code Quality - Nested conditionals exceed 3 levels deep
`;

  it('should include review rejection reasons', () => {
    const prompt = generateFixerPrompt(mockReviewResult, mockPlan);

    expect(prompt).toContain('Review Rejection Reasons');
    expect(prompt).toContain('VERDICT: REJECTED');
  });

  it('should include fix strategy instructions', () => {
    const prompt = generateFixerPrompt(mockReviewResult, mockPlan);

    expect(prompt).toContain('Fix Strategy');
    expect(prompt).toContain('Address each issue systematically');
    expect(prompt).toContain('blocking issues');
  });

  it('should include scope creep detection', () => {
    const prompt = generateFixerPrompt(mockReviewResult, mockPlan);

    expect(prompt).toContain('Scope Creep Detection');
    expect(prompt).toContain('DO NOT add new features');
    expect(prompt).toContain('DO NOT implement tasks from other phases');
    expect(prompt).toContain('ONLY fix the specific issues mentioned');
  });

  it('should include quality check re-run instructions', () => {
    const prompt = generateFixerPrompt(mockReviewResult, mockPlan);

    expect(prompt).toContain('Quality Checks');
    expect(prompt).toContain('pnpm test');
    expect(prompt).toContain('pnpm check-types');
    expect(prompt).toContain('Verify all issues resolved');
  });

  it('should include required output format', () => {
    const prompt = generateFixerPrompt(mockReviewResult, mockPlan);

    expect(prompt).toContain('Required Output');
    expect(prompt).toContain('Report what you fixed');
    expect(prompt).toContain('confirmation that tests pass');
  });

  it('should embed the full review result', () => {
    const prompt = generateFixerPrompt(mockReviewResult, mockPlan);

    expect(prompt).toContain('TypeScript Error');
    expect(prompt).toContain('Test Failure');
    expect(prompt).toContain('Code Quality');
  });

  it('should include fix priority instructions', () => {
    const prompt = generateFixerPrompt(mockReviewResult, mockPlan);

    expect(prompt).toContain('Start with blocking issues');
    expect(prompt).toContain('fix warnings');
  });

  it('should include worktree context', () => {
    const prompt = generateFixerPrompt(mockReviewResult, mockPlan);

    expect(prompt).toContain('98ae37');
  });

  it('should handle empty review result', () => {
    const emptyReview = '';
    const prompt = generateFixerPrompt(emptyReview, mockPlan);

    expect(prompt).toContain('Fix Strategy');
    expect(prompt).toContain('Scope Creep Detection');
  });
});
