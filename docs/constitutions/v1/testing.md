# Testing

## Core Principle

**Test at the right layer: Unit tests for pure functions, integration tests for orchestration, E2E tests for workflows.**

Testing philosophy:
1. **Pure functions → Unit tests** - Predictable inputs/outputs, easy to test
2. **Orchestration → Integration tests** - Mock Codex SDK, test coordination logic
3. **Workflows → E2E tests** - Real Codex threads or fixture mode for full validation
4. **Git operations → Integration tests** - Real git commands in temp repos

## Test Layers

### Layer 1: Unit Tests (Pure Functions)

**What to test:**
- Prompt generation (src/prompts/)
- Plan parsing (src/utils/plan-parser.ts)
- Branch name validation (src/utils/branch-tracker.ts)
- Run ID extraction (src/utils/*)

**Pattern:**
```typescript
// tests/unit/prompts/task-executor.test.ts
import { generateTaskPrompt } from '../../../src/prompts/task-executor.js';

describe('generateTaskPrompt', () => {
  it('includes task name and acceptance criteria', () => {
    const task = {
      id: '1-2',
      name: 'Database Schema',
      description: 'Create user table',
      acceptanceCriteria: ['Migration file created', 'Schema matches spec']
    };

    const prompt = generateTaskPrompt(task, mockPlan);

    expect(prompt).toContain('Task 1-2: Database Schema');
    expect(prompt).toContain('Migration file created');
    expect(prompt).toContain('Schema matches spec');
  });

  it('embeds TDD skill instructions', () => {
    const prompt = generateTaskPrompt(mockTask, mockPlan);

    expect(prompt).toContain('Write test first');
    expect(prompt).toContain('Watch it fail');
    expect(prompt).toContain('Write minimal code to pass');
  });
});
```

**Key:** No mocks needed. Pure input → output testing.

### Layer 2: Integration Tests (Orchestration)

**What to test:**
- Handler logic (src/handlers/)
- Phase execution (src/orchestrator/)
- Code review loops (src/orchestrator/code-review.ts)
- Async job pattern

**Mocking Strategy:**

```typescript
// tests/integration/orchestrator/parallel-phase.test.ts
import { vi } from 'vitest';
import { executeParallelPhase } from '../../../src/orchestrator/parallel-phase.js';

// Mock Codex SDK
const mockThread = {
  run: vi.fn().mockResolvedValue({ output: 'abc123-task-1-2-schema' })
};

const mockCodex = {
  startThread: vi.fn().mockReturnValue(mockThread)
};

vi.mock('@openai/codex', () => ({
  Codex: vi.fn().mockImplementation(() => mockCodex)
}));

describe('executeParallelPhase', () => {
  it('spawns threads in parallel with Promise.all', async () => {
    const phase = {
      id: 1,
      tasks: [
        { id: '1-1', name: 'Task 1' },
        { id: '1-2', name: 'Task 2' }
      ]
    };

    await executeParallelPhase(phase, mockPlan, mockJob);

    // Verify Codex constructor called for each task
    expect(Codex).toHaveBeenCalledTimes(2);
    expect(Codex).toHaveBeenCalledWith({
      workingDirectory: '.worktrees/abc123-task-1-1'
    });

    // Verify threads started
    expect(mockCodex.startThread).toHaveBeenCalledTimes(2);

    // Verify parallel execution (Promise.all pattern)
    expect(mockThread.run).toHaveBeenCalledTimes(2);
  });

  it('tracks task status during execution', async () => {
    const job = { tasks: new Map() };

    await executeParallelPhase(mockPhase, mockPlan, job);

    expect(job.tasks.get('1-1')).toEqual({
      status: 'completed',
      branch: 'abc123-task-1-1-schema'
    });
  });
});
```

**Key:** Mock Codex SDK, test orchestration logic, verify correct SDK calls.

### Layer 3: E2E Tests (Full Workflows)

**What to test:**
- Complete spec → plan → execute flow
- Resume after failure
- Code review loops with rejections
- Multi-phase execution

**Approaches:**

#### Option A: Fixture Mode (Fast)

```typescript
// tests/e2e/parallel-execution.test.ts
import { executeViaMCP } from '../helpers/mcp-client.js';

describe('Parallel Execution E2E', () => {
  it('executes 3-task parallel phase', async () => {
    // Use fixture responses instead of real Codex
    const fixtureMode = true;

    const result = await executeViaMCP({
      plan_path: 'tests/fixtures/plans/parallel-3-tasks.md',
      fixture_mode: fixtureMode
    });

    expect(result.status).toBe('completed');
    expect(result.tasks_completed).toBe(3);

    // Verify branches created
    const branches = await getBranches('abc123-task-1-');
    expect(branches).toHaveLength(3);
  });
});
```

#### Option B: Real Codex (Slow, Accurate)

```typescript
// tests/e2e/real-codex.test.ts
describe('Real Codex Execution', () => {
  it.skip('executes simple task with real Codex', async () => {
    // Skipped by default (slow, requires API key)
    // Run with: npm test -- --run-e2e

    const result = await executeViaMCP({
      plan_path: 'tests/fixtures/plans/simple-task.md',
      fixture_mode: false
    });

    expect(result.status).toBe('completed');

    // Verify actual code was written
    const worktreePath = '.worktrees/abc123-task-1-1';
    const codeExists = await fs.exists(`${worktreePath}/src/schema.ts`);
    expect(codeExists).toBe(true);
  });
});
```

**Key:** E2E tests validate complete workflows. Use fixtures for CI, real Codex for pre-release validation.

### Layer 4: Git Operations Tests

**What to test:**
- Worktree creation/cleanup
- Branch stacking
- Branch existence checks
- Resume logic

**Pattern:**

```typescript
// tests/integration/utils/git.test.ts
import { createWorktree, cleanupWorktrees, stackBranches } from '../../../src/utils/git.js';
import { mkdtemp } from 'fs/promises';
import { join } from 'path';

describe('Git Operations', () => {
  let tempRepo: string;

  beforeEach(async () => {
    // Create temporary git repo
    tempRepo = await mkdtemp(join(tmpdir(), 'test-repo-'));
    await execa('git', ['init'], { cwd: tempRepo });
    await execa('git', ['commit', '--allow-empty', '-m', 'Initial'], { cwd: tempRepo });
  });

  afterEach(async () => {
    await rm(tempRepo, { recursive: true });
  });

  it('creates worktree at specified path', async () => {
    const worktreePath = join(tempRepo, '.worktrees/abc123-task-1');

    await createWorktree(worktreePath, 'main', tempRepo);

    const exists = await fs.exists(worktreePath);
    expect(exists).toBe(true);

    // Verify worktree is in git's list
    const { stdout } = await execa('git', ['worktree', 'list'], { cwd: tempRepo });
    expect(stdout).toContain('abc123-task-1');
  });

  it('cleans up worktrees after stacking', async () => {
    await createWorktree(join(tempRepo, '.worktrees/abc123-task-1'), 'main', tempRepo);
    await createWorktree(join(tempRepo, '.worktrees/abc123-task-2'), 'main', tempRepo);

    await cleanupWorktrees('abc123', tempRepo);

    const { stdout } = await execa('git', ['worktree', 'list'], { cwd: tempRepo });
    expect(stdout).not.toContain('abc123-task');
  });
});
```

**Key:** Use real git commands in temporary repos. Verify file system and git state.

## Test Organization

```
tests/
├── unit/                     # Pure function tests
│   ├── prompts/
│   │   ├── task-executor.test.ts
│   │   ├── code-reviewer.test.ts
│   │   └── fixer.test.ts
│   ├── utils/
│   │   ├── plan-parser.test.ts
│   │   └── branch-tracker.test.ts
│   └── types/
│       └── validation.test.ts
├── integration/              # Module interaction tests
│   ├── handlers/
│   │   ├── execute.test.ts
│   │   └── status.test.ts
│   ├── orchestrator/
│   │   ├── parallel-phase.test.ts
│   │   ├── sequential-phase.test.ts
│   │   └── code-review.test.ts
│   └── utils/
│       └── git.test.ts
├── e2e/                      # Full workflow tests
│   ├── spec-to-plan.test.ts
│   ├── parallel-execution.test.ts
│   ├── sequential-execution.test.ts
│   └── resume.test.ts
├── fixtures/                 # Test data
│   ├── plans/
│   │   ├── parallel-3-tasks.md
│   │   └── sequential-5-tasks.md
│   ├── specs/
│   │   └── sample-feature.md
│   └── responses/
│       └── codex-outputs.json
└── helpers/                  # Test utilities
    ├── mcp-client.ts        # MCP tool call helpers
    ├── temp-repo.ts         # Temp git repo creation
    └── fixtures.ts          # Fixture loading
```

## Testing Async Job Pattern

**Challenge:** Tool handler returns immediately, execution continues in background.

**Pattern:**

```typescript
// tests/integration/handlers/execute.test.ts
describe('Execute Handler (Async Job Pattern)', () => {
  it('returns immediately with run_id', async () => {
    const start = Date.now();

    const result = await handleExecute({ plan_path: 'specs/abc123/plan.md' });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // Must return quickly
    expect(result.run_id).toBe('abc123');
    expect(result.status).toBe('started');
  });

  it('executes phases in background', async () => {
    const job = { runId: 'abc123', status: 'running' };
    jobs.set('abc123', job);

    await handleExecute({ plan_path: 'specs/abc123/plan.md' });

    // Immediately after return, job still running
    expect(job.status).toBe('running');

    // Wait for background execution
    await waitForJobCompletion('abc123', 5000);

    expect(job.status).toBe('completed');
  });
});
```

**Key:** Test both immediate return AND background execution completion.

## Testing Code Review Loops

**Challenge:** Review rejection → fix → re-review requires conversation context.

**Pattern:**

```typescript
// tests/integration/orchestrator/code-review.test.ts
describe('Code Review Loops', () => {
  it('uses same thread for review and fix', async () => {
    const mockThread = {
      run: vi.fn()
        .mockResolvedValueOnce({ verdict: 'reject', issues: ['Missing tests'] }) // Review 1
        .mockResolvedValueOnce({ output: 'fixes-applied' })                      // Fix 1
        .mockResolvedValueOnce({ verdict: 'approve' })                           // Review 2
    };

    mockCodex.startThread.mockReturnValue(mockThread);

    await codeReviewLoop(mockPhase, mockPlan, mockJob);

    // Verify same thread used for all interactions
    expect(mockCodex.startThread).toHaveBeenCalledTimes(1);
    expect(mockThread.run).toHaveBeenCalledTimes(3);
  });

  it('fails after max rejections', async () => {
    const mockThread = {
      run: vi.fn().mockResolvedValue({ verdict: 'reject', issues: ['Bug'] })
    };

    mockCodex.startThread.mockReturnValue(mockThread);

    await expect(codeReviewLoop(mockPhase, mockPlan, mockJob))
      .rejects.toThrow('Max rejections exceeded');

    expect(mockThread.run).toHaveBeenCalledTimes(MAX_REJECTIONS * 2 + 1);
  });
});
```

**Key:** Verify thread reuse (single startThread call) and rejection count tracking.

## Testing Resume Logic

**Pattern:**

```typescript
// tests/e2e/resume.test.ts
describe('Resume After Failure', () => {
  it('skips completed tasks, re-runs failed tasks', async () => {
    // Setup: Create branches for completed tasks
    await execa('git', ['branch', 'abc123-task-1-1-schema']);
    await execa('git', ['branch', 'abc123-task-1-2-service']);
    await execa('git', ['commit', '--allow-empty', '-m', 'Task 1-1'], { cwd: '.worktrees/abc123-task-1-1' });

    // Task 1-2 has branch but no commits (failed)

    const plan = parsePlan('specs/abc123/plan.md');

    await executeViaMCP({ plan_path: 'specs/abc123/plan.md' });

    // Verify only task 1-2 executed
    expect(mockCodex.startThread).toHaveBeenCalledTimes(1);
    expect(mockCodex.startThread).toHaveBeenCalledWith(
      expect.objectContaining({ workingDirectory: '.worktrees/abc123-task-1-2' })
    );
  });
});
```

**Key:** Test branch existence checks prevent duplicate work.

## Mocking Strategies

### Mock Codex SDK

**Full mock:**

```typescript
const mockThreadRun = vi.fn().mockResolvedValue({ output: 'branch-name' });
const mockStartThread = vi.fn().mockReturnValue({ run: mockThreadRun });
const mockCodex = vi.fn().mockReturnValue({ startThread: mockStartThread });

vi.mock('@openai/codex', () => ({ Codex: mockCodex }));
```

**Spy on real implementation (if SDK supports):**

```typescript
import { Codex } from '@openai/codex';
const codexSpy = vi.spyOn(Codex.prototype, 'startThread');

// Let real implementation run, verify calls
expect(codexSpy).toHaveBeenCalledWith(/* ... */);
```

### Mock Git Commands

**Option A: Mock execa**

```typescript
vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: 'branch-name', stderr: '' })
}));
```

**Option B: Use real git in temp repos** (Preferred)

```typescript
// Create temp repo, run real git commands, verify file system
const tempRepo = await mkdtemp(join(tmpdir(), 'test-'));
await execa('git', ['init'], { cwd: tempRepo });
```

**Key:** Prefer real git when possible. Mocking git can miss edge cases.

## Test Utilities

### MCP Client Helper

```typescript
// tests/helpers/mcp-client.ts
export async function executeViaMCP(args: { plan_path: string }) {
  const server = new SpectacularMCP();
  return await server.handleExecute(args);
}

export async function getStatusViaMCP(runId: string) {
  const server = new SpectacularMCP();
  return await server.handleStatus({ run_id: runId });
}
```

### Temp Git Repo

```typescript
// tests/helpers/temp-repo.ts
export async function createTempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'test-repo-'));
  await execa('git', ['init'], { cwd: dir });
  await execa('git', ['commit', '--allow-empty', '-m', 'Initial'], { cwd: dir });
  return dir;
}

export async function cleanupTempRepo(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
```

### Wait for Job Completion

```typescript
// tests/helpers/wait.ts
export async function waitForJobCompletion(
  runId: string,
  timeout: number = 10000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const status = await getStatusViaMCP(runId);
    if (status.status === 'completed' || status.status === 'failed') {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Job ${runId} did not complete within ${timeout}ms`);
}
```

## Coverage Goals

**Targets:**
- Unit tests: 100% coverage (pure functions, easy to test)
- Integration tests: 80%+ coverage (orchestration logic)
- E2E tests: Critical paths only (slow, focus on workflows)

**Focus areas:**
- Async job pattern (return immediately, background execution)
- Parallel execution (Promise.all, thread isolation)
- Code review loops (thread reuse, rejection tracking)
- Resume logic (branch checks, skip completed tasks)
- Error handling (thread failures, git errors)

## CI/CD Integration

**Fast feedback loop:**

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - run: npm install
      - run: npm run test:unit        # Fast (seconds)
      - run: npm run test:integration # Medium (minutes)
      - run: npm run test:e2e:fixture # Fast E2E with fixtures

      # Real Codex tests only on release branches
      - if: github.ref == 'refs/heads/main'
        run: npm run test:e2e:real
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Key:** Run unit/integration on every commit, real Codex E2E only on main/release.

## Anti-Patterns

### ❌ Don't Test Implementation Details

**Wrong:**
```typescript
it('creates worktree with correct git command', () => {
  await createWorktree('/path', 'branch');
  expect(execa).toHaveBeenCalledWith('git', ['worktree', 'add', '/path', 'branch']);
});
```

**Why:** Tests implementation (execa call), not behavior (worktree exists).

**Better:**
```typescript
it('creates worktree at path', async () => {
  await createWorktree('/path', 'branch');
  const exists = await fs.exists('/path');
  expect(exists).toBe(true);
});
```

### ❌ Don't Mock Everything

**Wrong:**
```typescript
vi.mock('fs/promises');
vi.mock('execa');
vi.mock('@openai/codex');
vi.mock('../../../src/utils/git.js');
// Everything is mocked, test verifies nothing
```

**Why:** Over-mocking tests implementation, not integration.

**Better:** Mock external dependencies (Codex SDK), use real implementations for internal code.

### ❌ Don't Skip E2E Tests

**Wrong:**
```typescript
it.skip('E2E test is too slow', () => {
  // Skipped permanently
});
```

**Why:** E2E tests catch integration bugs unit tests miss.

**Better:** Use fixtures for CI, real Codex for pre-release validation.

## Summary

**Test at the right layer:**
- Unit: Pure functions (prompts, parsing, validation)
- Integration: Orchestration (mock Codex, real git in temp repos)
- E2E: Workflows (fixtures for CI, real Codex for releases)

**Mock strategically:**
- Mock: External dependencies (Codex SDK)
- Real: Internal code (utils, orchestrators)
- Real: Git operations (temp repos, verify file system)

**Focus on:**
- Async job pattern correctness
- Parallel execution safety
- Code review loop behavior
- Resume logic accuracy

**Remember:** Tests document intended behavior. Write tests that catch bugs, not tests that pass.
