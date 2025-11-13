# spectacular-codex

>[!WARNING]
>This isn't working yet - but will be soon!

MCP server that brings Spectacular's parallel orchestration methodology to Codex CLI.

## Overview

**spectacular-codex** enables spec-anchored development with automatic parallel task execution via the Codex SDK. It's an MCP (Model Context Protocol) server for Codex CLI, NOT a Claude Code plugin.

Key features:

- **Parallel Execution**: Execute independent tasks concurrently using isolated Codex threads
- **Spec-Anchored Development**: Generate specs, decompose into tasks, execute with verification
- **Git-Based State**: Branches as source of truth, no database required
- **Resume from Failure**: Intelligent recovery detects completed work and resumes from failures
- **Code Review Loops**: Automatic review with fixer threads for rejected implementations

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
              │ spawns via Codex SDK
              ▼
┌─────────────────────────────────────────┐
│      Codex SDK Threads (Parallel)       │  ← Execution layer
│  • Task implementation threads          │
│  • Code review thread                   │
│  • Each thread = isolated context       │
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
# Generate feature specification
/spectacular:spec "Add user authentication with JWT tokens"

# Decompose spec into executable plan
/spectacular:plan specs/abc123/spec.md

# Execute plan with parallel orchestration
/spectacular:execute specs/abc123/plan.md

# Check execution status
/spectacular:status abc123
```

See `docs/slash-commands.md` for complete slash command templates.

## MCP Tools

spectacular-codex provides four MCP tools:

### spectacular_spec

Generate feature specification from user request.

**Arguments**:
- `feature_request` (string): Natural language feature description

**Returns**: `{ run_id, status, spec_path }`

### spectacular_plan

Decompose specification into executable task plan.

**Arguments**:
- `spec_path` (string): Path to specification file

**Returns**: `{ run_id, status, plan_path }`

### spectacular_execute

Execute implementation plan with parallel orchestration.

**Arguments**:
- `plan_path` (string): Path to plan.md file

**Returns**: `{ run_id, status }`

### spectacular_status

Check status of running or completed job.

**Arguments**:
- `run_id` (string): Job identifier

**Returns**: `{ run_id, status, phase, completed_tasks, failed_tasks, output }`

## Examples

### Parallel Execution Workflow

See [docs/examples/parallel-execution.md](docs/examples/parallel-execution.md) for a complete workflow from feature request to completion.

### Resume from Failure

See [docs/examples/resume-from-failure.md](docs/examples/resume-from-failure.md) for how the resume logic recovers from failures.

## Key Differences from spectacular (Claude Code Plugin)

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

**Key Insight**: spectacular-codex is NOT a port of spectacular. It's a from-scratch MCP server that adapts spectacular's methodology to Codex SDK constraints.

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

**Current State**: Constitution v1 complete, implementation in progress.

**Implemented**:
- Constitution and architectural documentation
- Project structure and build configuration
- Type definitions and interfaces

**Next Steps**:
- Core utility modules (git operations, plan parsing)
- Prompt template generators
- Orchestration logic (parallel, sequential, code review)
- MCP tool handlers
- Integration and E2E tests

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
