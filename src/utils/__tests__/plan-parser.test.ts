import { describe, expect, it } from 'vitest';
import { extractRunId, parsePlan } from '@/utils/plan-parser';

describe('extractRunId', () => {
  it('extracts runId from plan path with specs directory', () => {
    const planPath = 'specs/abc123-feature-name/plan.md';
    const runId = extractRunId(planPath);
    expect(runId).toBe('abc123');
  });

  it('extracts runId from absolute path', () => {
    const planPath = '/absolute/path/specs/def456-another-feature/plan.md';
    const runId = extractRunId(planPath);
    expect(runId).toBe('def456');
  });

  it('extracts runId without feature slug', () => {
    const planPath = 'specs/789abc/plan.md';
    const runId = extractRunId(planPath);
    expect(runId).toBe('789abc');
  });

  it('throws error if plan path is invalid', () => {
    expect(() => extractRunId('invalid/path.md')).toThrow('Invalid plan path');
  });

  it('throws error if runId is not 6 characters', () => {
    expect(() => extractRunId('specs/abc/plan.md')).toThrow('Invalid runId format');
  });
});

describe('parsePlan', () => {
  it('parses simple plan with one parallel phase', () => {
    const planMarkdown = `# Implementation Plan: Example Feature

Run ID: abc123
Feature: example-feature

## Phase 1: Foundation (Parallel)

### Task 1-1: Database Schema
**Description:** Create database schema
**Files:**
- src/db/schema.ts
- src/db/migrations/001-initial.ts

**Acceptance Criteria:**
- Schema types defined
- Migration created
- Tests pass

**Dependencies:** None

### Task 1-2: API Service
**Description:** Implement API service
**Files:**
- src/services/api.ts

**Acceptance Criteria:**
- Service class created
- Tests pass

**Dependencies:** 1-1
`;

    const plan = parsePlan(planMarkdown, 'abc123');

    expect(plan.runId).toBe('abc123');
    expect(plan.featureSlug).toBe('example-feature');
    expect(plan.title).toBe('Implementation Plan: Example Feature');
    expect(plan.phases).toHaveLength(1);

    const phase = plan.phases[0];
    expect(phase?.id).toBe(1);
    expect(phase?.name).toBe('Foundation');
    expect(phase?.strategy).toBe('parallel');
    expect(phase?.tasks).toHaveLength(2);

    const task1 = phase?.tasks[0];
    expect(task1?.id).toBe('1-1');
    expect(task1?.name).toBe('Database Schema');
    expect(task1?.description).toBe('Create database schema');
    expect(task1?.files).toEqual(['src/db/schema.ts', 'src/db/migrations/001-initial.ts']);
    expect(task1?.acceptanceCriteria).toEqual([
      'Schema types defined',
      'Migration created',
      'Tests pass',
    ]);
    expect(task1?.dependencies).toBeUndefined();

    const task2 = phase?.tasks[1];
    expect(task2?.id).toBe('1-2');
    expect(task2?.dependencies).toEqual(['1-1']);
  });

  it('parses plan with sequential phase', () => {
    const planMarkdown = `# Implementation Plan: Sequential Example

Run ID: def456
Feature: sequential-feature

## Phase 1: Foundation (Sequential)

### Task 1-1: First Task
**Description:** Do first thing
**Files:**
- src/first.ts

**Acceptance Criteria:**
- First thing done

**Dependencies:** None
`;

    const plan = parsePlan(planMarkdown, 'def456');

    expect(plan.phases[0]?.strategy).toBe('sequential');
  });

  it('parses multiple phases', () => {
    const planMarkdown = `# Implementation Plan: Multi-Phase

Run ID: 123456
Feature: multi-phase

## Phase 1: Setup (Parallel)

### Task 1-1: Task One
**Description:** First task
**Files:**
- src/one.ts

**Acceptance Criteria:**
- Done

**Dependencies:** None

## Phase 2: Implementation (Sequential)

### Task 2-1: Task Two
**Description:** Second task
**Files:**
- src/two.ts

**Acceptance Criteria:**
- Done

**Dependencies:** None
`;

    const plan = parsePlan(planMarkdown, '123456');

    expect(plan.phases).toHaveLength(2);
    expect(plan.phases[0]?.id).toBe(1);
    expect(plan.phases[1]?.id).toBe(2);
    expect(plan.phases[0]?.strategy).toBe('parallel');
    expect(plan.phases[1]?.strategy).toBe('sequential');
  });

  it("throws error if runId in content doesn't match parameter", () => {
    const planMarkdown = `# Plan
Run ID: abc123
Feature: test
`;

    expect(() => parsePlan(planMarkdown, 'def456')).toThrow('runId mismatch');
  });

  it('throws error if plan has no phases', () => {
    const planMarkdown = `# Plan
Run ID: abc123
Feature: test

No phases here.
`;

    expect(() => parsePlan(planMarkdown, 'abc123')).toThrow('No phases found');
  });
});
