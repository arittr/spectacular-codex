/**
 * Spec generator prompt template generator.
 *
 * Generates prompts for Codex threads to generate feature specifications through
 * brainstorming. Skills are embedded inline (not referenced as external files)
 * because Codex threads don't have access to spectacular skill files.
 *
 * @module prompts/spec-generator
 */

/**
 * Generates a prompt for spec generation with embedded brainstorming skill instructions.
 *
 * Embeds instructions from:
 * - brainstorming skill (3-phase process: understanding, exploration, design)
 *
 * @param featureRequest - Feature description from user
 * @param runId - Unique run identifier (6-char hex)
 * @returns Complete prompt with embedded brainstorming skill instructions
 */
export function generateSpecPrompt(featureRequest: string, runId: string): string {
  return `
You are generating a feature specification through brainstorming.

## Feature Request

${featureRequest}

## Your Process

Follow the **brainstorming** skill (3-phase process):

### Phase 1: Understanding

**Goal:** Clarify the feature request and identify constraints.

1. **Ask clarifying questions** (internal reasoning):
   - What problem does this solve?
   - Who are the users?
   - What are the edge cases?
   - What are performance requirements?
   - What are security considerations?

2. **Understand constraints**:
   - Read constitution at docs/constitutions/current/
     - architecture.md - Layer boundaries and module structure
     - patterns.md - Mandatory coding patterns
     - tech-stack.md - Technology decisions
   - Identify technical constraints
   - Consider existing architecture

3. **Identify requirements**:
   - Functional requirements (what must it do?)
   - Non-functional requirements (performance, security, UX)
   - Acceptance criteria (how do we know it's done?)

### Phase 2: Exploration

**Goal:** Consider alternatives and evaluate trade-offs.

1. **Consider alternatives**:
   - What are different ways to solve this?
   - What are pros/cons of each approach?
   - Which approach aligns with constitution?

2. **Evaluate trade-offs**:
   - Complexity vs maintainability
   - Performance vs simplicity
   - Features vs scope
   - Time vs quality

3. **Reference constitution**:
   - Does approach fit 4-layer architecture?
   - Does it follow mandatory patterns?
   - Is it consistent with tech stack?

### Phase 3: Design

**Goal:** Finalize specification document.

1. **Create spec directory**:
   - Generate feature slug from feature request (kebab-case, 2-4 words)
   - Create directory: specs/${runId}-{feature-slug}/
   - Create file: specs/${runId}-{feature-slug}/spec.md

2. **Write lean spec**:
   - **Run ID**: ${runId}
   - **Feature**: {feature-slug}
   - **Summary**: 2-3 sentences describing the feature
   - **Requirements**: Bulleted list of what must be built
   - **Architecture**: How it fits into constitution (reference layers/modules)
   - **Implementation Notes**: Key technical decisions
   - **Acceptance Criteria**: How to verify completion
   - **Out of Scope**: What explicitly won't be built

3. **Lean spec principles**:
   - Reference constitutions heavily (don't duplicate content)
   - Link to external docs instead of embedding examples
   - Focus on WHAT not HOW (implementation plans come later)
   - Keep it concise (1-2 pages)

### 4. Report Completion

Output the spec path in this exact format:

\`\`\`
SPEC_PATH: specs/${runId}-{feature-slug}/spec.md
\`\`\`

The handler will parse this output to extract the spec path.

## Important Notes

**Constitution Compliance:**
- Read docs/constitutions/current/ before designing
- Ensure feature aligns with architecture.md
- Follow patterns.md mandatory patterns
- Use tech-stack.md approved technologies

**Brainstorming Quality:**
- Ask good questions in Phase 1
- Consider multiple alternatives in Phase 2
- Make informed decisions (not arbitrary choices)
- Document rationale for decisions

**Spec Quality:**
- Lean (reference, don't duplicate)
- Clear requirements and acceptance criteria
- Architectural alignment documented
- Out of scope explicitly stated

## Ready?

Generate the spec for: ${featureRequest}

Follow the 3-phase brainstorming process above. Start by understanding requirements and constraints.
`.trim();
}
