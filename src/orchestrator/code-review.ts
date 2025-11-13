/**
 * Code review orchestrator for spectacular-codex.
 *
 * Implements review → fix → re-review loop in a single Codex thread to preserve
 * conversation context. Enforces max 3 rejections before escalation.
 *
 * The review loop:
 * 1. Generate and run code review prompt
 * 2. Parse verdict (approved/rejected)
 * 3. If approved: return success
 * 4. If rejected: increment counter, run fixer prompt, goto step 1
 * 5. If rejections > 3: throw error
 *
 * @module orchestrator/code-review
 */

import { Codex } from '@openai/codex-sdk';
import type { Phase, Plan } from '../types.js';

/**
 * Maximum number of rejections before escalation.
 * After 3 rejections, the review loop throws an error.
 */
const MAX_REJECTIONS = 3;

/**
 * Code review verdict.
 * - approved: Code meets all requirements, ready to merge
 * - rejected: Code has issues that must be fixed
 */
export type ReviewVerdict = 'approved' | 'rejected';

/**
 * Parse verdict from code review result.
 *
 * Looks for "VERDICT: APPROVED" or "VERDICT: REJECTED" in the review output.
 * Case-insensitive matching.
 *
 * @param reviewResult - Raw output from code review thread
 * @returns Parsed verdict ('approved' or 'rejected')
 * @throws Error if verdict cannot be parsed or is invalid
 */
export function parseVerdict(reviewResult: string): ReviewVerdict {
  const match = reviewResult.match(/VERDICT:\s*(APPROVED|REJECTED)/i);

  if (!match?.[1]) {
    throw new Error('Could not parse verdict from review result');
  }

  const verdict = match[1].toLowerCase();

  if (verdict !== 'approved' && verdict !== 'rejected') {
    throw new Error('Could not parse verdict from review result');
  }

  return verdict;
}

/**
 * Run code review loop for a phase.
 *
 * Spawns a single Codex thread and runs review → fix → re-review cycles
 * until code is approved or max rejections reached.
 *
 * The same thread is reused for all iterations to preserve conversation context.
 * This allows the reviewer to reference previous feedback and the fixer to
 * understand the full history.
 *
 * @param phase - Phase to review
 * @param plan - Execution plan
 * @throws Error if review fails after MAX_REJECTIONS rejections
 */
export async function runCodeReview(phase: Phase, plan: Plan): Promise<void> {
  // Get Codex constructor (mocked in tests, real in production)
  // Spawn single Codex thread in main worktree
  // This thread will be reused for all review/fix iterations
  const codex = new Codex();

  const thread = codex.startThread({
    workingDirectory: `.worktrees/${plan.runId}-main`,
  });

  let rejectionCount = 0;

  // Review loop continues until approved or max rejections
  while (rejectionCount <= MAX_REJECTIONS) {
    // Generate and run code review
    const reviewPrompt = generateReviewPrompt(phase, plan);
    const reviewTurn = await thread.run(reviewPrompt);

    // Parse verdict from review output
    const verdict = parseVerdict(reviewTurn.finalResponse);

    if (verdict === 'approved') {
      // Success! Code is approved
      return;
    }

    // Code was rejected - increment counter
    rejectionCount++;

    if (rejectionCount > MAX_REJECTIONS) {
      throw new Error(`Code review failed after ${MAX_REJECTIONS} rejections`);
    }

    // Generate and run fixer prompt
    // SAME thread preserves conversation context
    const fixerPrompt = generateFixerPrompt(reviewTurn.finalResponse, plan);
    await thread.run(fixerPrompt);

    // Loop continues to re-review
  }
}

/**
 * Generate code review prompt.
 *
 * This is a placeholder that will be replaced with actual prompt generation
 * from src/prompts/code-reviewer.ts (task-3-1).
 *
 * @param phase - Phase to review
 * @param plan - Execution plan
 * @returns Code review prompt
 */
function generateReviewPrompt(phase: Phase, plan: Plan): string {
  // Placeholder implementation
  // Real implementation will import from src/prompts/code-reviewer.ts
  return `
# Code Review for Phase ${phase.id}: ${phase.name}

You are reviewing code for run ID: ${plan.runId}

Review the implementation and provide a verdict:
- VERDICT: APPROVED if code meets all requirements
- VERDICT: REJECTED if code has issues

Tasks in this phase:
${phase.tasks.map((t) => `- ${t.id}: ${t.name}`).join('\n')}

Provide your review with clear verdict.
`.trim();
}

/**
 * Generate fixer prompt.
 *
 * This is a placeholder that will be replaced with actual prompt generation
 * from src/prompts/fixer.ts (task-3-1).
 *
 * @param reviewResult - Output from code review
 * @param plan - Execution plan
 * @returns Fixer prompt
 */
function generateFixerPrompt(reviewResult: string, plan: Plan): string {
  // Placeholder implementation
  // Real implementation will import from src/prompts/fixer.ts
  return `
# Fix Issues from Code Review

Run ID: ${plan.runId}

The code review identified issues:

${reviewResult}

Please fix all issues mentioned in the review.
`.trim();
}
