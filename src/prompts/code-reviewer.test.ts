/**
 * Tests for code reviewer prompt template generation.
 *
 * Verifies that prompts include all required sections:
 * - Phase context (task IDs, branches to review)
 * - Review checklist (constitution compliance, tests, TypeScript strict mode)
 * - Binary verdict format ("VERDICT: APPROVED" or "VERDICT: REJECTED")
 * - Rejection reasons format
 *
 * @module prompts/code-reviewer.test
 */

import { describe, expect, it } from 'vitest';
import type { Phase, Plan } from '../types.js';
import { generateReviewPrompt } from './code-reviewer.js';

describe('generateReviewPrompt', () => {
  const mockPhase: Phase = {
    id: 3,
    name: 'Code Review',
    strategy: 'parallel',
    tasks: [
      {
        acceptanceCriteria: [
          'Review prompt includes binary verdict format',
          'Fixer prompt includes rejection reasons',
        ],
        description: 'Generate prompts for code review and fixer',
        files: ['src/prompts/code-reviewer.ts', 'src/prompts/fixer.ts'],
        id: '3-1',
        name: 'Review & Fixer Prompt Templates',
      },
      {
        acceptanceCriteria: ['Code review loop handles rejections'],
        description: 'Implement code review orchestration',
        files: ['src/orchestrator/code-review.ts'],
        id: '3-2',
        name: 'Code Review Orchestrator',
      },
    ],
  };

  const mockPlan: Plan = {
    featureSlug: 'spectacular-codex',
    phases: [mockPhase],
    runId: '98ae37',
    stackingBackend: 'git-spice',
  };

  it('should include phase context', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('Phase 3');
    expect(prompt).toContain('Code Review');
    expect(prompt).toContain('parallel');
  });

  it('should list all task IDs in phase', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('3-1');
    expect(prompt).toContain('3-2');
  });

  it('should include constitutional compliance checklist', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('Constitutional Compliance');
    expect(prompt).toContain('4-layer architecture');
    expect(prompt).toContain('Async job pattern');
    expect(prompt).toContain('Promise.all()');
    expect(prompt).toContain('Skills embedded inline');
    expect(prompt).toContain('Git-based state');
    expect(prompt).toContain('Pure utility functions');
  });

  it('should include TypeScript strict mode checklist', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('TypeScript Strict Mode');
    expect(prompt).toContain('strict flags');
    expect(prompt).toContain('No `any` types');
    expect(prompt).toContain('null/undefined handling');
  });

  it('should include code quality checklist', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('Code Quality');
    expect(prompt).toContain('single-purpose');
    expect(prompt).toContain('separation of concerns');
    expect(prompt).toContain('error handling');
  });

  it('should include test verification checklist', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('Tests');
    expect(prompt).toContain('All tests pass');
    expect(prompt).toContain('Type checking passes');
  });

  it('should include binary verdict format', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('BINARY VERDICT');
    expect(prompt).toContain('VERDICT: APPROVED');
    expect(prompt).toContain('VERDICT: REJECTED');
  });

  it('should include rejection reasons format', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('Reasoning');
    expect(prompt).toContain('List all issues found');
    expect(prompt).toContain('severity');
    expect(prompt).toContain('location');
    expect(prompt).toContain('required fix');
  });

  it('should include rejection instructions', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('If REJECTED');
    expect(prompt).toContain('specific actionable fixes');
  });

  it('should include quality check commands', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('pnpm test');
    expect(prompt).toContain('pnpm check-types');
  });

  it('should include runId in context', () => {
    const prompt = generateReviewPrompt(mockPhase, mockPlan);

    expect(prompt).toContain('98ae37');
  });
});
