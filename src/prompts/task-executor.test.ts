/**
 * Tests for task executor prompt template generation.
 *
 * Verifies that prompts include all required sections:
 * - TDD skill instructions
 * - Phase-task-verification skill instructions
 * - Quality check commands
 * - Git operations (branch creation, detach HEAD)
 *
 * @module prompts/task-executor.test
 */

import { describe, expect, it } from 'vitest';
import type { Plan, Task } from '../types.js';
import { generateTaskPrompt } from './task-executor.js';

describe('generateTaskPrompt', () => {
  const mockTask: Task = {
    acceptanceCriteria: [
      'Prompt embeds TDD skill instructions inline',
      'Prompt embeds phase-task-verification skill instructions',
      'Prompt includes quality check commands',
      'Prompt includes git branch creation steps',
    ],
    description: 'Generate prompts for task execution',
    files: ['src/prompts/task-executor.ts', 'src/prompts/task-executor.test.ts'],
    id: '2-1',
    name: 'Task Executor Prompt Template',
  };

  const mockPlan: Plan = {
    featureSlug: 'spectacular-codex',
    phases: [],
    runId: '98ae37',
    stackingBackend: 'git-spice',
  };

  const qualityChecks = {
    lint: 'pnpm biome check --write .',
    test: 'pnpm test',
    typeCheck: 'pnpm check-types',
  };

  it('should include task identification', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    expect(prompt).toContain('Task 2-1');
    expect(prompt).toContain('Task Executor Prompt Template');
  });

  it('should include worktree navigation instructions', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    expect(prompt).toContain('.worktrees/98ae37-task-2-1');
    expect(prompt).toContain('cd .worktrees/98ae37-task-2-1');
  });

  it('should embed TDD skill instructions inline', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    // Check for TDD methodology keywords
    expect(prompt).toContain('test-driven-development');
    expect(prompt).toContain('Write test first');
    expect(prompt).toContain('Watch it fail');
    expect(prompt).toContain('Write minimal code to pass');
    expect(prompt).toContain('Watch it pass');
  });

  it('should embed phase-task-verification skill instructions', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    // Check for phase-task-verification keywords
    expect(prompt).toContain('phase-task-verification');
    expect(prompt).toContain('branch create');
    expect(prompt).toContain('git switch --detach');
  });

  it('should include quality check commands', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    expect(prompt).toContain('pnpm test');
    expect(prompt).toContain('pnpm check-types');
    expect(prompt).toContain('pnpm biome check --write .');
  });

  it('should include git branch creation instructions', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    expect(prompt).toContain('gs branch create');
    expect(prompt).toContain('98ae37-task-2-1');
    expect(prompt).toContain('[Task 2.1]');
  });

  it('should include detach HEAD instruction', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    expect(prompt).toContain('git switch --detach');
    expect(prompt).toContain('CRITICAL');
  });

  it('should include file list', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    expect(prompt).toContain('src/prompts/task-executor.ts');
    expect(prompt).toContain('src/prompts/task-executor.test.ts');
  });

  it('should include acceptance criteria', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    expect(prompt).toContain('Prompt embeds TDD skill instructions inline');
    expect(prompt).toContain('Prompt embeds phase-task-verification skill instructions');
  });

  it('should include context references', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    expect(prompt).toContain('specs/98ae37-spectacular-codex/spec.md');
    expect(prompt).toContain('docs/constitutions/current/');
  });

  it('should include reporting completion instruction', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan, qualityChecks);

    expect(prompt).toContain('Report completion');
    expect(prompt).toContain('BRANCH:');
  });
});
