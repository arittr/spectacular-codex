# Architecture

## Core Principle

**spectacular-codex follows a 4-layer MCP server architecture with strict boundaries and async job patterns.**

Violating these boundaries breaks the architecture and makes the system unmaintainable. The key architectural constraints are: MCP server orchestrates (but doesn't execute), Codex threads execute (in isolation), git provides state (branches are truth), and coordination happens through polling (not streaming).

## Architectural Layers

```
┌─────────────────────────────────────────┐
│         Codex CLI (User)                │  ← User interface
│  • Slash commands (/prompts:spectacular-*)
│  • Status polling                       │
│  • Result display                       │
└─────────────┬───────────────────────────┘
              │ MCP tool calls
              ▼
┌─────────────────────────────────────────┐
│        MCP Server (Node.js)             │  ← Orchestration layer
│  • Tool handlers (execute, status)      │
│  • Job state tracking (in-memory)       │
│  • Phase orchestration logic            │
│  • Prompt template generation           │
│  • Git operations delegation            │
└─────────────┬───────────────────────────┘
              │ spawns via Codex SDK
              ▼
┌─────────────────────────────────────────┐
│      Codex SDK Threads (Parallel)       │  ← Execution layer
│  • Task implementation threads          │
│  • Code review thread                   │
│  • Fixer thread (on rejection)          │
│  • Each thread = isolated context       │
└─────────────┬───────────────────────────┘
              │ work happens in git
              ▼
┌─────────────────────────────────────────┐
│     Git Worktrees + Branches            │  ← State layer
│  • .worktrees/{runid}-main/             │
│  • .worktrees/{runid}-task-N/           │
│  • Branches: {runid}-task-*             │
│  • Commits (implementation artifacts)   │
└─────────────┬───────────────────────────┘
              │ calls external tools
              ▼
┌─────────────────────────────────────────┐
│        External Systems                 │  ← External dependencies
│  • Git commands (gs, git)               │
│  • File system operations               │
│  • Test/lint/build tools                │
└─────────────────────────────────────────┘
```

## Dependency Rules

**Mandatory:** Dependencies flow DOWNWARD only.

- ✅ MCP Server → Codex SDK ← allowed (server spawns threads)
- ✅ Codex SDK → Git Worktrees ← allowed (threads modify git state)
- ✅ Git Worktrees → External Systems ← allowed (git calls tools)
- ❌ Codex SDK → MCP Server ← FORBIDDEN (threads don't call server APIs)
- ❌ Git Worktrees → Codex SDK ← FORBIDDEN (git doesn't spawn threads)
- ❌ External Systems → Git Worktrees ← N/A (external doesn't import code)

**Violation breaks architecture:** Upward dependencies create tight coupling and break the async job pattern.

## Layer Responsibilities

### 1. Codex CLI Layer (User-Facing)

**Responsibility:** User interaction via slash commands and status polling.

**Allowed:**
- Invoke `/prompts:spectacular-*` slash commands
- Call MCP tools with arguments
- Poll for status updates
- Display formatted results
- Handle user input for questions (e.g., review frequency)

**Forbidden:**
- Direct Codex SDK access (MCP server handles)
- Job state management (MCP server tracks)
- Git operations (MCP server delegates)

**Key Pattern:** Slash commands are thin wrappers that call MCP tools and format output.

**Example:**
```markdown
# ~/.codex/prompts/spectacular-execute.md
Call MCP tool:
{"tool": "spectacular_execute", "plan_path": "$1"}

Poll for status:
{"tool": "spectacular_status", "run_id": "{returned_run_id}"}
```

### 2. MCP Server Layer (Orchestration)

**Responsibility:** Coordinate parallel execution, manage job state, generate prompts.

**Allowed:**
- Register MCP tools (execute, status, spec, plan)
- Parse plan.md and extract phases/tasks
- Spawn Codex threads via SDK (Promise.all for parallelism)
- Track job status in-memory (running/completed/failed)
- Generate prompt templates with embedded skill instructions
- Delegate git operations to utility modules
- Implement async job pattern (return immediately, background execution)

**Forbidden:**
- Direct git command execution (use utility functions)
- Blocking operations in tool handlers (use background async)
- Shared mutable state between threads (use git branches)
- Streaming thread output (git branches are state)

**Key Pattern:** Orchestrator coordinates, threads execute. Server returns immediately from tool calls, execution continues in background.

**Module Structure:**
```
src/
├── index.ts              # MCP server entry point, tool registration
├── handlers/             # Tool handlers (execute, status, spec, plan)
│   ├── execute.ts
│   ├── status.ts
│   ├── spec.ts
│   └── plan.ts
├── orchestrator/         # Phase execution logic
│   ├── parallel-phase.ts # Parallel orchestration
│   ├── sequential-phase.ts # Sequential orchestration
│   └── code-review.ts    # Review loops
├── prompts/              # Prompt template generators
│   ├── task-executor.ts
│   ├── code-reviewer.ts
│   ├── fixer.ts
│   └── spec-generator.ts
├── utils/                # Pure utility functions
│   ├── git.ts            # Git operations
│   ├── plan-parser.ts    # Plan.md parsing
│   └── branch-tracker.ts # Branch verification
└── types.ts              # TypeScript interfaces
```

### 3. Codex SDK Layer (Execution)

**Responsibility:** Execute tasks in isolated worktrees via Codex threads.

**Allowed:**
- Receive prompts from MCP server (via thread.run())
- Execute task implementation (TDD, quality checks, commits)
- Create branches with git-spice (gs branch create)
- Detach HEAD (git switch --detach)
- Report completion (output branch name)
- Follow embedded skill instructions

**Forbidden:**
- Cross-thread communication (threads are isolated)
- Shared state (each thread has separate worktree)
- MCP server callbacks (async pattern, not callbacks)
- File system access outside worktree

**Key Pattern:** Each thread is an isolated Codex instance with its own working directory. Coordination happens through git branches, not shared memory.

**Thread Spawning:**
```typescript
// MCP server spawns N threads in parallel
const threadPromises = tasks.map(async task => {
  const codex = new Codex({
    workingDirectory: `.worktrees/${runId}-task-${task.id}`
  });
  const thread = codex.startThread();
  const prompt = generateTaskPrompt(task, plan);
  return await thread.run(prompt);
});

// Wait for all to complete
const results = await Promise.all(threadPromises);
```

### 4. Git Worktrees Layer (State)

**Responsibility:** Provide isolated git state for parallel execution.

**Allowed:**
- Multiple worktrees per run ({runid}-main, {runid}-task-N)
- Detached HEAD in task worktrees
- Branch creation per task
- Commit artifacts (code, tests, docs)

**Forbidden:**
- Shared worktrees (each task gets isolated worktree)
- Worktree nesting (all created at same level)
- Stale worktree references (cleanup after stacking)

**Key Pattern:** Worktrees enable true parallelism. Each Codex thread works in its own worktree, creating branches independently. Cleanup happens after all threads complete and branches are stacked.

**Worktree Structure:**
```
.worktrees/
├── abc123-main/              # Main worktree (spec, plan, final stack)
├── abc123-task-1/            # Task 1 worktree (isolated)
├── abc123-task-2/            # Task 2 worktree (isolated)
└── abc123-task-3/            # Task 3 worktree (isolated)

Branches:
- abc123-main                 # Base branch
- abc123-task-1-1-database    # Task branch (stacked on main)
- abc123-task-1-2-service     # Task branch (stacked on task-1-1)
- abc123-task-1-3-api         # Task branch (stacked on task-1-2)
```

### 5. External Systems Layer

**Responsibility:** Provide external tools and services.

**Included:**
- Git commands (git, gs from git-spice)
- Test runners (npm test, bun test, etc.)
- Linters (biome, eslint, etc.)
- Build tools (tsc, bun build, etc.)
- File system (read/write operations)

**Integration:** External systems are called from Codex threads (not MCP server).

## Cross-Cutting Concerns

### Async Job Pattern

**Problem:** MCP tool calls expect synchronous responses, but execution takes hours.

**Solution:**
1. `spectacular_execute` returns immediately with run_id
2. Execution continues in background (async function, not blocking)
3. User polls with `spectacular_status` for updates
4. Job state tracked in-memory (Map<runId, ExecutionJob>)
5. Git branches are source of truth (for resume logic)

**Implementation:**
```typescript
// Tool handler returns immediately
async handleExecute(args) {
  const runId = extractRunId(args.plan_path);
  const job = { runId, status: 'running', ... };
  this.jobs.set(runId, job);

  // Execute in background (non-blocking)
  this.executePhases(plan, job).catch(err => {
    job.status = 'failed';
  });

  // Return immediately
  return { run_id: runId, status: 'started' };
}
```

### Skills as Embedded Prompts

**Problem:** Codex threads don't have access to skill files like spectacular subagents.

**Solution:** Embed skill instructions directly in prompt templates.

**Pattern:**
```typescript
function generateTaskPrompt(task, plan) {
  return `
You are implementing Task ${task.id}: ${task.name}

## Your Process

Follow these steps exactly (from phase-task-verification and test-driven-development skills):

### 1. Navigate to Worktree
cd .worktrees/${plan.runId}-task-${task.id}

### 2. Read Context
- Read spec: specs/${plan.runId}-${plan.featureSlug}/spec.md
- Read constitution: docs/constitutions/current/

### 3. Implement Task (TDD)
Follow test-driven-development skill:
- Write test first
- Watch it fail
- Write minimal code to pass
- Watch it pass

### 4. Create Branch
Use phase-task-verification skill:
gs branch create ${plan.runId}-task-${task.id}-{name} -m "Task ${task.id}"

### 5. Detach HEAD
git switch --detach
`;
}
```

**Key:** Skills referenced by name ("Follow test-driven-development skill") with instructions embedded inline.

### Resume Logic

**Problem:** If execution fails mid-phase, how to resume without re-running completed tasks?

**Solution:** Check git branches before creating worktrees.

**Algorithm:**
```typescript
// Before creating worktrees, check existing branches
const completedTasks = [];
const pendingTasks = [];

for (const task of phase.tasks) {
  const branchPattern = `${runId}-task-${phase.id}-${task.id}-`;
  const branch = findBranch(branchPattern);

  if (branch && branchHasCommits(branch)) {
    completedTasks.push(task);
  } else {
    pendingTasks.push(task);
  }
}

// Only create worktrees for pending tasks
await createWorktrees(pendingTasks, runId);

// Spawn threads only for pending tasks
const results = await spawnParallelTasks(pendingTasks, plan, job);
```

**Key:** Git branches are source of truth. If branch exists with commits, task is complete.

### Code Review Loops

**Problem:** Review rejection → fix → re-review requires conversation context.

**Solution:** Use same Codex thread for review + fix loop.

**Pattern:**
```typescript
const thread = codex.startThread(); // Single thread
let rejectionCount = 0;

while (rejectionCount <= MAX_REJECTIONS) {
  // Review in thread (maintains conversation)
  const reviewResult = await thread.run(reviewPrompt);

  if (approved(reviewResult)) {
    return; // Success
  }

  rejectionCount++;

  // Fix in same thread (conversation context preserved)
  await thread.run(fixerPrompt);
}
```

**Key:** Thread maintains conversation history. Rejection count tracked in MCP server.

## Module Boundaries

### Handlers Module (src/handlers/)

**Responsibility:** Implement MCP tool handlers.

**Allowed:**
- Parse tool arguments
- Validate inputs
- Create/retrieve job state
- Delegate to orchestrators
- Format tool responses

**Forbidden:**
- Direct Codex SDK calls (use orchestrators)
- Complex business logic (keep handlers thin)
- Blocking operations (use async pattern)

### Orchestrator Module (src/orchestrator/)

**Responsibility:** Implement phase execution logic.

**Allowed:**
- Parse plans and identify phases
- Spawn Codex threads via SDK
- Implement Promise.all for parallelism
- Coordinate worktree creation/cleanup
- Manage code review loops
- Handle resume logic

**Forbidden:**
- MCP tool registration (handlers do this)
- Prompt template details (use prompt modules)
- Direct git commands (use utils)

### Prompts Module (src/prompts/)

**Responsibility:** Generate prompts with embedded skill instructions.

**Allowed:**
- Extract task/phase/plan context
- Embed skill instructions inline
- Format acceptance criteria, file lists
- Generate phase boundary warnings
- Create TDD instruction sequences

**Forbidden:**
- Execution logic (orchestrators handle)
- Git operations (utils handle)
- Job state management (MCP server handles)

### Utils Module (src/utils/)

**Responsibility:** Pure utility functions (stateless, no side effects).

**Allowed:**
- Git command execution (create worktrees, stack branches)
- Plan.md parsing (extract phases, tasks, dependencies)
- Branch verification (check existence, commits)
- File path extraction (runId from plan path)

**Forbidden:**
- Job state management (MCP server handles)
- Thread spawning (orchestrators handle)
- Prompt generation (prompts module handles)

## Testing Architecture

Tests follow the same layer boundaries:

```
tests/
├── unit/                 # Pure function tests
│   ├── prompts/         # Prompt generation
│   ├── utils/           # Git, parsing utilities
│   └── types/           # Type validation
├── integration/          # Module interaction tests
│   ├── handlers/        # Tool handler tests (with mocks)
│   ├── orchestrator/    # Phase execution (with mock Codex SDK)
│   └── code-review/     # Review loop tests
└── e2e/                  # Full workflow tests
    ├── spec-to-plan.test.ts
    ├── parallel-execution.test.ts
    └── resume.test.ts
```

**Key:** Integration tests mock Codex SDK. E2E tests use real Codex (or fixture mode).

## Performance Considerations

**Parallelism:**
- Default: No limit on concurrent threads (Promise.all spawns all)
- Future: Configurable thread pool (max N concurrent)

**Memory:**
- Job state in-memory (Map<runId, ExecutionJob>)
- No persistence by default
- Future: SQLite for job history

**Cleanup:**
- Worktrees removed after stacking
- Job state retained until server restart
- Future: TTL for job cleanup

## Error Handling

**Async Job Failures:**
- Caught in background execution
- Job status set to 'failed'
- Error message stored in job.error
- User sees failure on next status poll

**Thread Failures:**
- Individual thread failures tracked in task status
- Other threads continue (Promise.all waits for all)
- Failed tasks marked, successful tasks stacked
- Resume logic re-runs only failed tasks

**MCP Server Crashes:**
- In-memory job state lost
- Git branches preserved (source of truth)
- Resume from git state on restart
- Future: Persist job state to SQLite

## Security Considerations

**Sandboxing:**
- Codex threads execute in worktrees (isolated)
- No access to parent directories
- Working directory enforcement via Codex SDK

**Input Validation:**
- Plan paths validated (must be under specs/)
- Run IDs validated (6-char hex)
- No shell injection (execa with array args)

**Git Operations:**
- All git commands via utils (no raw shell)
- Worktree paths sanitized
- Branch names validated (runId prefix)

## Future Architecture Considerations

**v2 Candidates:**
- Thread pool (limit concurrent Codex instances)
- SQLite persistence (job history, resume across restarts)
- WebSocket updates (real-time status, no polling)
- Multi-project orchestration (workspace support)
- Plugin system (custom prompt templates)

**Remember:** Keep v1 simple. Add complexity only when proven necessary.
