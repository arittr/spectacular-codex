# Resume from Failure Example

This document demonstrates how spectacular-codex's resume logic recovers from failures during parallel execution. The resume logic is git-based: branches are source of truth, not database state.

## Scenario

You're executing a plan with 3 phases and 7 tasks. During Phase 2, a network error causes the MCP server to crash. How do you recover?

## Initial Plan

```markdown
# Implementation Plan

Run ID: x1y2z3

## Phase 1: Setup (Sequential)

### Task 1.1: Create database schema (M - 1h)
- Files: `db/schema.sql`

### Task 1.2: Install dependencies (S - 0.5h)
- Files: `package.json`

## Phase 2: Core Logic (Parallel)

### Task 2.1: User service (M - 2h)
- Files: `src/services/user-service.ts`

### Task 2.2: Product service (M - 2h)
- Files: `src/services/product-service.ts`

### Task 2.3: Order service (M - 2.5h)
- Files: `src/services/order-service.ts`

## Phase 3: Integration (Sequential)

### Task 3.1: API integration tests (L - 3h)
- Files: `tests/integration/api.test.ts`

### Task 3.2: E2E tests (L - 3h)
- Files: `tests/e2e/workflows.test.ts`
```

## Execution Timeline

### T=0: Start Execution

```bash
/spectacular:execute specs/x1y2z3/plan.md
```

**Response**:

```json
{
  "run_id": "x1y2z3",
  "status": "started"
}
```

### T=5min: Phase 1 Complete

```bash
/spectacular:status x1y2z3
```

**Response**:

```json
{
  "run_id": "x1y2z3",
  "status": "running",
  "phase": "Phase 1 (Sequential)",
  "completed_tasks": [
    { "id": "1.1", "name": "create-database-schema", "branch": "x1y2z3-task-1-1-create-database-schema" },
    { "id": "1.2", "name": "install-dependencies", "branch": "x1y2z3-task-1-2-install-dependencies" }
  ],
  "failed_tasks": [],
  "output": "Phase 1 complete. Starting Phase 2 with 3 parallel tasks..."
}
```

**Git state at T=5min**:

```bash
git branch | grep x1y2z3
```

Output:
```
x1y2z3-task-1-1-create-database-schema
x1y2z3-task-1-2-install-dependencies
```

### T=15min: Phase 2 Partially Complete (Network Error!)

Phase 2 starts executing 3 tasks in parallel. After 10 minutes:

- Task 2.1 (user-service): **Completed** - branch created with commits
- Task 2.2 (product-service): **In progress** - thread still running
- Task 2.3 (order-service): **In progress** - thread still running

Then: **Network error causes MCP server to crash.**

**Git state at T=15min** (before crash):

```bash
git branch | grep x1y2z3
```

Output:
```
x1y2z3-task-1-1-create-database-schema
x1y2z3-task-1-2-install-dependencies
x1y2z3-task-2-1-user-service
```

Note: Only Task 2.1 completed and created a branch. Tasks 2.2 and 2.3 have no branches yet.

**Worktree state at T=15min** (before crash):

```bash
ls .worktrees/
```

Output:
```
x1y2z3-main/
x1y2z3-task-2-1/  (committed work, detached HEAD)
x1y2z3-task-2-2/  (uncommitted work, possible partial implementation)
x1y2z3-task-2-3/  (uncommitted work, possible partial implementation)
```

## Recovery: Resume from Failure

### T=20min: Restart Execution

After restarting the MCP server, simply re-run the execute command:

```bash
/spectacular:execute specs/x1y2z3/plan.md
```

**Response**:

```json
{
  "run_id": "x1y2z3",
  "status": "started"
}
```

### What Happens Behind the Scenes

The MCP server's `executeHandler` implements resume logic:

```typescript
// Pseudocode from src/handlers/execute.ts
async function executeHandler(planPath: string) {
  const plan = parsePlan(planPath);
  const runId = plan.runId;

  // Check for existing branches (resume logic)
  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      const branchPattern = `${runId}-task-${task.id}-`;
      const existingBranch = await findBranch(branchPattern);

      if (existingBranch && await branchHasCommits(existingBranch)) {
        // Skip task - already completed
        task.status = 'completed';
        task.branch = existingBranch;
      }
    }
  }

  // Execute only incomplete tasks
  await executePhases(plan);
}
```

### Resume Detection Process

**Phase 1**: Check all tasks

- Task 1.1: Branch `x1y2z3-task-1-1-create-database-schema` exists with commits → **Skip**
- Task 1.2: Branch `x1y2z3-task-1-2-install-dependencies` exists with commits → **Skip**

**Phase 2**: Check all tasks

- Task 2.1: Branch `x1y2z3-task-2-1-user-service` exists with commits → **Skip**
- Task 2.2: No branch found → **Execute**
- Task 2.3: No branch found → **Execute**

**Worktree Cleanup**:

Before resuming, clean up stale worktrees from crashed execution:

```bash
# MCP server runs this internally
git worktree remove .worktrees/x1y2z3-task-2-2/ --force
git worktree remove .worktrees/x1y2z3-task-2-3/ --force
```

Any uncommitted work in these worktrees is lost (as intended - partial work is discarded).

### T=25min: Phase 2 Resume

The MCP server executes only the incomplete tasks (2.2 and 2.3) in parallel:

```json
{
  "run_id": "x1y2z3",
  "status": "running",
  "phase": "Phase 2 (Parallel) - Resumed",
  "completed_tasks": [
    { "id": "1.1", "name": "create-database-schema", "branch": "x1y2z3-task-1-1-create-database-schema" },
    { "id": "1.2", "name": "install-dependencies", "branch": "x1y2z3-task-1-2-install-dependencies" },
    { "id": "2.1", "name": "user-service", "branch": "x1y2z3-task-2-1-user-service" }
  ],
  "failed_tasks": [],
  "output": "Resuming Phase 2: Executing tasks 2.2, 2.3 in parallel (2 threads)"
}
```

### T=40min: Phase 2 Complete

Both tasks finish successfully:

```bash
/spectacular:status x1y2z3
```

**Response**:

```json
{
  "run_id": "x1y2z3",
  "status": "running",
  "phase": "Phase 2 Code Review",
  "completed_tasks": [
    { "id": "1.1", "name": "create-database-schema", "branch": "x1y2z3-task-1-1-create-database-schema" },
    { "id": "1.2", "name": "install-dependencies", "branch": "x1y2z3-task-1-2-install-dependencies" },
    { "id": "2.1", "name": "user-service", "branch": "x1y2z3-task-2-1-user-service" },
    { "id": "2.2", "name": "product-service", "branch": "x1y2z3-task-2-2-product-service" },
    { "id": "2.3", "name": "order-service", "branch": "x1y2z3-task-2-3-order-service" }
  ],
  "failed_tasks": [],
  "output": "Code review in progress for Phase 2 tasks..."
}
```

**Git state at T=40min**:

```bash
git branch | grep x1y2z3
```

Output:
```
x1y2z3-task-1-1-create-database-schema
x1y2z3-task-1-2-install-dependencies
x1y2z3-task-2-1-user-service
x1y2z3-task-2-2-product-service
x1y2z3-task-2-3-order-service
```

### T=50min: Execution Complete

Phase 3 executes and completes:

```json
{
  "run_id": "x1y2z3",
  "status": "completed",
  "phase": "All phases completed",
  "completed_tasks": [
    { "id": "1.1", "name": "create-database-schema", "branch": "x1y2z3-task-1-1-create-database-schema" },
    { "id": "1.2", "name": "install-dependencies", "branch": "x1y2z3-task-1-2-install-dependencies" },
    { "id": "2.1", "name": "user-service", "branch": "x1y2z3-task-2-1-user-service" },
    { "id": "2.2", "name": "product-service", "branch": "x1y2z3-task-2-2-product-service" },
    { "id": "2.3", "name": "order-service", "branch": "x1y2z3-task-2-3-order-service" },
    { "id": "3.1", "name": "api-integration-tests", "branch": "x1y2z3-task-3-1-api-integration-tests" },
    { "id": "3.2", "name": "e2e-tests", "branch": "x1y2z3-task-3-2-e2e-tests" }
  ],
  "failed_tasks": [],
  "output": "Execution complete. 7 branches created and stacked."
}
```

## Key Resume Logic Principles

### 1. Branches Are Source of Truth

**Not this** (database state):
```typescript
// ❌ WRONG
const completedTasks = await db.query('SELECT * FROM tasks WHERE status = "completed"');
```

**But this** (git branches):
```typescript
// ✅ CORRECT
const existingBranch = await findBranch(`${runId}-task-${task.id}-`);
if (existingBranch && await branchHasCommits(existingBranch)) {
  // Task is complete
}
```

### 2. Uncommitted Work Is Discarded

If a task thread crashes before creating a branch, the partial work is lost. This is intentional:

- **Partial implementations are not reliable** - may be in broken state
- **TDD requires complete cycle** - test written, fail, implement, pass
- **Branches represent atomic units** - either complete or not

### 3. Code Review Loops Are Idempotent

If the server crashes during code review:

- Review starts fresh on resume
- Fixer threads re-run if needed
- Final approval gates completion

## Advanced Resume Scenarios

### Scenario 1: Crash During Code Review

**What happened**: Phase 2 tasks completed, code review started, server crashed before approval.

**Git state**:
```
x1y2z3-task-2-1-user-service (has commits)
x1y2z3-task-2-2-product-service (has commits)
x1y2z3-task-2-3-order-service (has commits)
```

**Resume behavior**:

1. Detects all Phase 2 tasks complete (branches exist with commits)
2. Skips task execution
3. **Re-runs code review** from scratch
4. Applies fixes if needed
5. Continues to Phase 3

### Scenario 2: Crash During Fixer Thread

**What happened**: Code review rejected Task 2.3, fixer thread started, server crashed before fixer completed.

**Git state**:
```
x1y2z3-task-2-1-user-service (approved)
x1y2z3-task-2-2-product-service (approved)
x1y2z3-task-2-3-order-service (rejected, no fixer branch)
```

**Resume behavior**:

1. Detects all Phase 2 tasks have branches (even rejected one)
2. Skips task execution
3. **Re-runs code review** from scratch
4. Re-detects Task 2.3 rejection
5. Spawns new fixer thread
6. Fixer completes and updates branch
7. Re-reviews and approves

**Key**: Original task branches are never deleted, only updated by fixer threads.

### Scenario 3: Multiple Resume Attempts

**What happened**: Server crashes twice during Phase 2 execution.

**First crash** (T=15min):
- Task 2.1 completed
- Tasks 2.2, 2.3 incomplete

**First resume** (T=20min):
- Executes 2.2 and 2.3
- Task 2.2 completes
- Server crashes again before 2.3 finishes

**Second crash** (T=25min):
- Tasks 2.1, 2.2 completed
- Task 2.3 incomplete

**Second resume** (T=30min):
- Executes only Task 2.3
- Completes successfully
- Continues to code review

**Git state progression**:

```
After 1st crash:  x1y2z3-task-2-1-user-service
After 1st resume: x1y2z3-task-2-1-user-service, x1y2z3-task-2-2-product-service
After 2nd resume: x1y2z3-task-2-1-user-service, x1y2z3-task-2-2-product-service, x1y2z3-task-2-3-order-service
```

## Manual Recovery (Advanced)

If you need to manually intervene:

### Force Re-execute a Specific Task

Delete the task branch and re-run execute:

```bash
# Delete the branch you want to re-execute
git branch -D x1y2z3-task-2-2-product-service

# Re-run execute (will detect missing branch and re-execute task)
/spectacular:execute specs/x1y2z3/plan.md
```

### Resume from Specific Phase

Edit `specs/x1y2z3/plan.md` to remove completed phases:

```markdown
# Implementation Plan (Modified for Resume)

Run ID: x1y2z3

## Phase 2: Core Logic (Parallel)  ← Start here

### Task 2.1: User service (M - 2h)
- Files: `src/services/user-service.ts`
...
```

Then re-run execute. It will skip Phase 1 (no tasks to execute) and resume from Phase 2.

### Clean Up Failed Execution Entirely

Remove all branches and worktrees:

```bash
# Delete all task branches
git branch | grep x1y2z3 | xargs git branch -D

# Remove all worktrees (if still present)
rm -rf .worktrees/x1y2z3-*

# Re-run from scratch
/spectacular:execute specs/x1y2z3/plan.md
```

## Resume Logic Implementation

The resume logic is implemented in `src/orchestrator/parallel-phase.ts` and `src/orchestrator/sequential-phase.ts`:

```typescript
// Simplified pseudocode
async function executePhase(phase: Phase, plan: Plan, job: ExecutionJob) {
  // Filter out already-completed tasks
  const incompleteTasks = [];

  for (const task of phase.tasks) {
    const branchPattern = `${plan.runId}-task-${task.id}-`;
    const branch = await findBranch(branchPattern);

    if (!branch || !(await branchHasCommits(branch))) {
      // Task incomplete - needs execution
      incompleteTasks.push(task);
    } else {
      // Task complete - add to completed list
      job.completedTasks.push({
        id: task.id,
        name: task.name,
        branch: branch,
      });
    }
  }

  if (incompleteTasks.length === 0) {
    // All tasks complete - skip to code review
    return await executeCodeReview(phase, plan, job);
  }

  // Execute only incomplete tasks
  if (phase.type === 'parallel') {
    await executeTasksParallel(incompleteTasks, plan, job);
  } else {
    await executeTasksSequential(incompleteTasks, plan, job);
  }

  // Code review after execution
  await executeCodeReview(phase, plan, job);
}
```

**Key functions**:

- `findBranch(pattern)`: Searches for branch matching pattern
- `branchHasCommits(branch)`: Checks if branch has at least one commit
- `executeTasksParallel(tasks)`: Spawns Codex threads with `Promise.all()`
- `executeCodeReview(phase)`: Spawns review thread, handles rejections

## Summary

**Resume logic principles**:

1. **Git branches are source of truth** - not database, not in-memory state
2. **Branches + commits = completion** - both must exist
3. **Uncommitted work is discarded** - partial implementations are not reliable
4. **Code review is idempotent** - re-runs on resume are safe
5. **Parallel execution resumes efficiently** - only executes incomplete tasks

**Benefits**:

- No database to corrupt or sync
- No complex state management
- Verifiable completion (just check git branches)
- Resumable from any failure point
- Manual recovery is simple (delete branches)

**Trade-offs**:

- Partial work is lost on crash (by design)
- Must re-run code review if crashed during review (acceptable overhead)
- No progress tracking within a single task (git is task-level, not line-level)

## References

- [Parallel Execution Workflow](parallel-execution.md)
- [Slash Commands Documentation](../slash-commands.md)
- [Schema Rules (Git-Based State)](../constitutions/current/schema-rules.md)
