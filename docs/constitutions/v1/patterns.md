# Patterns

## Core Principle

**spectacular-codex follows selective abstraction, async-first patterns, and TypeScript strict mode.**

All code MUST adhere to these patterns. Deviations break architecture and reduce maintainability. When in doubt, favor explicitness over cleverness, async over blocking, and types over `any`.

## Async Job Pattern (MANDATORY)

**Rule:** MCP tool handlers MUST return immediately, never block.

MCP tool calls expect synchronous responses, but parallel execution takes hours. The async job pattern solves this:

**Pattern:**
```typescript
// ✅ CORRECT: Return immediately, execute in background
async handleExecute(args: any) {
  const runId = extractRunId(args.plan_path);

  // Create job tracker
  const job: ExecutionJob = {
    runId,
    status: 'running',
    phase: 1,
    tasks: [],
    startedAt: new Date()
  };
  this.jobs.set(runId, job);

  // Execute in background (async, non-blocking)
  this.executePhases(plan, job, reviewFrequency).catch(err => {
    job.status = 'failed';
    job.error = String(err);
  });

  // Return immediately with run_id
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ run_id: runId, status: 'started' })
    }]
  };
}

// ❌ WRONG: Blocking await (hangs Codex CLI for hours)
async handleExecute(args: any) {
  await this.executePhases(plan, job, reviewFrequency); // BLOCKS!
  return { run_id: runId, status: 'completed' };
}
```

**Why:** User must be able to poll for status while execution runs. Blocking defeats the async pattern.

## Prompt Template Pattern (MANDATORY)

**Rule:** Skills embedded in prompts, NOT referenced as external files.

Codex threads can't read spectacular skill files. Instructions must be embedded inline:

**Pattern:**
```typescript
// ✅ CORRECT: Embedded skill instructions
function generateTaskPrompt(task: Task, plan: Plan): string {
  return `
You are implementing Task ${task.id}: ${task.name}

## Your Process

Follow these steps exactly (from phase-task-verification and test-driven-development skills):

### 1. Navigate to Worktree
\`\`\`bash
cd .worktrees/${plan.runId}-task-${task.id}
\`\`\`

### 2. Read Context
- Read constitution (if exists): docs/constitutions/current/
- Read feature specification: specs/${plan.runId}-${plan.featureSlug}/spec.md

### 3. Implement Task (TDD)
Follow test-driven-development skill:
- Write test first
- Watch it fail (run test, verify failure)
- Write minimal code to pass
- Watch it pass (run test, verify success)
- Refactor if needed

### 4. Run Quality Checks
\`\`\`bash
bash <<'EOF'
npm test
if [ $? -ne 0 ]; then
  echo "❌ Tests failed"
  exit 1
fi
EOF
\`\`\`

### 5. Create Branch
Use phase-task-verification skill:
\`\`\`bash
git add .
gs branch create ${plan.runId}-task-${task.id}-{name} -m "Task ${task.id}: ${task.name}"
git commit -m "feat: ${task.name}"
\`\`\`

### 6. Detach HEAD (CRITICAL)
\`\`\`bash
git switch --detach
\`\`\`

### 7. Report Completion
Output: BRANCH: {branch-name}
`;
}

// ❌ WRONG: Referencing external skill files
function generateTaskPrompt(task: Task, plan: Plan): string {
  return `
You are implementing Task ${task.id}.

Follow the phase-task-verification skill at skills/phase-task-verification/SKILL.md
Follow the test-driven-development skill at skills/test-driven-development/SKILL.md
`; // Codex threads can't access these files!
}
```

**Why:** Codex threads don't have access to spectacular's skill files. Instructions must be self-contained.

**Skill Reference Format:**
- ✅ "Follow test-driven-development skill: [embedded instructions]"
- ✅ "Use phase-task-verification skill for git operations: [embedded steps]"
- ❌ "Read the TDD skill file"
- ❌ "@skills/test-driven-development"

## Parallel Execution Pattern (MANDATORY)

**Rule:** Use Promise.all() for true parallelism, spawn one Codex instance per task.

**Pattern:**
```typescript
// ✅ CORRECT: Promise.all for parallelism
async function spawnParallelTasks(tasks: Task[], plan: Plan, job: ExecutionJob) {
  const threadPromises = tasks.map(async (task) => {
    // Create isolated Codex instance
    const codex = new Codex({
      workingDirectory: `.worktrees/${plan.runId}-task-${task.id}`
    });
    const thread = codex.startThread();

    const prompt = generateTaskPrompt(task, plan);
    const turn = await thread.run(prompt);

    return {
      success: true,
      task: task.id,
      branch: extractBranchName(turn.finalResponse)
    };
  });

  // Wait for ALL threads to complete
  return await Promise.all(threadPromises);
}

// ❌ WRONG: Sequential execution (defeats parallelism)
async function spawnParallelTasks(tasks: Task[], plan: Plan, job: ExecutionJob) {
  const results = [];
  for (const task of tasks) {
    const codex = new Codex({ workingDirectory: `...` });
    const result = await codex.startThread().run(prompt); // SEQUENTIAL!
    results.push(result);
  }
  return results;
}
```

**Why:** Parallelism is the value proposition. Sequential execution defeats the purpose.

## Git-Based State Pattern (MANDATORY)

**Rule:** Git branches are source of truth, MCP server only tracks status.

State lives in git (branches, commits, worktrees), not in-memory or database:

**Pattern:**
```typescript
// ✅ CORRECT: Check git branches for truth
async function checkExistingWork(phase: Phase, runId: string) {
  const completedTasks = [];
  const pendingTasks = [];

  for (const task of phase.tasks) {
    const branchPattern = `${runId}-task-${phase.id}-${task.id}-`;
    const branch = await findBranch(branchPattern);

    if (branch && await branchHasCommits(branch)) {
      // Branch exists with commits = task complete
      completedTasks.push({ ...task, branch });
    } else {
      pendingTasks.push(task);
    }
  }

  return { completedTasks, pendingTasks };
}

// ❌ WRONG: Trusting in-memory state
async function checkExistingWork(phase: Phase, runId: string) {
  const job = this.jobs.get(runId);
  const completedTasks = job.tasks.filter(t => t.status === 'completed');
  // What if server restarted? In-memory state lost!
  return { completedTasks, pendingTasks: [] };
}
```

**Why:** Git state persists across crashes. In-memory state doesn't.

**Corollary:** MCP server job tracking is for real-time status only, not truth.

## Pure Utility Functions (REQUIRED)

**Rule:** Utils must be stateless, no side effects except IO.

Following commitment's v3 constitution, utility functions MUST be pure:

**Pattern:**
```typescript
// ✅ CORRECT: Pure utility function
export async function createWorktrees(
  tasks: Task[],
  runId: string,
  baseRef: string
): Promise<void> {
  for (const task of tasks) {
    const worktreePath = `.worktrees/${runId}-task-${task.id}`;
    await execa('git', [
      'worktree', 'add',
      worktreePath,
      '--detach',
      baseRef
    ]);
  }
}

// ❌ WRONG: Stateful utility
class WorktreeManager {
  private createdWorktrees = new Set<string>(); // STATE!

  async createWorktree(task: Task, runId: string) {
    // Uses internal state
    this.createdWorktrees.add(task.id);
  }
}
```

**Why:** Pure functions are testable, predictable, and composable. State belongs in orchestrators, not utils.

## Error Handling Pattern

**Rule:** Catch errors at layer boundaries, propagate with context.

**Pattern:**
```typescript
// ✅ CORRECT: Layer boundary error handling
async function executeParallelPhase(phase: Phase, plan: Plan, job: ExecutionJob) {
  try {
    const results = await spawnParallelTasks(phase.tasks, plan, job);

    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      // Contextual error
      throw new Error(
        `${failed.length} tasks failed:\n` +
        failed.map(f => `  - Task ${f.task}: ${f.error}`).join('\n')
      );
    }
  } catch (error) {
    // Update job state
    job.status = 'failed';
    job.error = String(error);
    throw error; // Propagate to top-level handler
  }
}

// ❌ WRONG: Silent failures
async function executeParallelPhase(phase: Phase, plan: Plan, job: ExecutionJob) {
  const results = await spawnParallelTasks(phase.tasks, plan, job).catch(err => {
    console.error(err); // Silent! Job status not updated!
    return [];
  });
}
```

**Error Categories:**
- **User Errors:** Invalid inputs, missing files → return error in MCP response
- **Execution Errors:** Task failures, quality check failures → update job status + propagate
- **System Errors:** Codex SDK failures, git errors → log + propagate

## TypeScript Strict Mode (MANDATORY)

**Rule:** All strict flags enabled, no `any` without explicit justification.

**tsconfig.json requirements:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true
  }
}
```

**Pattern:**
```typescript
// ✅ CORRECT: Strict types
interface ExecutionJob {
  runId: string;
  status: 'running' | 'completed' | 'failed'; // Union type, not string
  phase: number;
  tasks: TaskStatus[];
  error?: string; // Optional, but typed
}

function getJob(runId: string): ExecutionJob | undefined {
  return this.jobs.get(runId); // May be undefined
}

const job = getJob('abc123');
if (!job) {
  return { error: 'Job not found' }; // Null check required
}

// ❌ WRONG: Loose types
interface ExecutionJob {
  runId: string;
  status: string; // TOO BROAD!
  phase: any; // NO!
  tasks: any[]; // NO!
}

function getJob(runId: string): ExecutionJob {
  return this.jobs.get(runId)!; // Non-null assertion without check!
}
```

**Why:** Strict types catch bugs at compile time. `any` defeats TypeScript's purpose.

**Exceptions:** `any` allowed only for:
- External library interfaces without types
- JSON parsing (immediately validate with zod)
- Dynamic MCP tool arguments (immediately type-check)

## Promise.all() Safety Pattern

**Rule:** Always handle individual task failures in Promise.all().

Promise.all() rejects if ANY promise rejects. For parallel tasks, we want to wait for all:

**Pattern:**
```typescript
// ✅ CORRECT: Catch individual failures, wait for all
const threadPromises = tasks.map(async (task) => {
  try {
    const codex = new Codex({ workingDirectory: `...` });
    const result = await codex.startThread().run(prompt);

    return {
      success: true,
      task: task.id,
      branch: extractBranchName(result)
    };
  } catch (error) {
    return {
      success: false,
      task: task.id,
      error: String(error)
    };
  }
});

// Wait for ALL (even if some fail)
const results = await Promise.all(threadPromises);

// ❌ WRONG: Let Promise.all() reject on first failure
const threadPromises = tasks.map(async (task) => {
  const codex = new Codex({ workingDirectory: `...` });
  return await codex.startThread().run(prompt); // No try/catch!
});

const results = await Promise.all(threadPromises); // Rejects on FIRST failure!
```

**Why:** We want to see ALL task results (successes AND failures), not stop at first failure.

## Code Review Loop Pattern

**Rule:** Use same thread for review → fix → re-review (maintains conversation context).

**Pattern:**
```typescript
// ✅ CORRECT: Single thread for review loop
async function runCodeReview(phase: Phase, plan: Plan) {
  const codex = new Codex({ workingDirectory: `.worktrees/${plan.runId}-main` });
  const thread = codex.startThread(); // ONE thread

  let rejectionCount = 0;
  const MAX_REJECTIONS = 3;

  while (rejectionCount <= MAX_REJECTIONS) {
    // Review in thread
    const reviewResult = await thread.run(generateReviewPrompt(phase, plan));

    if (parseVerdict(reviewResult) === 'approved') {
      return; // Success
    }

    rejectionCount++;

    // Fix in SAME thread (conversation context preserved)
    await thread.run(generateFixerPrompt(reviewResult, plan));
  }
}

// ❌ WRONG: New thread each iteration (loses context)
async function runCodeReview(phase: Phase, plan: Plan) {
  for (let i = 0; i < MAX_REJECTIONS; i++) {
    const codex = new Codex({ workingDirectory: `...` });
    const thread = codex.startThread(); // NEW thread each time!

    const reviewResult = await thread.run(reviewPrompt);
    // Fix loses context of what was reviewed
  }
}
```

**Why:** Conversation context helps fixer understand what reviewer saw. New thread = lost context.

## Execa for Shell Commands (MANDATORY)

**Rule:** Never use raw shell strings. Use execa with array arguments.

**Pattern:**
```typescript
// ✅ CORRECT: Execa with array args (no shell injection)
import { execa } from 'execa';

async function createWorktree(path: string, ref: string) {
  await execa('git', ['worktree', 'add', path, '--detach', ref]);
}

async function stackBranch(branch: string, base: string) {
  await execa('gs', ['upstack', 'onto', base], {
    cwd: `.worktrees/${runId}-main`
  });
}

// ❌ WRONG: Shell strings (injection risk)
import { exec } from 'child_process';

async function createWorktree(path: string, ref: string) {
  exec(`git worktree add ${path} --detach ${ref}`); // DANGEROUS!
  // What if path = "; rm -rf /"?
}
```

**Why:** Array arguments prevent shell injection. User-provided paths are sanitized.

## Naming Conventions

**Files:**
- `kebab-case.ts` for all files
- `index.ts` for module entry points
- `.test.ts` for test files
- `.integration.ts` for integration tests

**Functions:**
- `camelCase` for functions and methods
- `async` prefix for async functions (optional, but recommended)
- Verb-noun pattern: `createWorktree`, `parseVerdict`, `generatePrompt`

**Interfaces/Types:**
- `PascalCase` for types and interfaces
- Suffix `Result` for return types: `CodexThreadResult`
- Suffix `Args` for argument types: `ExecuteArgs`

**Constants:**
- `UPPER_SNAKE_CASE` for true constants
- `camelCase` for config objects

## Import Patterns

**Rule:** Always use .js extensions for local imports (ESM requirement).

**Pattern:**
```typescript
// ✅ CORRECT: .js extension (ESM)
import { generateTaskPrompt } from './prompts/task-executor.js';
import { createWorktrees } from './utils/git.js';
import type { Task, Plan } from './types.js';

// ❌ WRONG: Missing .js extension
import { generateTaskPrompt } from './prompts/task-executor'; // BREAKS!
import { createWorktrees } from './utils/git'; // BREAKS!
```

**Why:** Node.js ESM requires explicit .js extensions. TypeScript compiles .ts → .js.

**Order:**
1. External packages (e.g., `@openai/codex`)
2. Internal modules (e.g., `./orchestrator/parallel-phase.js`)
3. Types (e.g., `import type { ... }`)

## Rationalization Table

Common rationalizations and why they're wrong:

| Temptation | Why It's Wrong | What To Do |
|------------|----------------|------------|
| "I'll block in tool handler, user can wait" | Defeats async job pattern, hangs CLI | Return immediately, execute in background |
| "I'll reference skill files in prompts" | Codex threads can't access files | Embed skill instructions inline |
| "I'll use sequential execution, it's simpler" | Defeats value proposition (parallelism) | Use Promise.all() with parallel threads |
| "I'll trust in-memory state for resume" | Lost on restart, git is truth | Check git branches, not job state |
| "I'll use `any` here, types are tedious" | Defeats TypeScript's purpose | Write proper types, use union types |
| "I'll use shell strings, quoting is hard" | Shell injection vulnerability | Use execa with array args |
| "I'll create new thread for each review" | Loses conversation context | Use same thread for review → fix loop |
| "I'll use shared state between threads" | Breaks parallelism, causes races | Use git branches for coordination |

## Anti-Patterns to Avoid

**From spectacular (Claude Code):**
- ❌ Skill file references (Codex can't read them)
- ❌ Task tool dispatching (use Codex SDK)
- ❌ TodoWrite for tracking (use structured output)

**From commitment v1:**
- ❌ Complex factories with chains
- ❌ Provider chains with fallbacks
- ❌ Auto-detection systems
- ❌ Complex inheritance (>3 extension points)

**From commitment v2:**
- ❌ No abstraction at all (70% duplication)
- ❌ Inline helpers in CLI (no testability)

**Embrace from commitment v3:**
- ✅ Simple orchestration modules
- ✅ Pure utility functions
- ✅ Prompt templates (focused, reusable)

## Testing Patterns

**Unit Tests:**
- Test pure functions (prompts, utils)
- No mocks needed (pure functions = no dependencies)
- Use real inputs/outputs

**Integration Tests:**
- Mock Codex SDK (return fixture responses)
- Test orchestration logic
- Verify Promise.all() parallelism

**E2E Tests:**
- Use real Codex (or fixture mode)
- Test full workflows
- Verify git state after execution

See testing.md for details.

## Performance Patterns

**Thread Spawning:**
- No limit by default (Promise.all spawns all)
- Future: Thread pool for rate limiting

**Memory Management:**
- Job state in-memory (Map)
- Clean up completed jobs on timeout
- Future: LRU cache or SQLite persistence

**Git Operations:**
- Batch worktree creation (all at once)
- Parallel git operations where safe
- Sequential stacking (order matters)

## Documentation Patterns

**Function Comments:**
```typescript
/**
 * Creates isolated git worktrees for parallel task execution.
 *
 * Each task gets a separate worktree at .worktrees/{runId}-task-{taskId}.
 * Worktrees are created in detached HEAD state from baseRef.
 *
 * @param tasks - Array of tasks to create worktrees for
 * @param runId - Unique run identifier (6-char hex)
 * @param baseRef - Git ref to branch worktrees from
 * @throws {Error} If git worktree add fails
 */
export async function createWorktrees(
  tasks: Task[],
  runId: string,
  baseRef: string
): Promise<void> {
  // Implementation
}
```

**Module Documentation:**
- README.md in each module directory
- Explain purpose, responsibilities, key patterns
- Link to architecture.md for context

## Future Pattern Considerations

**v2 Candidates:**
- Thread pool pattern (limit concurrent Codex instances)
- Circuit breaker pattern (rate limiting, backoff)
- Saga pattern (compensating transactions for failures)
- Plugin pattern (custom prompt templates)

**Remember:** Keep v1 patterns simple. Add complexity only when proven necessary.
