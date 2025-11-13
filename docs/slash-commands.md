# Spectacular Slash Commands

This document provides slash command templates for using spectacular-codex with Codex CLI. Copy these templates to `~/.codex/prompts/` in your Codex CLI installation.

## Overview

spectacular-codex provides four slash commands that map to MCP tools:

- `/spectacular:spec` - Generate feature specification
- `/spectacular:plan` - Decompose spec into tasks
- `/spectacular:execute` - Execute plan with parallel orchestration
- `/spectacular:status` - Check job status

## Installation

Create the following files in `~/.codex/prompts/`:

```bash
mkdir -p ~/.codex/prompts
cd ~/.codex/prompts
```

Copy each template below into a separate file.

## /spectacular:spec

**File**: `~/.codex/prompts/spectacular-spec.md`

```markdown
---
description: Generate feature specification with brainstorming
---

Use the spectacular_spec MCP tool to generate a feature specification from a natural language request.

Call the tool with the feature request:

\`\`\`json
{
  "tool": "spectacular_spec",
  "feature_request": "$1"
}
\`\`\`

The tool will return a run_id. Poll for completion using:

\`\`\`json
{
  "tool": "spectacular_status",
  "run_id": "{returned_run_id}"
}
\`\`\`

When status is "completed", the spec will be available at the path specified in the response.
```

**Usage**:

```bash
/spectacular:spec "Add user authentication with JWT tokens"
```

**What it does**:

1. Spawns a Codex thread to brainstorm the feature
2. Generates a specification document in `specs/{run_id}/spec.md`
3. Returns immediately with run_id for status polling
4. Specification follows writing-specs skill pattern (lean, constitution-heavy)

## /spectacular:plan

**File**: `~/.codex/prompts/spectacular-plan.md`

```markdown
---
description: Decompose specification into executable task plan
---

Use the spectacular_plan MCP tool to decompose a feature specification into an executable plan with sequential and parallel phases.

Call the tool with the spec path:

\`\`\`json
{
  "tool": "spectacular_plan",
  "spec_path": "$1"
}
\`\`\`

The tool will return a run_id. Poll for completion using:

\`\`\`json
{
  "tool": "spectacular_status",
  "run_id": "{returned_run_id}"
}
\`\`\`

When status is "completed", the plan will be available at the path specified in the response.
```

**Usage**:

```bash
/spectacular:plan specs/abc123/spec.md
```

**What it does**:

1. Spawns a Codex thread to analyze the specification
2. Decomposes into tasks grouped by sequential/parallel phases
3. Validates task quality (no XL tasks, explicit file paths)
4. Generates `specs/{run_id}/plan.md` with execution strategy
5. Calculates parallelization time savings

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

The tool will return a run_id. Poll for status using:

\`\`\`json
{
  "tool": "spectacular_status",
  "run_id": "{returned_run_id}"
}
\`\`\`

Poll every 30-60 seconds to check progress. Execution may take several hours depending on the plan size.
```

**Usage**:

```bash
/spectacular:execute specs/abc123/plan.md
```

**What it does**:

1. Creates git worktrees for isolation (`.worktrees/{run_id}-main/`, `.worktrees/{run_id}-task-N/`)
2. Executes phases sequentially, tasks within phases in parallel
3. For each task:
   - Spawns isolated Codex thread in dedicated worktree
   - Implements task following TDD pattern
   - Creates branch `{run_id}-task-{id}-{name}`
   - Detaches HEAD for safety
4. After each phase:
   - Spawns code review thread
   - Reviews all task implementations
   - Spawns fixer threads for rejected tasks
   - Repeats until all tasks approved
5. Stacks branches linearly using git-spice
6. Cleans up worktrees on completion
7. Returns immediately, executes in background

## /spectacular:status

**File**: `~/.codex/prompts/spectacular-status.md`

```markdown
---
description: Check status of running or completed spectacular job
---

Use the spectacular_status MCP tool to check the status of a running or completed job.

Call the tool with the run_id:

\`\`\`json
{
  "tool": "spectacular_status",
  "run_id": "$1"
}
\`\`\`

The response includes:
- Current status (running, completed, failed)
- Current phase being executed
- Completed tasks
- Failed tasks (if any)
- Output from last operation
```

**Usage**:

```bash
/spectacular:status abc123
```

**What it returns**:

```json
{
  "run_id": "abc123",
  "status": "running",
  "phase": "Phase 2 (Parallel)",
  "completed_tasks": [
    { "id": "1.1", "name": "setup-project", "branch": "abc123-task-1-1-setup-project" },
    { "id": "2.1", "name": "implement-auth", "branch": "abc123-task-2-1-implement-auth" }
  ],
  "failed_tasks": [],
  "output": "Executing task 2.2 in .worktrees/abc123-task-2-2/"
}
```

## Complete Workflow Example

Here's a typical workflow using all four slash commands:

```bash
# 1. Generate specification
/spectacular:spec "Add user authentication with JWT tokens and refresh tokens"
# Returns: run_id = abc123

# 2. Poll for spec completion
/spectacular:status abc123
# When completed, spec is at specs/abc123/spec.md

# 3. Generate execution plan
/spectacular:plan specs/abc123/spec.md
# Returns: run_id = abc123 (same)

# 4. Poll for plan completion
/spectacular:status abc123
# When completed, plan is at specs/abc123/plan.md

# 5. Execute plan
/spectacular:execute specs/abc123/plan.md
# Returns: run_id = abc123 (same)

# 6. Poll for execution progress
/spectacular:status abc123
# Repeat every 30-60 seconds until status is "completed"

# 7. When complete, review branches
git branch | grep abc123
# Shows all task branches created during execution
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

**Solution**: Check the MCP server logs. If running locally, stderr will show errors.

### Issue: "Status shows 'failed'"

**Solution**: Check the output field in status response for error details. Review task branches for partial work.

### Issue: "Execution seems stuck"

**Solution**: Poll status to see current phase and tasks. Long-running tasks (like E2E tests) may take time.

## Advanced Usage

### Custom Worktree Location

Set `SPECTACULAR_WORKTREE_DIR` environment variable:

```json
{
  "spectacular-codex": {
    "command": "npx",
    "args": ["spectacular-codex"],
    "env": {
      "SPECTACULAR_WORKTREE_DIR": "/tmp/spectacular-worktrees"
    }
  }
}
```

### Parallel Execution Limit

Set `SPECTACULAR_MAX_PARALLEL` to limit concurrent threads:

```json
{
  "spectacular-codex": {
    "command": "npx",
    "args": ["spectacular-codex"],
    "env": {
      "SPECTACULAR_MAX_PARALLEL": "3"
    }
  }
}
```

Default is unlimited (all parallel tasks execute concurrently).

## References

- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [Codex CLI Documentation](https://github.com/openai/codex)
- [spectacular-codex README](../README.md)
- [Architecture Documentation](constitutions/current/architecture.md)
