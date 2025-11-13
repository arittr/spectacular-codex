import type { Phase, Plan, Task } from '@/types';

/**
 * Extracts the runId from a plan.md file path.
 *
 * Expected path format: specs/{runId}-{feature-slug}/plan.md
 *
 * @param planPath - Path to the plan.md file
 * @returns The 6-character hex runId
 * @throws {Error} If path format is invalid or runId is malformed
 */
export function extractRunId(planPath: string): string {
  // Extract the directory name containing the runId
  const match = planPath.match(/specs\/([^/]+)\/plan\.md$/);
  if (!match) {
    throw new Error('Invalid plan path: must be specs/{runId}-{feature}/plan.md');
  }

  // Extract runId (first part before optional dash)
  const dirName = match[1];
  if (!dirName) {
    throw new Error('Invalid plan path: missing directory name');
  }

  const runId = dirName.split('-')[0];
  if (!runId) {
    throw new Error('Invalid plan path: missing runId');
  }

  // Validate runId format (6 hex characters)
  if (!/^[0-9a-f]{6}$/i.test(runId)) {
    throw new Error('Invalid runId format: must be 6 hexadecimal characters');
  }

  return runId;
}

/**
 * Parses a plan.md markdown file into a structured Plan object.
 *
 * Expected format:
 * ```markdown
 * # Implementation Plan: {title}
 * Run ID: {runId}
 * Feature: {feature-slug}
 *
 * ## Phase {N}: {Phase Name} (Parallel|Sequential)
 *
 * ### Task {N}-{M}: {Task Name}
 * **Description:** {description}
 * **Files:**
 * - {file1}
 * - {file2}
 *
 * **Acceptance Criteria:**
 * - {criterion1}
 * - {criterion2}
 *
 * **Dependencies:** {task-id1}, {task-id2} | None
 * ```
 *
 * @param planMarkdown - The markdown content of plan.md
 * @param expectedRunId - The runId to validate against
 * @returns Parsed Plan object
 * @throws {Error} If markdown format is invalid or runId doesn't match
 */
export function parsePlan(planMarkdown: string, expectedRunId: string): Plan {
  // Extract title (first h1)
  const titleMatch = planMarkdown.match(/^# (.+)$/m);
  const title = titleMatch?.[1] ?? 'Untitled Plan';

  // Extract runId from content
  const runIdMatch = planMarkdown.match(/^Run ID:\s*(.+)$/m);
  const contentRunId = runIdMatch?.[1]?.trim();
  if (!contentRunId) {
    throw new Error("Plan missing 'Run ID:' field");
  }
  if (contentRunId !== expectedRunId) {
    throw new Error(`runId mismatch: expected ${expectedRunId}, found ${contentRunId}`);
  }

  // Extract feature slug
  const featureMatch = planMarkdown.match(/^Feature:\s*(.+)$/m);
  const featureSlug = featureMatch?.[1]?.trim() ?? 'unknown-feature';

  // Parse phases
  const phases = parsePhases(planMarkdown);

  if (phases.length === 0) {
    throw new Error('No phases found in plan');
  }

  return {
    featureSlug,
    phases,
    runId: expectedRunId,
    stackingBackend: 'git-spice',
    title,
  };
}

/**
 * Parses all phases from the plan markdown.
 */
function parsePhases(markdown: string): Phase[] {
  const phases: Phase[] = [];

  // Match phase headers: ## Phase {N}: {Name} (Strategy)
  const phaseRegex = /^## Phase (\d+): (.+?) \((Parallel|Sequential)\)$/gm;
  let match: RegExpExecArray | null;

  const phaseMatches: Array<{
    id: number;
    name: string;
    strategy: 'parallel' | 'sequential';
    startIndex: number;
  }> = [];

  match = phaseRegex.exec(markdown);
  while (match !== null) {
    const id = Number.parseInt(match[1] ?? '0', 10);
    const name = match[2]?.trim() ?? '';
    const strategyRaw = match[3]?.toLowerCase();
    const strategy =
      strategyRaw === 'parallel' || strategyRaw === 'sequential' ? strategyRaw : 'parallel';

    phaseMatches.push({
      id,
      name,
      startIndex: match.index,
      strategy,
    });

    match = phaseRegex.exec(markdown);
  }

  // Extract content for each phase
  for (let i = 0; i < phaseMatches.length; i++) {
    const phaseMatch = phaseMatches[i];
    if (!phaseMatch) continue;

    const nextPhaseMatch = phaseMatches[i + 1];
    const endIndex = nextPhaseMatch?.startIndex ?? markdown.length;
    const phaseContent = markdown.slice(phaseMatch.startIndex, endIndex);

    const tasks = parseTasks(phaseContent);

    phases.push({
      id: phaseMatch.id,
      name: phaseMatch.name,
      strategy: phaseMatch.strategy,
      tasks,
    });
  }

  return phases;
}

/**
 * Parses all tasks within a phase's markdown content.
 */
function parseTasks(phaseMarkdown: string): Task[] {
  const tasks: Task[] = [];

  // Match task headers: ### Task {N}-{M}: {Name}
  const taskRegex = /^### Task ([\d-]+): (.+)$/gm;
  let match: RegExpExecArray | null;

  const taskMatches: Array<{
    id: string;
    name: string;
    startIndex: number;
  }> = [];

  match = taskRegex.exec(phaseMarkdown);
  while (match !== null) {
    const id = match[1] ?? '';
    const name = match[2]?.trim() ?? '';

    taskMatches.push({
      id,
      name,
      startIndex: match.index,
    });

    match = taskRegex.exec(phaseMarkdown);
  }

  // Extract content for each task
  for (let i = 0; i < taskMatches.length; i++) {
    const taskMatch = taskMatches[i];
    if (!taskMatch) continue;

    const nextTaskMatch = taskMatches[i + 1];
    const endIndex = nextTaskMatch?.startIndex ?? phaseMarkdown.length;
    const taskContent = phaseMarkdown.slice(taskMatch.startIndex, endIndex);

    // Extract description
    const descMatch = taskContent.match(/\*\*Description:\*\*\s*(.+)/);
    const description = descMatch?.[1]?.trim() ?? '';

    // Extract files (list items after **Files:**)
    const files = extractListItems(taskContent, 'Files');

    // Extract acceptance criteria
    const acceptanceCriteria = extractListItems(taskContent, 'Acceptance Criteria');

    // Extract dependencies
    const depsMatch = taskContent.match(/\*\*Dependencies:\*\*\s*(.+)/);
    const depsRaw = depsMatch?.[1]?.trim();
    const dependencies: string[] | undefined =
      depsRaw && depsRaw.toLowerCase() !== 'none'
        ? depsRaw.split(',').map((d: string) => d.trim())
        : undefined;

    const task: Task = {
      acceptanceCriteria,
      description,
      files,
      id: taskMatch.id,
      name: taskMatch.name,
    };

    if (dependencies) {
      task.dependencies = dependencies;
    }

    tasks.push(task);
  }

  return tasks;
}

/**
 * Extracts list items after a specific section header.
 *
 * Example:
 * ```
 * **Files:**
 * - src/file1.ts
 * - src/file2.ts
 * ```
 */
function extractListItems(content: string, sectionName: string): string[] {
  const items: string[] = [];

  // Find the section header
  const sectionRegex = new RegExp(`\\*\\*${sectionName}:\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*|$)`);
  const match = content.match(sectionRegex);

  if (!match || !match[1]) {
    return items;
  }

  const listContent = match[1];

  // Extract list items (lines starting with -)
  const itemRegex = /^-\s*(.+)$/gm;
  let itemMatch: RegExpExecArray | null;

  itemMatch = itemRegex.exec(listContent);
  while (itemMatch !== null) {
    const item = itemMatch[1]?.trim();
    if (item) {
      items.push(item);
    }
    itemMatch = itemRegex.exec(listContent);
  }

  return items;
}
