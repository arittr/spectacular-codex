# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**spectacular-codex** is now an execute-only MCP (Model Context Protocol) server for Codex CLI. It reads a Spectacular `plan.md`, bootstraps the upstream skills, and spawns Codex CLI subagents (separate CLI processes) for every task so the plan is implemented automatically.

**Core Architecture:**

- **MCP Server** (Node.js/TypeScript) - Orchestrates sequential/parallel phases, manages job state
- **Codex CLI Subagents** - Each task runs in a brand-new Codex CLI process launched with `--dangerously-bypass-approvals-and-sandbox --yolo`
- **Bootstrapped Skills** - `~/.codex/superpowers/... bootstrap` and `~/.codex/spectacular/... bootstrap` are executed before any work begins
- **Git Worktrees** - `.worktrees/{runId}-main` plus per-task worktrees provide isolation
- **Stdio Transport** - Standard MCP protocol for Codex CLI integration

**Key Differentiators from spectacular (Claude Code plugin):**

1. **MCP Server vs Plugin** - spectacular-codex is a separate Node.js process, not Claude Code plugin
2. **Codex CLI Subagents** - Uses standalone Codex CLI processes rather than Claude subagents or in-process SDK threads
3. **Skills as Prompts** - Skills are bootstrapped locally and referenced directly inside prompts
4. **Async Job Pattern** - Returns immediately; users poll `subagent_status`
5. **Danger Mode** - All subagents run with `--dangerously-bypass-approvals-and-sandbox --yolo` so they can mutate worktrees without manual approvals

## Constitution

**The constitution is the architectural source of truth.** All implementation decisions must align with:

- **docs/constitutions/current/** - Active constitution (symlink to latest version)
  - `meta.md` - Version info and rationale
  - `architecture.md` - 4-layer architecture and module boundaries
  - `patterns.md` - Mandatory coding patterns with examples
  - `tech-stack.md` - Technology decisions and dependencies
  - `schema-rules.md` - State management (git-based, no database)
  - `testing.md` - Test strategy and patterns

**When making architectural decisions:**

1. Read relevant constitution file first
2. Verify decision aligns with documented patterns
3. If pattern doesn't exist, consider if it should be added
4. Never violate mandatory patterns without constitutional amendment

**Constitution versioning:**

- Constitutions are immutable - create new version instead of editing
- Use `docs/constitutions/vN/` for each version
- Update `current/` symlink when activating new version
- Document rationale in new version's `meta.md`

See `../spectacular/skills/versioning-constitutions/SKILL.md` for workflow.

## Architecture Quick Reference

### 4-Layer Architecture

```
┌─────────────────────────────────────────┐
│         Codex CLI (User)                │  ← User interface
│  • Slash commands (/spectacular:*)     │
│  • Status polling                       │
└─────────────┬───────────────────────────┘
              │ MCP tool calls
              ▼
┌─────────────────────────────────────────┐
│        MCP Server (Node.js)             │  ← Orchestration layer
│  • Tool handlers (execute, status)      │
│  • Job state tracking (in-memory)       │
│  • Phase orchestration logic            │
└─────────────┬───────────────────────────┘
              │ spawns Codex CLI workers
              ▼
┌─────────────────────────────────────────┐
│   Codex CLI Subagents (per task)        │  ← Execution layer
│  • Invoked via `codex run ...`          │
│  • Emit `BRANCH:` hints                  │
│  • One CLI process per task             │
└─────────────┬───────────────────────────┘
              │ work happens in git
              ▼
┌─────────────────────────────────────────┐
│     Git Worktrees + Branches            │  ← State layer
│  • .worktrees/{runid}-main/             │
│  • .worktrees/{runid}-task-N/           │
│  • Branches: {runid}-task-*             │
└─────────────────────────────────────────┘
```

**Dependency Rules:** Downward only. Never call upward (e.g., Codex threads can't call MCP server).

### Module Structure

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
│   ├── git.ts            # Git operations (worktrees, branches)
│   ├── plan-parser.ts    # Plan.md parsing
│   └── branch-tracker.ts # Branch verification
└── types.ts              # TypeScript interfaces
```

**Module Boundaries:**

- **Handlers**: Parse tool arguments, delegate to orchestrators, format responses
- **Orchestrators**: Spawn Codex threads, coordinate phases, manage review loops
- **Prompts**: Generate prompts with embedded skill instructions
- **Utils**: Pure functions (stateless, no side effects)

## Development Commands

### Setup

- **install**: `pnpm install` (or `npm install`)
- **postinstall**: N/A (no codegen needed for MCP server itself)

### Quality Checks

- **test**: `pnpm test` - Run all tests (unit + integration + E2E)
- **test:watch**: `pnpm test:watch` - Watch mode for TDD
- **lint**: `pnpm lint` - Type check + Biome formatting/linting
- **build**: `pnpm build` - Compile TypeScript to dist/
- **dev**: `pnpm dev` - Watch mode for development

### Running Locally

**Start MCP server in stdio mode:**

```bash
# From project root
pnpm build && node dist/index.js
```

**Configure Codex CLI to use local server:**

```bash
# ~/.codex/mcp-servers.json
{
  "spectacular-codex": {
    "command": "node",
    "args": ["/absolute/path/to/spectacular-codex/dist/index.js"],
    "env": {}
  }
}
```

**Test via Codex CLI:**

```bash
# Start Codex CLI session
codex

# In Codex, use MCP tools:
"Use the spectacular_execute tool with plan_path: specs/abc123/plan.md"
"Use the spectacular_status tool with run_id: abc123"
```

## Technology Stack

### Core Dependencies

- **@openai/codex** - Codex SDK for spawning threads (NOT YET ADDED - pending implementation)
- **@modelcontextprotocol/sdk** - MCP server implementation (NOT YET ADDED - pending implementation)
- **execa** - Safe shell command execution (NOT YET ADDED - pending implementation)

**Note:** Current package.json has boilerplate dependencies. Real dependencies will be added during implementation.

### Development Dependencies

- **TypeScript 5.7+** - Strict mode enabled
- **Node.js 20+** - ESM support
- **vitest** - Test framework
- **tsup** - TypeScript bundler
- **@biomejs/biome** - Fast linter/formatter
- **@arittr/commitment** - Pre-commit hooks

### TypeScript Configuration

**Strict mode is mandatory:**

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

**Key:** All strict flags enabled. Fix code to satisfy TypeScript, not vice versa.

## Key Technical Patterns

### 1. Async Job Pattern

**MCP tool handlers return immediately, execution continues in background.**

```typescript
// ✅ CORRECT: Return immediately, execute in background
async handleExecute(args: any) {
  const job: ExecutionJob = { runId, status: 'running', ... };
  this.jobs.set(runId, job);

  // Execute in background (non-blocking)
  this.executePhases(plan, job).catch(err => {
    job.status = 'failed';
  });

  // Return immediately
  return { run_id: runId, status: 'started' };
}

// ❌ WRONG: Blocking operation
async handleExecute(args: any) {
  await this.executePhases(plan); // Blocks for hours
  return { status: 'completed' };
}
```

**Why:** MCP tool calls expect synchronous responses, but execution takes hours. Async job pattern solves this.

### 2. Parallel Execution with Promise.all()

**Spawn multiple Codex threads concurrently for true parallelism.**

```typescript
// ✅ CORRECT: Parallel execution
const threadPromises = tasks.map(async (task) => {
  const codex = new Codex({
    workingDirectory: `.worktrees/${runId}-task-${task.id}`
  });
  const thread = codex.startThread();
  return await thread.run(prompt);
});

const results = await Promise.all(threadPromises);

// ❌ WRONG: Sequential execution
for (const task of tasks) {
  const codex = new Codex({ workingDirectory: `...` });
  await codex.startThread().run(prompt); // One at a time
}
```

**Why:** Promise.all() enables true parallelism. Sequential execution defeats the purpose of spectacular-codex.

### 3. Skills as Embedded Prompts

**Codex threads don't read skill files. Embed instructions directly in prompts.**

```typescript
// ✅ CORRECT: Embedded skill instructions
function generateTaskPrompt(task, plan) {
  return `
You are implementing Task ${task.id}: ${task.name}

## Your Process (from phase-task-verification and test-driven-development skills)

### 1. Navigate to Worktree
cd .worktrees/${plan.runId}-task-${task.id}

### 2. Implement Task (TDD)
Follow test-driven-development skill:
- Write test first
- Watch it fail
- Write minimal code to pass
- Watch it pass

### 3. Create Branch
gs branch create ${plan.runId}-task-${task.id}-{name} -m "Task ${task.id}"

### 4. Detach HEAD
git switch --detach
`;
}

// ❌ WRONG: Referencing skill files
function generateTaskPrompt(task, plan) {
  return `Follow the test-driven-development skill at skills/test-driven-development/SKILL.md`;
  // Codex threads can't read skill files!
}
```

**Why:** Codex threads don't have access to skill files like Claude Code subagents. Must embed instructions inline.

### 4. Git-Based State

**Git branches are source of truth for task completion, not database.**

```typescript
// ✅ CORRECT: Check git branches
async function isTaskComplete(task: Task, runId: string): Promise<boolean> {
  const branchPattern = `${runId}-task-${task.id}-`;
  const branch = await findBranch(branchPattern);
  return branch && await branchHasCommits(branch);
}

// ❌ WRONG: Database state
async function isTaskComplete(task: Task): Promise<boolean> {
  const row = await db.get('SELECT status FROM tasks WHERE id = ?', task.id);
  return row.status === 'completed';
}
```

**Why:** Git branches are permanent, verifiable, and resumable. No database needed.

### 5. Pure Utility Functions

**Utils are stateless and have no side effects beyond shell commands.**

```typescript
// ✅ CORRECT: Pure function
export async function createWorktree(path: string, branch: string): Promise<void> {
  await execa('git', ['worktree', 'add', path, branch]);
}

// ❌ WRONG: Side effects in utils
export async function createWorktree(path: string, branch: string): Promise<void> {
  await execa('git', ['worktree', 'add', path, branch]);
  jobState.worktrees.push(path); // Side effect!
  logToFile(`Created worktree at ${path}`); // Side effect!
}
```

**Why:** Pure functions are testable, predictable, and composable.

## Testing Approach

### Test Layers

1. **Unit Tests** (`tests/unit/`) - Pure functions (prompts, parsing, validation)
2. **Integration Tests** (`tests/integration/`) - Orchestration with mocked Codex SDK
3. **E2E Tests** (`tests/e2e/`) - Full workflows with fixtures or real Codex
4. **Git Operations** (`tests/integration/utils/`) - Real git commands in temp repos

**Example test:**

```typescript
// tests/integration/orchestrator/parallel-phase.test.ts
import { vi } from 'vitest';
import { executeParallelPhase } from '@/orchestrator/parallel-phase';

const mockThread = {
  run: vi.fn().mockResolvedValue({ output: 'abc123-task-1-2-schema' })
};

vi.mock('@openai/codex', () => ({
  Codex: vi.fn().mockImplementation(() => ({
    startThread: vi.fn().mockReturnValue(mockThread)
  }))
}));

describe('executeParallelPhase', () => {
  it('spawns threads in parallel with Promise.all', async () => {
    await executeParallelPhase(phase, plan, job);

    expect(Codex).toHaveBeenCalledTimes(2); // 2 tasks
    expect(mockThread.run).toHaveBeenCalledTimes(2);
  });
});
```

**Key:** Mock Codex SDK for integration tests, use fixtures for fast E2E tests, real Codex for pre-release validation.

See `docs/constitutions/current/testing.md` for complete strategy.

## Common Workflows

### Adding a New MCP Tool

1. Create handler in `src/handlers/{tool-name}.ts`
2. Define TypeScript interfaces in `src/types.ts`
3. Register tool in `src/index.ts` with MCP server
4. Write integration tests in `tests/integration/handlers/`
5. Update documentation in README.md

### Adding a New Prompt Template

1. Create template generator in `src/prompts/{template-name}.ts`
2. Embed skill instructions inline (reference skill names but include full steps)
3. Write unit tests for prompt generation
4. Use template in orchestrator modules

### Implementing New Phase Orchestration

1. Create orchestrator in `src/orchestrator/{phase-type}.ts`
2. Follow async job pattern (non-blocking execution)
3. Use Promise.all() for parallel operations
4. Delegate git operations to utils
5. Write integration tests with mocked Codex SDK

### Updating Constitution

**When architectural patterns change:**

1. Read `../spectacular/skills/versioning-constitutions/SKILL.md`
2. Create `docs/constitutions/v{N+1}/` directory
3. Copy current constitution files, modify as needed
4. Update `docs/constitutions/current` symlink
5. Document rationale in new version's `meta.md`

**Remember:** Constitutions are immutable. Create new version instead of editing.

## Integration with Codex CLI

### Slash Commands

Users interact via slash commands in `~/.codex/prompts/`:

```markdown
# ~/.codex/prompts/spectacular-execute.md
---
description: Execute implementation plan with parallel orchestration
---

Call the spectacular_execute MCP tool:

```json
{
  "tool": "spectacular_execute",
  "plan_path": "$1"
}
```

Poll for status:

```json
{
  "tool": "spectacular_status",
  "run_id": "{returned_run_id}"
}
```
```

**Key:** Slash commands are NOT part of this repository. They're user-facing prompts that call MCP tools.

### MCP Server Configuration

**User's ~/.codex/mcp-servers.json:**

```json
{
  "spectacular-codex": {
    "command": "npx",
    "args": ["spectacular-codex"],
    "env": {}
  }
}
```

**Or local development:**

```json
{
  "spectacular-codex": {
    "command": "node",
    "args": ["/absolute/path/to/spectacular-codex/dist/index.js"],
    "env": {}
  }
}
```

## Anti-Patterns to Avoid

### ❌ Don't Block in Tool Handlers

**Wrong:**
```typescript
async handleExecute(args: any) {
  await executeAllPhases(plan); // Blocks for hours
  return { status: 'completed' };
}
```

**Why:** MCP tool calls must return quickly. Use async job pattern instead.

### ❌ Don't Share State Between Threads

**Wrong:**
```typescript
const sharedState = { completedTasks: [] };

tasks.map(async (task) => {
  // ...execute task...
  sharedState.completedTasks.push(task.id); // Race condition!
});
```

**Why:** Threads are isolated. Use git branches for coordination, not shared memory.

### ❌ Don't Reference Skill Files in Prompts

**Wrong:**
```typescript
const prompt = `Follow the skill at skills/test-driven-development/SKILL.md`;
```

**Why:** Codex threads can't read skill files. Embed instructions inline.

### ❌ Don't Add Database Without Proven Need

**Wrong:**
```typescript
import Database from 'better-sqlite3';
const db = new Database('spectacular.db');
```

**Why:** Git branches are state. Database adds complexity without benefit. See `schema-rules.md`.

### ❌ Don't Mock Everything in Tests

**Wrong:**
```typescript
vi.mock('fs/promises');
vi.mock('execa');
vi.mock('@openai/codex');
vi.mock('../utils/git.js');
// Tests verify nothing
```

**Why:** Over-mocking tests implementation, not integration. Mock external deps only (Codex SDK).

## Key Differences from spectacular Plugin

**For contributors familiar with spectacular (Claude Code plugin):**

| Aspect | spectacular (Plugin) | spectacular-codex (MCP) |
|--------|---------------------|-------------------------|
| **Runtime** | Claude Code CLI | Codex CLI |
| **Architecture** | Plugin with skills | MCP server with stdio |
| **Execution** | Subagents via Task tool | Codex threads via SDK |
| **Skills** | Separate .md files | Embedded in prompts |
| **Communication** | Subagent messages | Git branches + job state |
| **User Interface** | Slash commands in Claude Code | Slash commands in Codex |
| **State** | Git branches | Git branches (same) |
| **Parallelism** | Subagent dispatch | Promise.all() threads |
| **Review Loops** | Subagent conversation | Thread conversation |

**Key Insight:** spectacular-codex is NOT a port of spectacular. It's a from-scratch MCP server that adapts spectacular's methodology to Codex SDK constraints.

## Project Status

**Current State:** Constitution v1 complete, implementation pending.

**Next Steps (See docs/codex-mcp-planning.md for full plan):**

1. Project setup (update package.json, add dependencies)
2. Implement MCP server core (index.ts, tool registration)
3. Create utility modules (git operations, plan parsing)
4. Build prompt templates (task-executor, code-reviewer, fixer)
5. Implement orchestrators (parallel-phase, sequential-phase, code-review)
6. Write handlers (execute, status, spec, plan)
7. Create slash command templates for users
8. Write tests (unit → integration → E2E)
9. Documentation and examples

**Implementation Philosophy:**

- Start with smallest working system (execute single task)
- Add features incrementally (parallel → review loops → multi-phase)
- Test at appropriate layers (unit for utils, integration for orchestration)
- Keep constitution aligned with implementation

## Related Projects

- **spectacular** - Claude Code plugin (../spectacular/)
- **commitment** - CLI framework reference (../commitment/)
- **superpowers** - Core skills library (github.com/obra/superpowers)

## References

- Constitution: `docs/constitutions/current/`
- MCP Planning: `docs/codex-mcp-planning.md`
- spectacular CLAUDE.md: `../spectacular/CLAUDE.md`
- MCP Protocol: https://modelcontextprotocol.io/
- Codex SDK: https://github.com/openai/codex/tree/main/sdk/typescript
