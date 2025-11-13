---
runId: 98ae37
feature: spectacular-codex-mcp-server
created: 2025-01-13
status: draft
---

# Feature: Spectacular-Codex MCP Server

**Status**: Draft
**Created**: 2025-01-13

## Problem Statement

**Current State:**

Spectacular's parallel orchestration methodology exists only as a Claude Code plugin (`../spectacular`). Users working in Codex CLI cannot access spec-anchored development workflows with parallel task execution. The spectacular plugin uses Claude Code-specific patterns (subagents via Task tool, skills as markdown files) that don't translate to Codex SDK.

**Desired State:**

Spectacular workflows available natively in Codex CLI via MCP server. Users invoke `/spectacular:spec`, `/spectacular:plan`, `/spectacular:execute` slash commands and get parallel orchestration with code review loops. All work happens via Codex threads in isolated worktrees.

**Gap:**

No MCP server implementation bridges Spectacular methodology to Codex SDK. Need to adapt:
- Subagents → Codex threads
- Skills (markdown) → Embedded prompts
- TodoWrite → Structured output
- Claude Code orchestration → TypeScript orchestration with async job pattern

## Requirements

> **Note**: All features must follow @docs/constitutions/current/

### Functional Requirements

**FR1: MCP Tool Registration**
- Expose four MCP tools: `spectacular_spec`, `spectacular_plan`, `spectacular_execute`, `spectacular_status`
- stdio transport for Codex CLI integration
- JSON-RPC 2.0 request/response handling

**FR2: Spec Generation**
- Generate feature specifications via brainstorming (3 phases: understanding, exploration, design)
- Create `specs/{runId}-{feature-slug}/spec.md` with problem statement, requirements, architecture
- Reference constitutions (not duplicate)
- Detect project config from AGENTS.md (install/postinstall/quality checks)

**FR3: Plan Decomposition**
- Parse spec.md and generate execution plan
- Extract tasks with dependencies, acceptance criteria, file lists
- Analyze for sequential vs parallel phases
- Output `specs/{runId}-{feature-slug}/plan.md`

**FR4: Parallel Execution**
- Parse plan.md, identify parallel phases
- Create isolated worktrees (`.worktrees/{runId}-task-N/`)
- Spawn N Codex threads via `Promise.all()` (one per task)
- Each thread: implements task, runs quality checks, creates branch, detaches HEAD
- Stack branches after all tasks complete
- Clean up worktrees

**FR5: Sequential Execution**
- Execute tasks one-by-one in main worktree
- Natural git-spice stacking (each task builds on previous)
- Quality checks per task
- Branch per task

**FR6: Code Review Loops**
- Spawn single Codex thread for review
- Review → fix → re-review in same thread (preserves conversation context)
- Binary verdict parsing (approved/rejected)
- Max 3 rejections before escalation
- Review frequency: per-phase, optimize (risk analysis), end-only, skip

**FR7: Resume Logic**
- Check git branches for existing work before execution
- Skip tasks with branches that have commits
- Only spawn threads for pending tasks
- Git branches = source of truth (not in-memory state)

**FR8: Quality Check Detection**
- Read AGENTS.md for project-specific commands (test/lint/build)
- Fall back to package.json scripts
- Detect git hooks (lefthook, husky)
- Embed detected checks in task prompts
- Warn (not error) if no checks found

**FR9: Stacking Abstraction**
- Pluggable backend interface for git-spice/graphite/jj
- v1: git-spice implementation only
- Backend detection via env var or auto-detect
- Clear error if backend unavailable

**FR10: Async Job Pattern**
- `spectacular_execute` returns immediately with `run_id`
- Execution continues in background (non-blocking)
- User polls `spectacular_status` for updates
- In-memory job tracker (Map<runId, ExecutionJob>)
- Git branches persist across server restarts

### Non-Functional Requirements

**NFR1: Architectural Compliance**
- 4-layer architecture: CLI → MCP → Codex Threads → Git
- Downward dependencies only (no upward calls)
- Per @docs/constitutions/current/architecture.md

**NFR2: Pattern Compliance**
- Async job pattern (return immediately, background execution)
- Pure utility functions (stateless, no side effects except IO)
- Skills embedded in prompts (not external files)
- Promise.all() for parallelism
- Git-based state (branches = truth)
- Per @docs/constitutions/current/patterns.md

**NFR3: TypeScript Strict Mode**
- All strict flags enabled
- No `any` without justification
- Union types for status enums
- Per @docs/constitutions/current/tech-stack.md

**NFR4: Error Handling**
- Catch errors at layer boundaries with context
- Individual task failures tracked (Promise.all doesn't stop on first)
- Resume from failures via git branches
- Quality check failures trigger iteration within threads (not task failure)

**NFR5: Distribution**
- Publish to npm as `spectacular-codex`
- Users run via `npx spectacular-codex` or global install
- MCP config points to npm package
- No Node.js version assumed (support 18+)

## Architecture

> **Layer boundaries**: @docs/constitutions/current/architecture.md
> **Required patterns**: @docs/constitutions/current/patterns.md

### Modular Orchestration Architecture

**Approach**: Separate orchestrator modules per phase type, functional prompt templates, pure utility functions, in-memory job tracking.

Follows constitutional principle of "selective abstraction" - abstract where variation exists (orchestration strategies, stacking backends) but keep core operations direct.

### Components

**New Files:**

**MCP Server Core:**
- `src/index.ts` - MCP server entry point, tool registration, async job pattern
- `src/types.ts` - TypeScript interfaces (ExecutionJob, Task, Phase, Plan, CodexThreadResult, StackingBackend)

**Handlers (Thin):**
- `src/handlers/execute.ts` - Parse args, create job, delegate to orchestrators, return run_id
- `src/handlers/status.ts` - Retrieve job from Map, format status response
- `src/handlers/spec.ts` - Delegate to spec generator orchestrator
- `src/handlers/plan.ts` - Delegate to plan generator orchestrator

**Orchestrators (Phase Execution):**
- `src/orchestrator/parallel-phase.ts` - Create worktrees, spawn N threads via Promise.all(), stack branches, cleanup
- `src/orchestrator/sequential-phase.ts` - Execute tasks one-by-one in main worktree
- `src/orchestrator/code-review.ts` - Review → fix loop in single thread, rejection tracking

**Prompts (Template Generators):**
- `src/prompts/task-executor.ts` - Embed TDD skill, phase boundaries, quality checks, git operations
- `src/prompts/code-reviewer.ts` - Embed review checklist, binary verdict format
- `src/prompts/fixer.ts` - Embed fix strategy, scope creep detection
- `src/prompts/spec-generator.ts` - Embed brainstorming phases (understanding, exploration, design)
- `src/prompts/plan-generator.ts` - Embed task decomposition, dependency analysis

**Utils (Pure Functions):**
- `src/utils/git.ts` - createWorktree(), cleanupWorktree(), findBranch(), branchHasCommits()
- `src/utils/stacking/types.ts` - StackingBackend interface
- `src/utils/stacking/git-spice.ts` - Git-spice implementation (v1 only)
- `src/utils/stacking/index.ts` - Backend factory (getStackingBackend())
- `src/utils/plan-parser.ts` - Parse plan.md, extract runId/phases/tasks
- `src/utils/branch-tracker.ts` - Check branch existence, verify commits
- `src/utils/project-config.ts` - Detect AGENTS.md commands, package.json scripts, git hooks

**Configuration:**
- `tsconfig.json` - Strict mode enabled, ESM target
- `package.json` - Dependencies: @openai/codex, @modelcontextprotocol/sdk, execa
- `.github/workflows/` - CI/CD for npm package publishing

**Modified Files:**
- None (new standalone project)

### Dependencies

**New packages:**
- `@openai/codex` - Codex SDK for spawning threads
  - See: https://github.com/openai/codex/tree/main/sdk/typescript
- `@modelcontextprotocol/sdk` - MCP server implementation
  - See: https://modelcontextprotocol.io/
- `execa` - Safe shell command execution
  - See: https://github.com/sindresorhus/execa

**Development:**
- `typescript` - Compiler (strict mode)
- `vitest` - Test framework
- `tsup` - TypeScript bundler
- `@biomejs/biome` - Linter/formatter

**External Tools (User Installs):**
- `git-spice` - Stacked branch management
  - See: https://github.com/abhinav/git-spice

**Schema changes:**
- None - per @docs/constitutions/current/schema-rules.md, git branches are the database

### Integration Points

**Codex CLI:**
- Users invoke via slash commands (`/spectacular:spec`, `/spectacular:execute`)
- MCP config: `~/.codex/mcp-servers.json` points to npm package

**Git/Git-spice:**
- All worktree operations via `execa('git', [...])`
- Stacking via `getStackingBackend()` abstraction
- Branch patterns: `{runId}-task-{phase}-{id}-{name}`

**Project Detection:**
- AGENTS.md convention for install/quality check commands
- Falls back to package.json scripts
- Detects git hooks (lefthook.yml, .husky/)

**No Direct Integration:**
- No database (git is state)
- No web server (stdio transport)
- No external APIs (besides Codex SDK)

## Acceptance Criteria

**Constitution compliance:**
- [ ] 4-layer architecture followed (@docs/constitutions/current/architecture.md)
- [ ] Async job pattern implemented (@docs/constitutions/current/patterns.md)
- [ ] Pure utility functions (no state) (@docs/constitutions/current/patterns.md)
- [ ] TypeScript strict mode enabled (@docs/constitutions/current/tech-stack.md)
- [ ] Git-based state (no database) (@docs/constitutions/current/schema-rules.md)

**Feature-specific:**
- [ ] MCP tools exposed: spec, plan, execute, status
- [ ] Parallel execution spawns N threads via Promise.all()
- [ ] Code review loops preserve thread context (single thread)
- [ ] Resume logic skips completed tasks (checks git branches)
- [ ] Quality checks detected from AGENTS.md or package.json
- [ ] Stacking backend abstraction (git-spice in v1)
- [ ] Prompt templates embed skill instructions inline

**Verification:**
- [ ] Can execute 3-task parallel phase end-to-end
- [ ] Code review rejection → fix → re-review works
- [ ] Resume after failure skips completed tasks
- [ ] Quality checks run and iterate on failure within threads
- [ ] npm package installs and runs via npx
- [ ] MCP config works with Codex CLI

## Open Questions

None - design validated through brainstorming phases.

## Implementation Phases

**Phase 1: Foundation** - MCP server, tool registration, job tracking, project config detection
**Phase 2: Parallel Execution** - Orchestrator, git utils, stacking abstraction, task prompts (MVP milestone)
**Phase 3: Code Review** - Review orchestrator, review/fixer prompts, verdict parsing
**Phase 4: Sequential & Spec/Plan** - Sequential orchestrator, spec/plan generators
**Phase 5: Polish & Documentation** - Resume logic, error handling, slash commands, user docs

Testing deferred to separate implementation run (per user preference: implement then test).

## References

- Architecture: @docs/constitutions/current/architecture.md
- Patterns: @docs/constitutions/current/patterns.md
- Schema Rules: @docs/constitutions/current/schema-rules.md
- Tech Stack: @docs/constitutions/current/tech-stack.md
- Testing: @docs/constitutions/current/testing.md
- Planning Doc: @../spectacular/docs/codex-mcp-planning.md
- Codex SDK: https://github.com/openai/codex/tree/main/sdk/typescript
- MCP Protocol: https://modelcontextprotocol.io/
- Git-spice: https://github.com/abhinav/git-spice
