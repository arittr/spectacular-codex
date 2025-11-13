/**
 * Task executor prompt template generator.
 *
 * Generates prompts for Codex threads to execute tasks with embedded skill instructions.
 * Skills are embedded inline (not referenced as external files) because Codex threads
 * don't have access to spectacular skill files.
 *
 * @module prompts/task-executor
 */

import type { Plan, Task } from '../types.js';

/**
 * Quality check commands for task implementation.
 */
export interface QualityChecks {
  /** Test command (e.g., "pnpm test") */
  test: string;
  /** Type checking command (e.g., "pnpm check-types") */
  typeCheck: string;
  /** Linting command (e.g., "pnpm biome check --write .") */
  lint: string;
}

/**
 * Generates a prompt for task execution with embedded skill instructions.
 *
 * Embeds instructions from:
 * - test-driven-development skill (TDD workflow)
 * - phase-task-verification skill (git operations, branch creation)
 *
 * @param task - Task to execute
 * @param plan - Implementation plan containing runId and feature slug
 * @param qualityChecks - Commands for running tests, type checks, and linting
 * @returns Complete prompt with embedded skill instructions
 */
export function generateTaskPrompt(task: Task, plan: Plan, qualityChecks: QualityChecks): string {
  const worktreePath = `.worktrees/${plan.runId}-task-${task.id}`;
  const specPath = `specs/${plan.runId}-${plan.featureSlug}/spec.md`;
  const branchPrefix = `${plan.runId}-task-${task.id}`;
  const taskNumber = task.id.replace('-', '.');

  return `
You are implementing Task ${task.id}: ${task.name}

## Task Context

**Description:** ${task.description}

**Files to create/modify:**
${task.files.map((file) => `- ${file}`).join('\n')}

**Acceptance Criteria:**
${task.acceptanceCriteria.map((criteria) => `- [ ] ${criteria}`).join('\n')}

## Your Process

Follow these steps exactly (from phase-task-verification and test-driven-development skills):

### 1. Navigate to Worktree

\`\`\`bash
cd ${worktreePath}
\`\`\`

### 2. Read Context

Before implementing, read the following context files:

- **Feature Specification:** ${specPath}
- **Constitution:** docs/constitutions/current/
  - architecture.md - Layer boundaries and module structure
  - patterns.md - Mandatory coding patterns
  - tech-stack.md - Technology decisions

### 3. Implement Task (TDD)

Follow **test-driven-development** skill:

1. **Write test first** - Create test file with failing test cases
2. **Watch it fail** - Run test, verify failure with clear error
3. **Write minimal code to pass** - Implement just enough to make test pass
4. **Watch it pass** - Run test, verify success
5. **Refactor if needed** - Improve code while keeping tests green

**TDD Cycle:**

\`\`\`bash
# RED: Write failing test
${qualityChecks.test} src/prompts/task-executor.test.ts

# GREEN: Write minimal implementation
# (implement code here)

# Verify test passes
${qualityChecks.test} src/prompts/task-executor.test.ts
\`\`\`

### 4. Run Quality Checks

Run all quality checks before committing:

\`\`\`bash
bash <<'EOF'
# Run tests
${qualityChecks.test}
if [ $? -ne 0 ]; then
  echo "❌ Tests failed"
  exit 1
fi

# Type checking
${qualityChecks.typeCheck}
if [ $? -ne 0 ]; then
  echo "❌ Type checking failed"
  exit 1
fi

# Linting
${qualityChecks.lint}
if [ $? -ne 0 ]; then
  echo "❌ Linting failed"
  exit 1
fi

echo "✅ All quality checks passed"
EOF
\`\`\`

### 5. Create Branch (phase-task-verification skill)

Use **phase-task-verification** skill for git operations:

\`\`\`bash
# Stage all changes
git add .

# Create branch with git-spice
gs branch create ${branchPrefix}-{name} -m "[Task ${taskNumber}] ${task.name}"

# Commit implementation
git commit -m "feat: ${task.name}

${task.description}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
\`\`\`

**Branch naming pattern:** ${branchPrefix}-{descriptive-name}
- Example: ${branchPrefix}-task-executor-prompt
- Keep name short and descriptive (kebab-case)

### 6. Detach HEAD (CRITICAL)

**IMPORTANT:** Detach HEAD so parallel orchestrator can clean up worktree:

\`\`\`bash
git switch --detach
\`\`\`

**Why detach?** Worktrees with checked-out branches cannot be removed. Detaching HEAD allows cleanup after branch stacking.

### 7. Report completion

Output the branch name in this exact format:

\`\`\`
BRANCH: {branch-name}
\`\`\`

The orchestrator will parse this output to extract the branch name for stacking.

## Important Notes

**Constitution Compliance:**
- Follow strict TypeScript mode (no \`any\`, use union types)
- Pure utility functions (stateless, no side effects)
- Embedded skill instructions (don't reference external skill files)
- Git-based state (branches are source of truth)

**Testing:**
- Unit tests for pure functions (prompts, utils)
- Integration tests for orchestration (with mocked Codex SDK)
- All tests must pass before creating branch

**Error Handling:**
- If quality checks fail, fix before committing
- If tests don't pass, implementation is incomplete
- Never create branch with failing tests

## Ready?

Implement Task ${task.id} following the TDD cycle above. Start by writing tests, watch them fail, then implement minimal code to pass.
`.trim();
}
