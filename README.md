# spectacular-codex

> [!NOTE]
> **Execute-only MCP Server**: spectacular-codex implements the execute phase of Spectacular's methodology for Codex CLI. Spec generation and planning happen elsewhere (e.g., in the main Spectacular plugin or Codex CLI directly).

MCP server that brings Spectacular's parallel orchestration methodology to Codex CLI.

## Overview

**spectacular-codex** focuses solely on the **execute** phase: it reads a `plan.md`, bootstraps the upstream Spectacular/Superpowers skills, and spawns Codex CLI subagents (one per task) to implement the plan automatically.

Key features:

- **Codex CLI Subagents**: Each task runs in its own Codex CLI process with `--dangerously-bypass-approvals-and-sandbox --yolo`
- **Spec-Anchored Context**: You can either point to an on-disk `plan.md` or pass an inline plan object; each task prompt is generated from that structured plan so subagents stay grounded in the spec
- **Phase Strategies**: Parallel and sequential phases map directly to concurrent vs serial Codex CLI executions
- **Git-Based State**: Each task writes through an isolated worktree; completion is tracked via branches just like the original Spectacular workflow
- **Status Tracking**: `subagent_status` reports real-time task state so users can monitor progress or resume after failures

## Architecture

spectacular-codex follows a 4-layer architecture:

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
│  • Runs `codex run --dangerously-bypass-approvals-and-sandbox --yolo`
│  • One process per task                 │
│  • Outputs branch hint (`BRANCH:`)      │
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

**Dependency Rules**: Downward only. Codex threads never call back to MCP server.

See `docs/constitutions/current/architecture.md` for detailed architecture documentation.

## Installation

### From npm (When Published)

```bash
npm install -g spectacular-codex
```

### From Source (Development)

```bash
git clone https://github.com/drewritter/spectacular-codex.git
cd spectacular-codex
pnpm install
pnpm build
```

### Configuration

Add to your `~/.codex/mcp-servers.json`:

```json
{
  "spectacular-codex": {
    "command": "npx",
    "args": ["spectacular-codex"],
    "env": {}
  }
}
```

For local development, use absolute path:

```json
{
  "spectacular-codex": {
    "command": "node",
    "args": ["/absolute/path/to/spectacular-codex/dist/index.js"],
    "env": {}
  }
}
```

## Quick Start

Use slash commands in Codex CLI:

```bash
# Execute plan and spawn Codex subagents
/spectacular:execute specs/abc123/plan.md

# Check execution status
/subagent:status abc123

# Or call spectacular_execute with an inline plan payload
spectacular_execute <<'JSON'
{
  "plan": {
    "runId": "abc123",
    "featureSlug": "feature-slug",
    "phases": [
      {
        "id": 1,
        "name": "Foundation",
        "strategy": "sequential",
        "tasks": [
          {
            "id": "1-1",
            "name": "Boot project",
            "description": "Set up scaffolding",
            "files": ["src/index.ts"],
            "acceptanceCriteria": ["Project boots", "Tests pass"]
          }
        ]
      }
    ]
  }
}
JSON
```

See `docs/slash-commands.md` for slash command templates pointing to the new subagent tools.

## MCP Tools

spectacular-codex exposes 3 MCP tools:

### spectacular_execute

Execute an implementation plan by running Codex CLI subagents per task.

**Arguments** (provide either `plan_path` or `plan`):
- `plan_path` (string): Path to the plan.md file under `specs/`
- `plan` (object): Inline plan payload with `{ runId, featureSlug?, phases: [{ id, name, strategy, tasks: [...] }] }`
- `base_branch` (string, optional): Base branch for `.worktrees/{runId}-main` (defaults to `main`)
- `tasks` (array, optional): Filter + override set. Each entry: `{ id, branch?, worktree_path? }`

**Returns**: `{ run_id, status: 'started' }`

See [Plan Schema](docs/plan-schema.md) for the full JSON structure when providing `plan`.

### subagent_execute

Alias for `spectacular_execute`. Provides the same functionality with identical arguments and return values.

### subagent_status

Poll status for a running/completed subagent job.

**Arguments**:
- `run_id` (string, required): Identifier returned from spectacular_execute/subagent_execute

**Returns**: `{ run_id, status, phase, tasks[], started_at, completed_at?, error? }`

## Examples

### Parallel Execution Workflow

See [docs/examples/parallel-execution.md](docs/examples/parallel-execution.md) for a complete workflow from feature request to completion.

### Resume from Failure

See [docs/examples/resume-from-failure.md](docs/examples/resume-from-failure.md) for how the resume logic recovers from failures.

## Key Differences from spectacular (Claude Code Plugin)

| Aspect | spectacular (Plugin) | spectacular-codex (MCP) |
|--------|---------------------|-------------------------|
| **Runtime** | Claude Code CLI | Codex CLI |
| **Architecture** | Plugin with skills | MCP server (execute-only) |
| **Execution** | Built-in subagents | External Codex CLI subagents |
| **Skills** | Markdown skill files | Bootstrapped commands + embedded prompts |
| **Communication** | Subagent chat | Git branches + `subagent_status` |
| **User Interface** | Slash commands in Claude Code | Slash commands in Codex |
| **State** | Git branches | Git branches (same) |
| **Parallelism** | Tool-level fan-out | Codex CLI processes per task |

**Key Insight**: spectacular-codex is now dedicated to the execute phase. Spec generation & planning live elsewhere; this repo ensures those plans are carried out automatically via Codex CLI subagents.

## Development

### Prerequisites

- Node.js 20+
- pnpm (or npm)
- Git with git-spice (for stacked branches)

### Setup

```bash
pnpm install
pnpm build
```

### Commands

- `pnpm test` - Run all tests (unit + integration + E2E)
- `pnpm test:watch` - Watch mode for TDD
- `pnpm lint` - Type check + Biome formatting/linting
- `pnpm build` - Compile TypeScript to dist/
- `pnpm dev` - Watch mode for development

### Running Locally

```bash
# Build and start MCP server
pnpm build && node dist/index.js

# In another terminal, start Codex CLI
codex

# In Codex, use MCP tools:
"Use the spectacular_execute tool with plan_path: specs/abc123/plan.md"
```

### Development Guidelines

See `CLAUDE.md` for comprehensive development guidelines, including:

- Constitution (architectural source of truth)
- Module structure and boundaries
- Key technical patterns (async job, parallel execution, skills as prompts)
- Testing approach (unit, integration, E2E)
- Anti-patterns to avoid

## Project Status

**Current State**: Core implementation complete, execute-only MCP server functional.

**Implemented**:
- ✅ Constitution v1 and architectural documentation
- ✅ MCP server with 3 tools (spectacular_execute, subagent_execute, subagent_status)
- ✅ Utility modules (git operations, plan parsing, branch tracking)
- ✅ Prompt template generators (task executor, code reviewer, fixer)
- ✅ Orchestration logic (parallel/sequential phases, code review loops)
- ✅ Async job pattern with background execution
- ✅ Git worktree isolation for parallel tasks
- ✅ Resume logic (detects existing branches, only runs pending tasks)
- ✅ Unit and integration tests

**Known Limitations**:
- Requires Codex SDK (must be installed separately)
- Some integration tests require actual Codex CLI environment
- Sequential phase tests need real git worktrees (skipped in CI)
- Timing-sensitive tests use arbitrary waits (proper event mechanism needed)

**Future Enhancements**:
- Event-driven status updates (replace polling with SSE or WebSockets)
- Better error recovery and retry mechanisms
- Performance optimization for large plans (100+ tasks)
- Metrics and observability (task duration, success rates)

## Related Projects

- [spectacular](https://github.com/drewritter/spectacular) - Claude Code plugin version
- [commitment](https://github.com/arittr/commitment) - CLI framework reference
- [superpowers](https://github.com/obra/superpowers) - Core skills library

## Contributing

Contributions are welcome! Please read:

1. `CLAUDE.md` - Development guidelines and constitution
2. `docs/constitutions/current/` - Architectural patterns and rules
3. Existing code for style and patterns

## License

MIT

## References

- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [Codex SDK Documentation](https://github.com/openai/codex/tree/main/sdk/typescript)
- [spectacular Methodology](https://github.com/drewritter/spectacular)
