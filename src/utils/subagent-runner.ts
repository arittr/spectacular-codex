import path from 'node:path';
import { execa } from 'execa';

const DEFAULT_ARGS = ['run', '--dangerously-bypass-approvals-and-sandbox'];
const SUBAGENT_BIN = process.env.CODEX_SUBAGENT_BIN ?? 'codex';

function parseArgs(): string[] {
  const raw = process.env.CODEX_SUBAGENT_ARGS;
  if (!raw) {
    return DEFAULT_ARGS;
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((arg) => typeof arg === 'string')) {
      return parsed;
    }
  } catch {
    // fall back to default
  }

  return DEFAULT_ARGS;
}

/**
 * Runs a Codex CLI subagent for the given task prompt inside the provided worktree.
 *
 * The CLI binary/args can be customized via CODEX_SUBAGENT_BIN and CODEX_SUBAGENT_ARGS.
 * The prompt is piped to stdin, so callers can use args like "--prompt-from-stdin".
 */
export async function runSubagentPrompt(
  prompt: string,
  worktreePath: string
): Promise<{
  stdout: string;
  stderr: string;
}> {
  const args = parseArgs();
  const absolutePath = path.isAbsolute(worktreePath)
    ? worktreePath
    : path.join(process.cwd(), worktreePath);

  const subprocess = execa(SUBAGENT_BIN, args, {
    cwd: absolutePath,
    input: prompt,
  });

  const { stdout, stderr } = await subprocess;
  return { stderr, stdout };
}
