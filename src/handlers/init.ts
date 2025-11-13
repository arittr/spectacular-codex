/**
 * Init handler for spectacular-codex MCP server.
 *
 * Installs the /spectacular:spec slash command to ~/.codex/prompts/
 *
 * @module handlers/init
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionJob } from '@/types';
import { formatMCPResponse, type MCPToolResponse } from '@/utils/mcp-response';

/**
 * Arguments for the init handler.
 */
export interface InitArgs {
  force?: unknown;
}

/**
 * The spectacular:spec slash command template.
 *
 * This embeds the full brainstorming workflow from spectacular/commands/spec.md
 * and calls spectacular_spec_generate at the end.
 */
const SLASH_COMMAND_TEMPLATE = `---
description: Generate feature spec through interactive brainstorming
---

You are creating a feature specification with interactive brainstorming.

## Input

Feature description: $1

## Process

### Step 0: Generate RUN_ID

**First action**: Generate a unique run identifier for this spec.

Execute this bash command to generate the run ID from the feature description:

\`\`\`bash
# Generate 6-char hash from feature name + timestamp
FEATURE_DESC="$1"
TIMESTAMP=$(date +%s)
RUN_ID=$(echo "\${FEATURE_DESC}-\${TIMESTAMP}" | shasum -a 256 | head -c 6)
echo "Generated RUN_ID: \${RUN_ID}"
\`\`\`

**CRITICAL**:
- Execute this entire block as a single Bash tool call
- The comment on line 1 prevents parse errors with command substitution
- Store the RUN_ID from the output for use in subsequent steps

**Announce**: "Generated RUN_ID: {run-id} for tracking this spec run"

### Step 1: Interactive Brainstorming

**Announce**: "I'm brainstorming the design using Phases 1-3 (Understanding, Exploration, Design Presentation)."

**Create TodoWrite checklist**:

\`\`\`
Brainstorming for Spec:
- [ ] Phase 1: Understanding (purpose, constraints, criteria)
- [ ] Phase 2: Exploration (2-3 approaches proposed)
- [ ] Phase 3: Design Presentation (design validated)
- [ ] Proceed to Step 2: Call MCP Tool
\`\`\`

#### Phase 1: Understanding

**Goal**: Clarify scope, constraints, and success criteria.

1. Ask ONE question at a time to refine the idea
2. Use AskUserQuestion tool for multiple choice options
3. Gather:
   - **Purpose**: What problem does this solve?
   - **Constraints**: Performance, security, technical limits
   - **Success criteria**: How do we know it's done?

**IMPORTANT**: Keep questions focused and actionable. Prefer multiple choice when possible.

#### Phase 2: Exploration

**Goal**: Propose and evaluate 2-3 architectural approaches.

1. Propose 2-3 different approaches
2. For each approach explain:
   - Core architecture (layers, patterns)
   - Trade-offs (complexity vs features)
   - Pros and cons
3. Use AskUserQuestion tool to present approaches as structured choices
4. Ask partner which approach resonates

#### Phase 3: Design Presentation

**Goal**: Present detailed design incrementally and validate.

1. Present design in 200-300 word sections
2. Cover: Architecture, components, data flow, error handling, testing
3. After each section ask: "Does this look right so far?" (open-ended)
4. Adjust design based on feedback

**After Phase 3**: Mark TodoWrite complete and proceed immediately to Step 2.

### Step 2: Call MCP Tool for Generation

**Announce**: "Brainstorming complete! Calling spectacular_spec_generate to create the spec in a worktree..."

Call the MCP tool with the validated requirements:

\`\`\`json
{
  "tool": "spectacular_spec_generate",
  "handoff": {
    "runId": "<the-run-id-from-step-0>",
    "feature": "<kebab-case-feature-slug>",
    "featureRequest": "$1",
    "requirements": {
      "functional": ["List", "of", "functional", "requirements"],
      "nonFunctional": ["Performance", "security", "UX", "requirements"],
      "acceptanceCriteria": ["How", "we", "verify", "completion"]
    },
    "architecture": {
      "approach": "Selected approach name",
      "layers": ["UI", "Actions", "Services"],
      "patterns": ["next-safe-action", "ts-pattern"],
      "techStack": ["Library1", "Library2"]
    },
    "decisions": [
      {
        "question": "Question asked during brainstorming",
        "choice": "User's answer",
        "rationale": "Why this choice makes sense"
      }
    ],
    "outOfScope": ["Things", "we", "explicitly", "won't", "build"]
  }
}
\`\`\`

### Step 3: Poll for Completion

Use spectacular_status to check when spec generation completes:

\`\`\`json
{
  "tool": "spectacular_status",
  "run_id": "<the-run-id>"
}
\`\`\`

When status is "completed", announce the spec location and next steps.
`;

/**
 * Handles the spectacular_init MCP tool call.
 *
 * Installs the /spectacular:spec slash command to ~/.codex/prompts/
 *
 * @param args - Tool arguments
 * @param jobs - In-memory job tracker (unused)
 * @returns Promise resolving to installation status
 */
export async function handleInit(
  args: InitArgs,
  _jobs: Map<string, ExecutionJob>
): Promise<MCPToolResponse> {
  const force = args.force === true || args.force === 'true';

  try {
    // Determine target path
    const promptsDir = join(homedir(), '.codex', 'prompts');
    // Use 'spectacular:spec.md' to create /spectacular:spec command
    const targetPath = join(promptsDir, 'spectacular:spec.md');

    // Check if already exists
    const exists = await fs
      .access(targetPath)
      .then(() => true)
      .catch(() => false);

    if (exists && !force) {
      return formatMCPResponse({
        message: 'Slash command already installed. Use { "force": true } to overwrite.',
        path: targetPath,
        status: 'already_installed',
      });
    }

    // Ensure directory exists
    await fs.mkdir(promptsDir, { recursive: true });

    // Write slash command file
    await fs.writeFile(targetPath, SLASH_COMMAND_TEMPLATE, 'utf-8');

    return formatMCPResponse({
      message: `
✅ Successfully installed /spectacular:spec slash command!

Location: ${targetPath}

You can now use it in Codex CLI:
  /spectacular:spec mobile optimization
  /spectacular:spec magic link authentication
  /spectacular:spec real-time reactions

The command will:
1. Guide you through interactive brainstorming (3 phases)
2. Generate spec in isolated worktree (async)
3. Validate architecture quality
      `.trim(),
      path: targetPath,
      status: 'installed',
    });
  } catch (error) {
    return formatMCPResponse({
      error: String(error instanceof Error ? error.message : error),
      message: 'Failed to install slash command. Check permissions and try again.',
      status: 'failed',
    });
  }
}
