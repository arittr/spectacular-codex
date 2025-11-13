/**
 * Tests for spec generator prompt template generation.
 *
 * Verifies that prompts include all required sections:
 * - Brainstorming skill instructions (3 phases)
 * - Constitution references
 * - Output format specifications
 *
 * @module prompts/spec-generator.test
 */

import { describe, expect, it } from 'vitest';
import { generateSpecPrompt } from '@/prompts/spec-generator';

describe('generateSpecPrompt', () => {
  it('should include feature request in prompt', () => {
    const featureRequest = 'Add dark mode toggle to settings page';
    const runId = 'abc123';
    const prompt = generateSpecPrompt(featureRequest, runId);

    expect(prompt).toContain('Add dark mode toggle to settings page');
  });

  it('should include runId in output path', () => {
    const featureRequest = 'Implement user authentication';
    const runId = 'def456';
    const prompt = generateSpecPrompt(featureRequest, runId);

    expect(prompt).toContain('def456');
    expect(prompt).toContain('specs/def456-');
  });

  it('should embed brainstorming skill Phase 1: Understanding', () => {
    const prompt = generateSpecPrompt('Test feature', 'abc123');

    expect(prompt).toContain('brainstorming');
    expect(prompt).toContain('Phase 1');
    expect(prompt).toContain('Understanding');
    expect(prompt).toContain('clarifying questions');
    expect(prompt).toContain('constraints');
    expect(prompt).toContain('requirements');
  });

  it('should embed brainstorming skill Phase 2: Exploration', () => {
    const prompt = generateSpecPrompt('Test feature', 'abc123');

    expect(prompt).toContain('Phase 2');
    expect(prompt).toContain('Exploration');
    expect(prompt).toContain('alternatives');
    expect(prompt).toContain('trade-offs');
  });

  it('should embed brainstorming skill Phase 3: Design', () => {
    const prompt = generateSpecPrompt('Test feature', 'abc123');

    expect(prompt).toContain('Phase 3');
    expect(prompt).toContain('Design');
    expect(prompt).toContain('Finalize');
  });

  it('should reference constitution files', () => {
    const prompt = generateSpecPrompt('Test feature', 'abc123');

    expect(prompt).toContain('docs/constitutions/current/');
    expect(prompt).toContain('architecture.md');
    expect(prompt).toContain('patterns.md');
    expect(prompt).toContain('tech-stack.md');
  });

  it('should specify output format', () => {
    const prompt = generateSpecPrompt('Test feature', 'abc123');

    expect(prompt).toContain('specs/');
    expect(prompt).toContain('spec.md');
    expect(prompt).toContain('feature-slug');
  });

  it('should instruct to create lean spec', () => {
    const prompt = generateSpecPrompt('Test feature', 'abc123');

    expect(prompt).toContain('lean');
    expect(prompt).toContain('Reference constitutions');
  });

  it('should include reporting instruction', () => {
    const prompt = generateSpecPrompt('Test feature', 'abc123');

    expect(prompt).toContain('Report Completion');
    expect(prompt).toContain('SPEC_PATH:');
  });
});
