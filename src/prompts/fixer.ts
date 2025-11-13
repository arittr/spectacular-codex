/**
 * Fixer prompt template generator.
 *
 * Generates prompts for Codex threads to fix code review issues with embedded
 * skill instructions. Includes scope creep detection to prevent feature additions.
 *
 * Skills embedded inline (not referenced as external files):
 * - receiving-code-review skill (fix strategy, scope detection)
 * - verification-before-completion skill (quality gates)
 *
 * @module prompts/fixer
 */

import type { Plan } from '@/types';

/**
 * Generates a prompt for fixing code review issues with embedded skill instructions.
 *
 * Embeds instructions from:
 * - receiving-code-review skill (fix strategy, scope creep detection)
 * - verification-before-completion skill (quality gates, test verification)
 *
 * @param reviewResult - Review result from code reviewer (includes rejection reasons)
 * @param plan - Implementation plan containing runId and feature slug
 * @returns Complete prompt with embedded skill instructions and fix strategy
 */
export function generateFixerPrompt(reviewResult: string, plan: Plan): string {
  return `
# Fix Code Review Issues

## Review Rejection Reasons

${reviewResult}

## Your Task

Fix **ALL** issues mentioned in the review above.

## Fix Strategy

Follow these steps (from receiving-code-review skill):

### 1. Address each issue systematically

- **Start with blocking issues first**
  - These prevent merge and must be fixed
  - Usually: failing tests, TypeScript errors, constitutional violations

- **Then fix warnings**
  - Code quality improvements
  - Minor issues that don't block merge

### 2. Scope Creep Detection (CRITICAL)

**DO NOT add new features**
- You are ONLY fixing the specific issues mentioned in the review
- DO NOT implement tasks from other phases
- DO NOT add functionality beyond what was originally intended
- ONLY fix the specific issues mentioned

**Examples of scope creep (FORBIDDEN):**
- Adding new functions not mentioned in original task
- Implementing features from future tasks
- Refactoring unrelated code
- Adding new dependencies not needed for fixes

**Valid fixes:**
- Correcting TypeScript errors
- Fixing failing tests
- Adjusting code to meet constitutional patterns
- Improving code quality as specifically requested

### 3. Quality Checks

After fixing each issue, verify the fix:

\`\`\`bash
# Run tests
pnpm test

# Type checking
pnpm check-types

# Verify all issues resolved
\`\`\`

**All quality checks must pass** before reporting completion.

## Fix Workflow

1. **Read the rejection reasons carefully**
   - Understand each issue
   - Identify blocking vs warning issues

2. **Fix blocking issues first**
   - Address TypeScript errors
   - Fix failing tests
   - Correct constitutional violations

3. **Fix warnings**
   - Improve code quality
   - Address minor issues

4. **Verify all fixes**
   - Run \`pnpm test\` - must pass
   - Run \`pnpm check-types\` - must pass
   - Confirm all issues from review are resolved

5. **Report completion**

## Required Output

After fixing all issues, Report what you fixed and confirmation that tests pass:

\`\`\`
Fixed Issues:
1. [Issue description] - [What you did to fix it]
2. [Issue description] - [What you did to fix it]
...

Quality Checks:
- ✅ Tests pass (pnpm test)
- ✅ Type checking passes (pnpm check-types)
- ✅ All review issues resolved
\`\`\`

## Important Notes

**Scope discipline is critical.** If you find yourself adding features, stop immediately. You are ONLY fixing the specific issues mentioned in the code review.

**Focus on minimal fixes.** The smallest change that addresses the issue is the best fix.

**Run quality checks frequently.** Don't wait until all fixes are done to run tests. Verify each fix incrementally.

## Context

- **Run ID**: ${plan.runId}
- **Feature**: ${plan.featureSlug}

## Ready?

Fix all issues from the code review above. Remember: ONLY fix what was mentioned, DO NOT add features.
`.trim();
}
