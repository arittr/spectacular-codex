/**
 * Plan generator prompt template generator.
 *
 * Generates prompts for Codex threads to decompose specs into executable plans.
 * Embeds instructions from the decomposing-tasks skill inline.
 *
 * @module prompts/plan-generator
 */

/**
 * Generates a prompt for plan generation with embedded decomposing-tasks skill instructions.
 *
 * Embeds instructions for:
 * - Task extraction from spec
 * - Dependency analysis (file overlaps)
 * - Phase grouping (sequential vs parallel)
 * - Validation rules (no XL tasks, explicit files)
 *
 * @param specPath - Path to the feature specification (e.g., "specs/abc123-feature/spec.md")
 * @param runId - Unique run identifier (6-char hex)
 * @returns Complete prompt with embedded decomposing-tasks skill instructions
 */
export function generatePlanPrompt(specPath: string, runId: string): string {
  const featureSlug = specPath
    .replace('specs/', '')
    .replace('/spec.md', '')
    .replace(`${runId}-`, '');
  const planPath = `specs/${runId}-${featureSlug}/plan.md`;

  return `
# Plan Generation for ${specPath}

You are generating an implementation plan from a feature specification.

## Your Process (from decomposing-tasks skill)

Follow the **decomposing-tasks** skill methodology:

### 1. Extract Tasks

Read the spec at ${specPath} and identify implementation tasks:

\`\`\`bash
# Read the spec
cat ${specPath}

# Also read the constitution for context
cat docs/constitutions/current/architecture.md
cat docs/constitutions/current/patterns.md
\`\`\`

**Task Extraction Rules:**

- **NO XL tasks** - Break down tasks larger than 8 hours
- **Explicit files** - Every task must list files it creates/modifies
- **Clear acceptance criteria** - Each task must have testable criteria
- **Size estimation** - Use XS (<1h), S (1-2h), M (2-4h), L (4-8h)

**Break down large tasks:**
- XL (>8h) tasks must be split into multiple smaller tasks
- Each task should be independently testable
- Aim for tasks that take 2-4 hours (M complexity)

### 2. Analyze Dependencies

Check file overlaps between tasks to determine dependencies:

**Dependency Analysis:**

- **Same files = sequential** - Tasks touching the same files must run one after another
- **Independent files = can be parallel** - Tasks with no file overlap can run concurrently
- **Logical dependencies** - Task B depends on Task A if it needs A's output

**File Overlap Example:**
\`\`\`
Task 1: src/utils/parser.ts, src/utils/parser.test.ts
Task 2: src/handlers/plan.ts, src/handlers/plan.test.ts
→ No overlap, can be parallel
\`\`\`

### 3. Group into Phases

Organize tasks into phases based on dependencies:

**Phase Strategy:**

- **Parallel phases** - Use \`Promise.all()\` for tasks with no file overlaps
  - All tasks in phase execute concurrently
  - Faster execution time
  - Example: Creating multiple independent modules

- **Sequential phases** - Tasks run one-by-one when there are dependencies
  - Tasks build on each other
  - Use git-spice natural stacking
  - Example: Foundation → Features → Integration

**Stacking with git-spice:**

- Parallel tasks: Each gets isolated worktree, branches stacked after completion
- Sequential tasks: Build on each other in main worktree using \`gs branch create\`

### 4. Output Plan

Create ${planPath} with the following structure:

\`\`\`markdown
# Implementation Plan: {Feature Name}

**Run ID:** ${runId}
**Feature Slug:** ${featureSlug}
**Stacking Backend:** git-spice

## Phase 1: {Phase Name} (parallel|sequential)

**Strategy:** parallel|sequential
**Description:** What this phase accomplishes

### Task 1-1: {Task Name} (XS|S|M|L)

**Description:** What this task does

**Files:**
- path/to/file1.ts
- path/to/file2.test.ts

**Dependencies:** None (or list task IDs)

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

---

### Task 1-2: {Task Name} (S)

...

## Phase 2: {Phase Name} (sequential)

...
\`\`\`

**Plan Structure Rules:**

1. **Phase numbering** - Start at 1, increment sequentially
2. **Task numbering** - Format: \`{phase}-{task}\` (e.g., "1-1", "2-3")
3. **Complexity labels** - XS, S, M, or L (no XL allowed)
4. **Explicit files** - Every task must list files it modifies/creates
5. **Clear dependencies** - List task IDs or "None"
6. **Testable criteria** - Each criterion must be verifiable

### 5. Validate Plan

Before saving, verify:

- [ ] **No XL tasks** - All tasks are L or smaller
- [ ] **Explicit files** - Every task lists files
- [ ] **Clear dependencies** - Dependencies are documented
- [ ] **Phase strategy** - Parallel phases have no file overlaps
- [ ] **Sequential phases** - Tasks with dependencies are sequential
- [ ] **Acceptance criteria** - All tasks have testable criteria

## Time Calculation

Calculate expected completion time:

- **Parallel phases:** Time = max(task durations)
- **Sequential phases:** Time = sum(task durations)

**Example:**
\`\`\`
Phase 1 (parallel): Task 1-1 (2h), Task 1-2 (4h) → 4h total
Phase 2 (sequential): Task 2-1 (2h), Task 2-2 (3h) → 5h total
Total: 4h + 5h = 9h
\`\`\`

## Important Notes

**Constitution Compliance:**
- Follow strict TypeScript mode (no \`any\`, use union types)
- Pure utility functions (stateless, no side effects)
- Embedded skill instructions (don't reference external files)
- Git-based state (branches are source of truth)

**File Naming:**
- Tests: \`{module}.test.ts\` alongside implementation
- Utils: Pure functions in \`src/utils/\`
- Handlers: Tool handlers in \`src/handlers/\`
- Prompts: Template generators in \`src/prompts/\`

**git-spice Stacking:**
- Parallel phases: Isolated worktrees, linear stacking after completion
- Sequential phases: Natural stacking in main worktree with \`gs branch create\`
- All branches follow pattern: \`${runId}-task-{phase}-{task}-{name}\`

## Ready?

Analyze the spec at ${specPath} and generate the implementation plan at ${planPath}.

**Steps:**
1. Read spec and extract tasks
2. Analyze file dependencies
3. Group into phases (parallel/sequential)
4. Write plan.md with structured format
5. Validate (no XL tasks, explicit files, clear criteria)

Output the plan path when complete:

\`\`\`
PLAN: ${planPath}
\`\`\`
`.trim();
}
