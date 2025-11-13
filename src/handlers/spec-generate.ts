/**
 * Spec generation handler for spectacular-codex MCP server.
 *
 * Generates specifications from validated brainstorming handoff packages.
 * Implements the async job pattern - returns immediately with run_id while
 * spec generation continues in background.
 *
 * @module handlers/spec-generate
 */

import { Codex } from '@openai/codex-sdk';
import type { ExecutionJob, SpecHandoffPackage } from '@/types';
import { formatMCPResponse, type MCPToolResponse } from '@/utils/mcp-response';

/**
 * Arguments for the spec-generate handler.
 */
export interface SpecGenerateArgs {
  handoff: unknown;
}

/**
 * Handles the spectacular_spec_generate MCP tool call.
 *
 * This implements the async job pattern:
 * 1. Validates handoff package
 * 2. Creates ExecutionJob in job tracker
 * 3. Starts background spec generation (non-blocking)
 * 4. Returns immediately with run_id
 *
 * @param args - Tool arguments containing handoff package
 * @param jobs - In-memory job tracker (Map of runId -> ExecutionJob)
 * @returns Promise resolving to response with run_id
 * @throws {Error} If inputs are invalid
 */
export async function handleSpecGenerate(
  args: SpecGenerateArgs,
  jobs: Map<string, ExecutionJob>
): Promise<MCPToolResponse> {
  // Validate handoff
  if (!args.handoff || typeof args.handoff !== 'object') {
    throw new Error('handoff is required and must be an object');
  }

  const handoff = args.handoff as SpecHandoffPackage;

  // Validate required fields
  if (!handoff.runId || typeof handoff.runId !== 'string') {
    throw new Error('handoff.runId is required');
  }
  if (!handoff.feature || typeof handoff.feature !== 'string') {
    throw new Error('handoff.feature is required');
  }
  if (!handoff.requirements) {
    throw new Error('handoff.requirements is required');
  }

  const runId = handoff.runId;

  // Create job tracker
  const job: ExecutionJob = {
    phase: 0, // Phase 0 for spec generation (pre-implementation)
    runId,
    startedAt: new Date(),
    status: 'running',
    tasks: [],
    totalPhases: 0, // Spec generation doesn't have phases
  };

  jobs.set(runId, job);

  // Generate spec in background (non-blocking)
  generateSpec(handoff, job).catch((error) => {
    job.status = 'failed';
    job.error = String(error);
    job.completedAt = new Date();
  });

  // Return immediately (MCP format)
  return formatMCPResponse({
    message: `
Spec generation started for: ${handoff.feature}

The background thread will:
1. Create worktree at .worktrees/${runId}-main/
2. Install dependencies
3. Generate spec.md from validated requirements
4. Validate architecture quality
5. Commit to branch

Use spectacular_status to check progress:
  { "run_id": "${runId}" }
    `.trim(),
    run_id: runId,
    status: 'started',
  });
}

/**
 * Generates spec in the background using Codex thread.
 *
 * This function runs in the background after handleSpecGenerate returns.
 * It spawns a Codex thread with the spec generation prompt.
 *
 * @param handoff - Validated requirements from brainstorming
 * @param job - Job tracker to update with progress
 */
async function generateSpec(handoff: SpecHandoffPackage, job: ExecutionJob): Promise<void> {
  try {
    // Generate prompt with validated requirements
    const prompt = generateSpecFromHandoffPrompt(handoff);

    // Spawn Codex thread with prompt
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: process.cwd(),
    });
    const result = await thread.run(prompt);

    // Parse SPEC_PATH from result finalResponse
    // Expected format: "SPEC: specs/abc123-feature/spec.md"
    const specPathMatch = result.finalResponse.match(/SPEC:\s*(.+\.md)/);
    const specPath = specPathMatch?.[1];

    // Update job with completion status
    job.status = 'completed';
    job.completedAt = new Date();

    // Store spec path in error field (reusing existing field for output)
    if (specPath) {
      job.error = `Spec generated at ${specPath}`;
    }
  } catch (error) {
    // Handle errors in background execution
    job.status = 'failed';
    job.error = String(error instanceof Error ? error.message : error);
    job.completedAt = new Date();
  }
}

/**
 * Generates prompt for Codex thread to create spec from handoff package.
 *
 * @param handoff - Validated requirements from brainstorming
 * @returns Complete prompt with embedded instructions
 */
function generateSpecFromHandoffPrompt(handoff: SpecHandoffPackage): string {
  return `
You are generating a feature specification from validated requirements.

The user has completed interactive brainstorming and validated the design.
Your job is to create the spec in an isolated worktree.

## Validated Requirements

**Feature**: ${handoff.feature}
**Run ID**: ${handoff.runId}
**Original Request**: ${handoff.featureRequest}

### Functional Requirements
${handoff.requirements.functional.map((req) => `- ${req}`).join('\n')}

### Non-Functional Requirements
${handoff.requirements.nonFunctional.map((req) => `- ${req}`).join('\n')}

### Acceptance Criteria
${handoff.requirements.acceptanceCriteria.map((crit) => `- ${crit}`).join('\n')}

## Architectural Decisions

**Approach**: ${handoff.architecture.approach}

**Layers**: ${handoff.architecture.layers.join(', ')}

**Patterns**: ${handoff.architecture.patterns.join(', ')}

**Tech Stack**: ${handoff.architecture.techStack.join(', ')}

## Decision Rationale

${handoff.decisions
  .map((d) =>
    `
**Q**: ${d.question}
**A**: ${d.choice}
**Why**: ${d.rationale}
`.trim()
  )
  .join('\n\n')}

## Out of Scope

${handoff.outOfScope.map((item) => `- ${item}`).join('\n')}

## Your Tasks

### 1. Create Worktree

\`\`\`bash
# Create branch using git-spice
gs branch create ${handoff.runId}-main -m "spec: ${handoff.feature}"

# Create worktree
git worktree add .worktrees/${handoff.runId}-main ${handoff.runId}-main
\`\`\`

### 2. Install Dependencies

\`\`\`bash
cd .worktrees/${handoff.runId}-main

# Check CLAUDE.md for install command
# Look for: - **install**: \`bun install\`
# Run the install command found in CLAUDE.md

# Check for postinstall command (if present)
# Look for: - **postinstall**: \`npx prisma generate\`
# Run postinstall if defined
\`\`\`

### 3. Generate Spec

Create: \`.worktrees/${handoff.runId}-main/specs/${handoff.runId}-${handoff.feature}/spec.md\`

**Spec Format**:

\`\`\`markdown
---
runId: ${handoff.runId}
feature: ${handoff.feature}
created: $(date +%Y-%m-%d)
status: draft
---

# ${handoff.feature}

## Summary

[2-3 sentences describing the feature based on requirements]

## Requirements

[Format the functional, non-functional, and acceptance criteria in clear sections]

## Architecture

[Explain how this fits into the codebase architecture]
- Reference layers: ${handoff.architecture.layers.join(', ')}
- Patterns used: ${handoff.architecture.patterns.join(', ')}
- Tech stack: ${handoff.architecture.techStack.join(', ')}

## Implementation Notes

[Key technical decisions from brainstorming]
${handoff.decisions.map((d) => `- ${d.question}: ${d.choice} (${d.rationale})`).join('\n')}

## Acceptance Criteria

[How to verify completion]

## Out of Scope

[Explicitly state what won't be built]
${handoff.outOfScope.join('\n')}
\`\`\`

**Important**:
- Keep spec lean (reference constitutions, don't duplicate)
- Link to external docs instead of embedding examples
- Focus on WHAT/WHY, not HOW (implementation plans come later)

### 4. Validate Architecture Quality

Read the generated spec and validate:
- [ ] Constitution compliance (architecture.md, patterns.md, tech-stack.md)
- [ ] No duplication (constitution rules referenced, not recreated)
- [ ] No code examples (docs linked, not embedded)
- [ ] Lean (< 300 lines)
- [ ] Clear requirements (no vague terms like "fast" or "good")
- [ ] Testable acceptance criteria

If validation fails, fix the issues.

### 5. Commit

\`\`\`bash
cd .worktrees/${handoff.runId}-main
git add specs/
git commit -m "spec: add ${handoff.feature} specification [${handoff.runId}]"
\`\`\`

### 6. Detach HEAD

\`\`\`bash
git switch --detach
\`\`\`

### 7. Report Completion

Output the spec path in this exact format:

\`\`\`
SPEC: specs/${handoff.runId}-${handoff.feature}/spec.md
\`\`\`

Begin.
`.trim();
}
