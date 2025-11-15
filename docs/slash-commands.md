# Spectacular Slash Commands

This document provides slash command templates for using spectacular-codex with Codex CLI. Copy these templates to `~/.codex/prompts/` in your Codex CLI installation.

## Overview

spectacular-codex is an **execute-only** MCP server. Spec generation and planning happen elsewhere (e.g., in the main Spectacular plugin or directly in Codex CLI).

The MCP server provides two slash commands:

- `/spectacular:execute` (or `/subagent:execute`) - Execute a plan with parallel orchestration
- `/subagent:status` - Check job status

## Installation

Create the following files in `~/.codex/prompts/`:

```bash
mkdir -p ~/.codex/prompts
cd ~/.codex/prompts
```

Copy each template below into a separate file.

## /spectacular:execute

**File**: `~/.codex/prompts/spectacular-execute.md`

```markdown
---
description: Execute implementation plan with parallel orchestration
---

Use the spectacular_execute MCP tool to execute an implementation plan with automatic parallel task execution and code review loops.

Call the tool with the plan path:

\`\`\`json
{
  "tool": "spectacular_execute",
  "plan_path": "$1"
}
\`\`\`

Or with an inline plan object:

\`\`\`json
{
  "tool": "spectacular_execute",
  "plan": {
    "runId": "abc123",
    "featureSlug": "feature-name",
    "phases": [
      {
        "id": 1,
        "name": "Foundation",
        "strategy": "sequential",
        "tasks": [
          {
            "id": "1-1",
            "name": "Setup project",
            "description": "Initialize project structure",
            "files": ["src/index.ts"],
            "acceptanceCriteria": ["Project boots", "Tests pass"]
          }
        ]
      }
    ]
  }
}
\`\`\`

The tool will return a run_id. Poll for status using /subagent:status.

Poll every 30-60 seconds to check progress. Execution may take several hours depending on the plan size.
```

**Usage**:

```bash
# Execute from plan.md file
/spectacular:execute specs/abc123/plan.md

# Execute with inline plan object
/spectacular:execute
# (then paste plan JSON)
```

**What it does**:

1. Creates git worktrees for isolation (`.worktrees/{run_id}-main/`, `.worktrees/{run_id}-task-N/`)
2. Executes phases sequentially, tasks within phases in parallel
3. For each task:
   - Spawns isolated Codex CLI process in dedicated worktree
   - Implements task following TDD pattern
   - Creates branch `{run_id}-task-{id}-{name}`
   - Detaches HEAD for safety
4. After each phase (if code review enabled):
   - Spawns code review thread
   - Reviews all task implementations
   - Spawns fixer threads for rejected tasks
   - Repeats until all tasks approved
5. Stacks branches linearly using git-spice
6. Cleans up worktrees on completion
7. Returns immediately, executes in background

## /subagent:execute

**File**: `~/.codex/prompts/subagent-execute.md`

Alias for `/spectacular:execute`. Provides identical functionality.

```markdown
---
description: Execute implementation plan (alias for spectacular:execute)
---

Use the subagent_execute MCP tool to execute an implementation plan.

This is an alias for spectacular_execute with identical functionality.

Call the tool with the plan path:

\`\`\`json
{
  "tool": "subagent_execute",
  "plan_path": "$1"
}
\`\`\`

See /spectacular:execute documentation for full details.
```

## /subagent:status

**File**: `~/.codex/prompts/subagent-status.md`

```markdown
---
description: Check status of running or completed subagent job
---

Use the subagent_status MCP tool to check the status of a running or completed job.

Call the tool with the run_id:

\`\`\`json
{
  "tool": "subagent_status",
  "run_id": "$1"
}
\`\`\`

The response includes:
- Current status (running, completed, failed)
- Current phase being executed
- Completed tasks
- Failed tasks (if any)
- Error details (if failed)
```

**Usage**:

```bash
/subagent:status abc123
```

**What it returns**:

```json
{
  "run_id": "abc123",
  "status": "running",
  "phase": 2,
  "tasks": [
    {
      "id": "1-1",
      "name": "setup-project",
      "status": "completed",
      "branch": "abc123-task-1-1-setup-project"
    },
    {
      "id": "2-1",
      "name": "implement-auth",
      "status": "running",
      "branch": "abc123-task-2-1-implement-auth"
    }
  ],
  "started_at": "2025-01-14T10:30:00Z",
  "completed_at": null,
  "error": null
}
```

## Complete Workflow Example

Here's a typical workflow using spectacular-codex:

```bash
# Prerequisite: Create plan.md using Spectacular plugin or manually
# Example structure:
# specs/abc123-auth/plan.md:
# ---
# Run ID: abc123
# Feature: auth
#
# ## Phase 1: Foundation (Sequential)
# ### Task 1-1: Setup
# **Description:** Initialize project
# **Files:** src/index.ts
# **Acceptance Criteria:** Project boots

# 1. Execute plan
/spectacular:execute specs/abc123-auth/plan.md
# Returns: { "run_id": "abc123", "status": "started" }

# 2. Poll for execution progress
/subagent:status abc123
# Repeat every 30-60 seconds until status is "completed"

# 3. When complete, review branches
git branch | grep abc123
# Shows all task branches created during execution

# 4. Submit stacked PRs
gs stack submit
```

## Resuming from Failure

If execution fails (e.g., thread crash, network error), simply re-run the execute command:

```bash
/spectacular:execute specs/abc123/plan.md
```

The MCP server will:

1. Detect existing branches for completed tasks
2. Skip tasks with valid branches and commits
3. Resume from the first incomplete task
4. Continue with parallel execution and review loops

See [examples/resume-from-failure.md](examples/resume-from-failure.md) for detailed resume scenarios.

## Troubleshooting

### Issue: "MCP server not found"

**Solution**: Check `~/.codex/mcp-servers.json` has spectacular-codex configured:

```json
{
  "spectacular-codex": {
    "command": "npx",
    "args": ["spectacular-codex"],
    "env": {}
  }
}
```

### Issue: "Tool returned error"

**Solution**: Check the error field in the response. Common errors:
- `plan_path or plan must be provided` - Missing required argument
- `Plan file not found` - Invalid path or file doesn't exist
- `Invalid plan path` - Path doesn't match `specs/{runId}-{slug}/plan.md` format
- `runId mismatch` - plan_path runId doesn't match plan content

### Issue: "Status shows 'failed'"

**Solution**: Check the `error` field in status response for error details. Review task branches for partial work.

### Issue: "Execution seems stuck"

**Solution**: Poll status to see current phase and tasks. Long-running tasks (like E2E tests) may take time. Check task status field for progress.

## Advanced Usage

### Inline Plan Execution

Instead of pointing to `plan.md`, you can provide an inline plan object:

```bash
/spectacular:execute
```

```json
{
  "plan": {
    "runId": "def456",
    "featureSlug": "inline-test",
    "phases": [
      {
        "id": 1,
        "name": "Quick Test",
        "strategy": "parallel",
        "tasks": [
          {
            "id": "1-1",
            "name": "Task 1",
            "description": "Do thing 1",
            "files": ["src/thing1.ts"],
            "acceptanceCriteria": ["Thing 1 works"]
          },
          {
            "id": "1-2",
            "name": "Task 2",
            "description": "Do thing 2",
            "files": ["src/thing2.ts"],
            "acceptanceCriteria": ["Thing 2 works"]
          }
        ]
      }
    ]
  }
}
```

See [plan-schema.md](plan-schema.md) for full plan structure.

### Custom Base Branch

By default, worktrees are created from `main`. To use a different base:

```json
{
  "tool": "spectacular_execute",
  "plan_path": "specs/abc123/plan.md",
  "base_branch": "develop"
}
```

### Task Filtering

Execute specific tasks only:

```json
{
  "tool": "spectacular_execute",
  "plan_path": "specs/abc123/plan.md",
  "tasks": [
    { "id": "1-1" },
    { "id": "2-3" }
  ]
}
```

### Custom Worktree Paths

Override worktree paths per task (useful for resume scenarios):

```json
{
  "tool": "spectacular_execute",
  "plan_path": "specs/abc123/plan.md",
  "tasks": [
    {
      "id": "1-1",
      "worktree_path": ".worktrees/abc123-task-1-1-custom"
    }
  ]
}
```

## References

- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [Codex SDK Documentation](https://github.com/openai/codex/tree/main/sdk/typescript)
- [spectacular-codex README](../README.md)
- [Plan Schema](plan-schema.md)
- [Architecture Documentation](constitutions/current/architecture.md)
