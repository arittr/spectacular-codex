/**
 * Tests for plan generator prompt template generation.
 *
 * Verifies that prompts include all required sections:
 * - Task decomposition skill instructions
 * - Dependency analysis steps
 * - Phase grouping logic (sequential vs parallel)
 * - Validation rules (no XL tasks, explicit files)
 *
 * @module prompts/plan-generator.test
 */

import { describe, expect, it } from 'vitest';
import { generatePlanPrompt } from './plan-generator.js';

describe('generatePlanPrompt', () => {
  const specPath = 'specs/abc123-feature-name/spec.md';
  const runId = 'abc123';

  it('should include spec path and runId', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    expect(prompt).toContain('abc123');
    expect(prompt).toContain('specs/abc123-feature-name/spec.md');
  });

  it('should embed decomposing-tasks skill instructions', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    // Check for decomposing-tasks skill references
    expect(prompt).toContain('decomposing-tasks');
    expect(prompt).toContain('Extract Tasks');
    expect(prompt).toContain('Analyze Dependencies');
    expect(prompt).toContain('Group into Phases');
  });

  it('should include task extraction instructions', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    expect(prompt).toContain('Read the spec');
    expect(prompt).toContain('identify implementation tasks');
    expect(prompt).toContain('NO XL tasks');
  });

  it('should include dependency analysis instructions', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    expect(prompt).toContain('file overlaps');
    expect(prompt).toContain('Same files = sequential');
    expect(prompt).toContain('Independent files = can be parallel');
  });

  it('should include phase grouping instructions', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    expect(prompt).toContain('Parallel phases');
    expect(prompt).toContain('Promise.all()');
    expect(prompt).toContain('Sequential phases');
  });

  it('should include validation rules', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    expect(prompt).toContain('NO XL tasks');
    expect(prompt).toContain('explicit files');
  });

  it('should include output format instructions', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    expect(prompt).toContain('plan.md');
    expect(prompt).toContain('Plan Structure Rules');
  });

  it('should reference constitution files', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    expect(prompt).toContain('docs/constitutions/current/');
  });

  it('should include git-spice stacking instructions', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    expect(prompt).toContain('git-spice');
    expect(prompt).toContain('stacking');
  });

  it('should include task complexity estimation', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    expect(prompt).toContain('XS');
    expect(prompt).toContain('S');
    expect(prompt).toContain('M');
    expect(prompt).toContain('L');
  });

  it('should include example plan structure', () => {
    const prompt = generatePlanPrompt(specPath, runId);

    expect(prompt).toContain('## Phase 1');
    expect(prompt).toContain('### Task');
  });
});
