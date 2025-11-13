/**
 * Code reviewer prompt template generator.
 *
 * Generates prompts for Codex threads to review phase implementations with embedded
 * skill instructions. Reviews include binary verdict (APPROVED/REJECTED) and detailed
 * reasoning.
 *
 * Skills embedded inline (not referenced as external files):
 * - requesting-code-review skill (review checklist)
 * - verification-before-completion skill (quality gates)
 *
 * @module prompts/code-reviewer
 */

import type { Phase, Plan } from '../types.js';

/**
 * Generates a prompt for code review with embedded skill instructions.
 *
 * Embeds instructions from:
 * - requesting-code-review skill (review checklist, constitutional compliance)
 * - verification-before-completion skill (quality gates, test verification)
 *
 * @param phase - Phase to review (contains tasks that were executed)
 * @param plan - Implementation plan containing runId and feature slug
 * @returns Complete prompt with embedded skill instructions and binary verdict format
 */
export function generateReviewPrompt(phase: Phase, plan: Plan): string {
  const taskIds = phase.tasks.map((task) => task.id).join(', ');
  const taskList = phase.tasks
    .map((task) => `- **Task ${task.id}**: ${task.name}\n  Files: ${task.files.join(', ')}`)
    .join('\n');

  return `
# Code Review: Phase ${phase.id}

## Phase Context

- **Phase ${phase.id}**: ${phase.name}
- **Strategy**: ${phase.strategy}
- **Run ID**: ${plan.runId}
- **Tasks**: ${taskIds}

## Tasks to Review

${taskList}

## Review Checklist

You must verify the following (from requesting-code-review and verification-before-completion skills):

### 1. Constitutional Compliance

Verify all changes respect the architectural constraints:

- **4-layer architecture boundaries respected**
  - Handlers delegate to orchestrators
  - Orchestrators spawn Codex threads
  - Utils are pure functions
  - Git branches are state layer

- **Async job pattern** (if applicable)
  - MCP tool handlers return immediately
  - Execution happens in background
  - Job state tracked in-memory

- **Promise.all() for parallel execution** (if applicable)
  - Parallel tasks use Promise.all()
  - No sequential loops for parallel work

- **Skills embedded inline in prompts**
  - Prompt templates embed skill instructions
  - No references to external skill files

- **Git-based state**
  - Branches are source of truth
  - No database for task completion
  - Branch naming follows pattern: ${plan.runId}-task-{id}-{name}

- **Pure utility functions**
  - Utils are stateless
  - No side effects beyond shell commands
  - Testable and predictable

### 2. TypeScript Strict Mode

- **All strict flags satisfied**
  - No \`any\` types (use proper type annotations or union types)
  - Proper null/undefined handling (noUncheckedIndexedAccess)
  - No implicit overrides (noImplicitOverride)
  - Exact optional properties (exactOptionalPropertyTypes)

### 3. Code Quality

- **Functions focused and single-purpose**
  - Each function does one thing well
  - Clear naming and intent

- **Clear separation of concerns**
  - Handlers vs orchestrators vs utils boundaries
  - No business logic in handlers

- **Proper error handling**
  - Errors propagated correctly
  - Meaningful error messages

### 4. Tests

Run verification commands (verification-before-completion skill):

\`\`\`bash
# All tests must pass
pnpm test

# Type checking must pass
pnpm check-types
\`\`\`

**Required:**
- All tests pass: \`pnpm test\`
- Type checking passes: \`pnpm check-types\`
- Coverage for new code (unit tests for pure functions)

## Your Task

1. **Review all changes in Phase ${phase.id}**
   - Examine code for each task
   - Check against constitutional patterns
   - Run quality checks

2. **Provide BINARY VERDICT**

## Required Output Format

You must output one of these two verdicts:

**VERDICT: APPROVED**

or

**VERDICT: REJECTED**

**Reasoning**:
- List all issues found (if any)
- For each issue, provide:
  - **severity**: blocking (prevents merge) or warning (should fix)
  - **location**: file:line or file name
  - **Issue**: what is wrong
  - **required fix**: specific actionable fix

## Examples

### Example: Approved

\`\`\`
VERDICT: APPROVED

**Reasoning**:
- All tests pass (pnpm test)
- Type checking passes (pnpm check-types)
- Constitutional compliance verified
- Code quality is excellent
\`\`\`

### Example: Rejected

\`\`\`
VERDICT: REJECTED

**Reasoning**:
1. **[BLOCKING]** TypeScript Error - src/prompts/code-reviewer.ts:42
   - Issue: Missing return type annotation
   - Fix: Add \`: string\` return type to generateReviewPrompt

2. **[BLOCKING]** Test Failure - code-reviewer.test.ts
   - Issue: Tests fail with "Expected binary verdict format not found"
   - Fix: Update prompt to include "VERDICT: APPROVED" format

3. **[WARNING]** Code Quality - src/orchestrator/code-review.ts:67
   - Issue: Nested conditionals exceed 3 levels deep
   - Fix: Extract nested logic into separate function
\`\`\`

## Important Notes

**If REJECTED**, provide specific actionable fixes for each issue. The fixer thread will use your reasoning to address all problems.

**Focus on constitutional compliance first**, then code quality, then minor issues. Blocking issues prevent merge and must be fixed.

**Be thorough but fair**. The goal is to maintain quality, not to block progress unnecessarily.

## Ready?

Review Phase ${phase.id} (tasks: ${taskIds}) and provide your binary verdict.
`.trim();
}
