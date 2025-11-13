# Schema Rules

## Core Principle

**spectacular-codex has no database schema. All state lives in git.**

This file exists for constitution completeness but contains no schema rules because spectacular-codex follows a **git-based state architecture**:

- **Job status** → In-memory Map (transient, cleared on restart)
- **Task completion** → Git branches (source of truth)
- **Execution artifacts** → Git commits (code, tests, docs)
- **Phase progress** → Branch naming patterns (`{runId}-task-{phase}-{task}-{name}`)
- **Resume state** → Branch existence checks

## Why No Database?

**Git is the database.**

### State Storage Patterns

| State Type | Storage | Rationale |
|------------|---------|-----------|
| Job status (running/failed) | In-memory Map | Transient, no persistence needed |
| Task completion | Git branches | Permanent, verifiable, resumable |
| Code artifacts | Git commits | Version controlled, reviewable |
| Phase organization | Branch prefixes | Filterable (`git branch \| grep {runId}`) |
| Stack structure | git-spice metadata | Native to stacked workflow |

### Benefits of Git-Based State

1. **No database setup** - Works in any git repository
2. **Visible state** - `gs log short` shows progress
3. **Resume logic** - Check branch existence, skip completed tasks
4. **Verifiable** - Branches exist or they don't (no stale DB state)
5. **User-facing** - Stack is what user ships (not hidden DB records)

### Example State Queries

```typescript
// Check if task is complete
const branch = await findBranch(`${runId}-task-${phase}-${task}-`);
const isComplete = branch && await branchHasCommits(branch);

// Get all completed tasks for phase
const branches = await execa('git', ['branch', '--list', `${runId}-task-${phase}-*`]);
const completed = branches.stdout.split('\n').filter(b => b.trim());

// Resume execution (skip completed tasks)
const pending = tasks.filter(task => !isTaskComplete(task, runId));
```

**Key:** All state queries are git commands. No SQL, no ORM, no migrations.

## Future Considerations

**When database might be needed (v2+):**

1. **Job History** - Persist job status across server restarts
   - Current: In-memory Map, lost on restart
   - Future: SQLite with job_id, status, created_at, completed_at
   - Rationale: Enable "show me all runs" or "resume after crash"

2. **Execution Metrics** - Track task duration, failure rates
   - Current: No metrics
   - Future: task_metrics table with duration, memory, error_count
   - Rationale: Optimize parallelization, identify slow tasks

3. **User Preferences** - Store review_frequency, max_concurrent_threads
   - Current: Environment variables
   - Future: user_preferences table
   - Rationale: Per-project settings without env vars

**If database added in v2:**
- Use SQLite (single file, no server, no setup)
- Git remains source of truth for task state
- Database only for orchestration metadata
- Schema versioning via migrations (separate migrations/ directory)
- Document schema in updated schema-rules.md v2

## Testing Without Database

**No database means:**
- No schema migrations to test
- No ORM queries to mock
- No connection pooling issues
- No transaction isolation concerns

**What to test instead:**
- Git command wrappers (utils/git.ts)
- Branch existence checks (utils/branch-tracker.ts)
- Resume logic (orchestrator/parallel-phase.ts)
- In-memory job tracking (Map operations)

See testing.md for test strategy.

## Anti-Patterns

### ❌ Don't Add Database "Just in Case"

**Wrong:**
```typescript
import Database from 'better-sqlite3';
const db = new Database('spectacular.db');
db.exec(`CREATE TABLE IF NOT EXISTS jobs (...)`);
```

**Why:** YAGNI (You Aren't Gonna Need It). Git branches work. Don't add complexity without proven need.

### ❌ Don't Store Git State in Database

**Wrong:**
```typescript
// After creating branch, store in DB
await createBranch(branchName);
db.run('INSERT INTO branches (name, created_at) VALUES (?, ?)', [branchName, Date.now()]);
```

**Why:** Git is already the database. Duplicating state creates sync bugs ("branch exists but not in DB").

### ❌ Don't Use Database for Communication

**Wrong:**
```typescript
// Codex thread writes status to DB
db.run('UPDATE task_status SET progress = ? WHERE task_id = ?', [50, taskId]);

// MCP server polls DB
setInterval(() => {
  const status = db.get('SELECT progress FROM task_status WHERE task_id = ?', taskId);
}, 1000);
```

**Why:** Git branches are communication channel. Thread creates branch → MCP server checks branch existence.

## Summary

**spectacular-codex has no database because:**
1. Git branches store task completion state
2. Git commits store execution artifacts
3. In-memory Map tracks transient job status
4. No persistence needed (resume from git state)

**If v2 adds database:**
- SQLite only (no Postgres, no MySQL)
- Orchestration metadata only (not task state)
- Git remains source of truth
- Document schema rules in v2/schema-rules.md

**Remember:** Simplicity is a feature. Don't add database until proven necessary.
