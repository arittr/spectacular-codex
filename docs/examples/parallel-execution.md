# Parallel Execution Workflow Example

This document walks through a complete parallel execution workflow using spectacular-codex, from feature request to final stacked branches ready for code review.

## Scenario

You want to add user authentication to your web application with the following requirements:

- JWT token-based authentication
- Refresh token rotation
- Protected API endpoints
- Login/logout UI
- Session management

## Step 1: Generate Specification

Use the `/spectacular:spec` slash command to generate a feature specification:

```bash
/spectacular:spec "Add user authentication with JWT tokens, refresh token rotation, protected API endpoints, login/logout UI, and session management"
```

**MCP Tool Call**:

```json
{
  "tool": "spectacular_spec",
  "feature_request": "Add user authentication with JWT tokens, refresh token rotation, protected API endpoints, login/logout UI, and session management"
}
```

**Response**:

```json
{
  "run_id": "a1b2c3",
  "status": "started",
  "spec_path": null
}
```

### What Happens Behind the Scenes

1. MCP server creates job `a1b2c3` and returns immediately
2. Spawns Codex thread with spec-generator prompt (embedded brainstorming skill)
3. Thread asks clarifying questions about:
   - Token expiry times
   - Session storage (localStorage vs cookies)
   - Password requirements
   - OAuth integration (if needed)
4. Generates lean specification referencing constitution patterns
5. Writes spec to `specs/a1b2c3/spec.md`
6. Updates job status to "completed"

### Poll for Completion

```bash
/spectacular:status a1b2c3
```

**Response (after 2-3 minutes)**:

```json
{
  "run_id": "a1b2c3",
  "status": "completed",
  "phase": "spec-generation",
  "completed_tasks": [],
  "failed_tasks": [],
  "output": "Specification generated at specs/a1b2c3/spec.md"
}
```

### Specification Contents

```markdown
# User Authentication Feature

## Summary

Add JWT-based authentication with refresh token rotation, protected API endpoints, and login/logout UI.

## Requirements

- JWT access tokens (15min expiry)
- Refresh tokens (7 day expiry, rotation on use)
- Protected API middleware
- Login form with email/password
- Logout functionality
- Session persistence across page reloads

## Architecture

See constitution at docs/constitutions/current/patterns.md for:
- Token storage patterns (httpOnly cookies for refresh, memory for access)
- API authentication middleware
- Frontend auth context patterns

## Test Plan

- Unit tests for token generation/validation
- Integration tests for auth middleware
- E2E tests for login/logout flows
- Security tests for token expiry and rotation

## Out of Scope

- OAuth/social login (future enhancement)
- Two-factor authentication
- Password reset flow
```

## Step 2: Generate Execution Plan

Use the `/spectacular:plan` slash command to decompose the spec into tasks:

```bash
/spectacular:plan specs/a1b2c3/spec.md
```

**MCP Tool Call**:

```json
{
  "tool": "spectacular_plan",
  "spec_path": "specs/a1b2c3/spec.md"
}
```

**Response**:

```json
{
  "run_id": "a1b2c3",
  "status": "started",
  "plan_path": null
}
```

### What Happens Behind the Scenes

1. MCP server updates job `a1b2c3` and returns immediately
2. Spawns Codex thread with plan-decomposer prompt (embedded decomposing-tasks skill)
3. Thread analyzes dependencies and groups tasks into phases
4. Validates task quality (no XL tasks, explicit file paths)
5. Calculates parallelization time savings
6. Writes plan to `specs/a1b2c3/plan.md`
7. Updates job status to "completed"

### Poll for Completion

```bash
/spectacular:status a1b2c3
```

**Response (after 1-2 minutes)**:

```json
{
  "run_id": "a1b2c3",
  "status": "completed",
  "phase": "plan-decomposition",
  "completed_tasks": [],
  "failed_tasks": [],
  "output": "Plan generated at specs/a1b2c3/plan.md"
}
```

### Plan Contents

```markdown
# Implementation Plan: User Authentication

Run ID: a1b2c3
Estimated Time: 6h sequential, 2h parallel (3x speedup)

## Phase 1: Foundation (Sequential)

### Task 1.1: Setup database schema (M - 1h)
- Create users table migration
- Add indexes for email lookup
- Files: `db/migrations/001_create_users.sql`

### Task 1.2: Install dependencies (S - 0.5h)
- Add jsonwebtoken, bcrypt, cookie-parser
- Update package.json
- Files: `package.json`

## Phase 2: Backend (Parallel)

### Task 2.1: Token service (M - 2h)
- JWT generation and validation
- Refresh token rotation logic
- Files: `src/services/token-service.ts`, `src/services/token-service.test.ts`

### Task 2.2: Auth middleware (M - 1.5h)
- Express middleware for protected routes
- Token extraction from headers/cookies
- Files: `src/middleware/auth.ts`, `src/middleware/auth.test.ts`

### Task 2.3: Auth API endpoints (M - 2h)
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/refresh
- Files: `src/routes/auth.ts`, `src/routes/auth.test.ts`

## Phase 3: Frontend (Parallel)

### Task 3.1: Auth context (M - 1.5h)
- React context for auth state
- Login/logout functions
- Files: `src/contexts/AuthContext.tsx`, `src/contexts/AuthContext.test.tsx`

### Task 3.2: Login form component (S - 1h)
- Form with email/password fields
- Error handling
- Files: `src/components/LoginForm.tsx`, `src/components/LoginForm.test.tsx`

### Task 3.3: Protected route wrapper (S - 0.5h)
- HOC for protected pages
- Redirect to login if unauthenticated
- Files: `src/components/ProtectedRoute.tsx`

## Phase 4: Integration (Sequential)

### Task 4.1: E2E tests (L - 2h)
- Login flow test
- Protected route access test
- Token refresh test
- Files: `e2e/auth.test.ts`
```

## Step 3: Execute Plan

Use the `/spectacular:execute` slash command to start parallel execution:

```bash
/spectacular:execute specs/a1b2c3/plan.md
```

**MCP Tool Call**:

```json
{
  "tool": "spectacular_execute",
  "plan_path": "specs/a1b2c3/plan.md"
}
```

**Response**:

```json
{
  "run_id": "a1b2c3",
  "status": "started"
}
```

### What Happens Behind the Scenes

This is where the magic happens. The MCP server orchestrates parallel execution across all phases.

#### Phase 1: Foundation (Sequential)

**Task 1.1: Setup database schema**

1. Creates worktree: `.worktrees/a1b2c3-task-1-1/`
2. Spawns Codex thread in worktree
3. Thread follows task-executor prompt (embedded TDD + phase-task-verification skills):
   - Writes test for migration
   - Creates migration file `db/migrations/001_create_users.sql`
   - Runs migration in test database
   - Verifies indexes created
4. Creates branch: `a1b2c3-task-1-1-setup-database-schema`
5. Commits work
6. Detaches HEAD for safety

**Task 1.2: Install dependencies**

1. Creates worktree: `.worktrees/a1b2c3-task-1-2/`
2. Spawns Codex thread (waits for 1.1 to complete since sequential)
3. Thread updates `package.json` with dependencies
4. Runs `pnpm install` to verify
5. Creates branch: `a1b2c3-task-1-2-install-dependencies`
6. Commits work
7. Detaches HEAD

**Code Review Loop (Phase 1)**

1. Spawns code review thread in `.worktrees/a1b2c3-main/`
2. Checks out both task branches
3. Reviews against constitution and spec
4. Response: Both approved

#### Phase 2: Backend (Parallel)

All three tasks execute concurrently using `Promise.all()`:

**Task 2.1: Token service** (Thread 1)
**Task 2.2: Auth middleware** (Thread 2)
**Task 2.3: Auth API endpoints** (Thread 3)

Each thread:
1. Works in isolated worktree (`.worktrees/a1b2c3-task-2-1/`, etc.)
2. Follows TDD pattern (write test first, watch fail, implement, watch pass)
3. Creates branch with implementation
4. Commits and detaches HEAD

**Code Review Loop (Phase 2)**

1. Spawns code review thread
2. Reviews all three task branches
3. **Rejection**: Task 2.3 has missing error handling
4. Spawns fixer thread for Task 2.3
5. Fixer updates branch with error handling
6. Code review thread re-reviews
7. **Approval**: All tasks approved

#### Phase 3: Frontend (Parallel)

All three tasks execute concurrently:

**Task 3.1: Auth context** (Thread 1)
**Task 3.2: Login form** (Thread 2)
**Task 3.3: Protected route wrapper** (Thread 3)

**Code Review Loop (Phase 3)**

1. All tasks approved on first review

#### Phase 4: Integration (Sequential)

**Task 4.1: E2E tests**

1. Creates worktree, spawns thread
2. Thread writes comprehensive E2E tests
3. All tests pass
4. Creates branch, commits, detaches

**Code Review Loop (Phase 4)**

1. Approved

#### Final Steps

1. MCP server stacks all branches using git-spice:
   ```bash
   main
   └─ a1b2c3-task-1-1-setup-database-schema
      └─ a1b2c3-task-1-2-install-dependencies
         └─ a1b2c3-task-2-1-token-service
            ├─ a1b2c3-task-2-2-auth-middleware
            └─ a1b2c3-task-2-3-auth-api-endpoints
               └─ (Phase 3 branches...)
   ```

2. Cleans up worktrees (`.worktrees/a1b2c3-*`)
3. Updates job status to "completed"

### Poll for Progress

During execution, poll for status every 30-60 seconds:

```bash
/spectacular:status a1b2c3
```

**Response (during Phase 2)**:

```json
{
  "run_id": "a1b2c3",
  "status": "running",
  "phase": "Phase 2 (Parallel)",
  "completed_tasks": [
    { "id": "1.1", "name": "setup-database-schema", "branch": "a1b2c3-task-1-1-setup-database-schema" },
    { "id": "1.2", "name": "install-dependencies", "branch": "a1b2c3-task-1-2-install-dependencies" }
  ],
  "failed_tasks": [],
  "output": "Executing tasks 2.1, 2.2, 2.3 in parallel (3 threads)"
}
```

**Response (during Code Review)**:

```json
{
  "run_id": "a1b2c3",
  "status": "running",
  "phase": "Phase 2 Code Review",
  "completed_tasks": [...],
  "failed_tasks": [],
  "output": "Code review found 1 rejection: Task 2.3 missing error handling. Spawning fixer thread..."
}
```

**Response (final)**:

```json
{
  "run_id": "a1b2c3",
  "status": "completed",
  "phase": "All phases completed",
  "completed_tasks": [
    { "id": "1.1", "name": "setup-database-schema", "branch": "a1b2c3-task-1-1-setup-database-schema" },
    { "id": "1.2", "name": "install-dependencies", "branch": "a1b2c3-task-1-2-install-dependencies" },
    { "id": "2.1", "name": "token-service", "branch": "a1b2c3-task-2-1-token-service" },
    { "id": "2.2", "name": "auth-middleware", "branch": "a1b2c3-task-2-2-auth-middleware" },
    { "id": "2.3", "name": "auth-api-endpoints", "branch": "a1b2c3-task-2-3-auth-api-endpoints" },
    { "id": "3.1", "name": "auth-context", "branch": "a1b2c3-task-3-1-auth-context" },
    { "id": "3.2", "name": "login-form", "branch": "a1b2c3-task-3-2-login-form" },
    { "id": "3.3", "name": "protected-route-wrapper", "branch": "a1b2c3-task-3-3-protected-route-wrapper" },
    { "id": "4.1", "name": "e2e-tests", "branch": "a1b2c3-task-4-1-e2e-tests" }
  ],
  "failed_tasks": [],
  "output": "Execution complete. 9 branches created and stacked. Run 'git branch | grep a1b2c3' to view."
}
```

## Step 4: Review Branches

After execution completes, review the branches:

```bash
git branch | grep a1b2c3
```

**Output**:

```
a1b2c3-task-1-1-setup-database-schema
a1b2c3-task-1-2-install-dependencies
a1b2c3-task-2-1-token-service
a1b2c3-task-2-2-auth-middleware
a1b2c3-task-2-3-auth-api-endpoints
a1b2c3-task-3-1-auth-context
a1b2c3-task-3-2-login-form
a1b2c3-task-3-3-protected-route-wrapper
a1b2c3-task-4-1-e2e-tests
```

### View Stacked Branch Structure

```bash
gs stack
```

**Output**:

```
main
└─ a1b2c3-task-1-1-setup-database-schema (1 commit)
   └─ a1b2c3-task-1-2-install-dependencies (1 commit)
      └─ a1b2c3-task-2-1-token-service (3 commits)
         ├─ a1b2c3-task-2-2-auth-middleware (2 commits)
         └─ a1b2c3-task-2-3-auth-api-endpoints (4 commits)
            └─ a1b2c3-task-3-1-auth-context (2 commits)
               ├─ a1b2c3-task-3-2-login-form (1 commit)
               └─ a1b2c3-task-3-3-protected-route-wrapper (1 commit)
                  └─ a1b2c3-task-4-1-e2e-tests (2 commits)
```

## Step 5: Create Pull Requests

Use git-spice to create PRs for each branch:

```bash
gs stack submit
```

This creates 9 pull requests, each stacked on its dependency. Reviewers can review and merge in order.

## Summary

Total time: **~2 hours** (vs 6 hours sequential)

**Key Benefits**:

- **Parallel execution**: Phase 2 (3 tasks) and Phase 3 (3 tasks) ran concurrently
- **Automatic code review**: Caught missing error handling before human review
- **Stacked branches**: Clean dependency graph for PRs
- **Git-based state**: Resumable, verifiable, no database
- **Test-driven**: Every task followed TDD pattern

**What Made This Fast**:

- Tasks 2.1, 2.2, 2.3 ran in parallel (saved ~3h)
- Tasks 3.1, 3.2, 3.3 ran in parallel (saved ~2h)
- Code review automated (saved ~1h human review time)
- No context switching (each thread isolated)

## Next Steps

- Review PRs in order
- Merge sequentially (foundation → backend → frontend → integration)
- Deploy to staging
- Verify E2E tests in staging environment

## References

- [Resume from Failure Example](resume-from-failure.md)
- [Slash Commands Documentation](../slash-commands.md)
- [Architecture Documentation](../constitutions/current/architecture.md)
