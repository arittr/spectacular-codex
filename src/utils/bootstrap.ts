import { execa } from 'execa';

let bootstrapped = false;

/**
 * Ensures the Spectacular + Superpowers skills are bootstrapped before running subagents.
 *
 * The upstream repos expose helper commands that install/update the latest skills into Codex.
 * We only need to run them once per process, so this function keeps a local guard.
 */
export async function bootstrapSkills(cwd: string): Promise<void> {
  if (bootstrapped) {
    return;
  }

  const commands = [
    '~/.codex/superpowers/.codex/superpowers-codex bootstrap',
    '~/.codex/spectacular/.codex/spectacular-codex bootstrap',
  ];

  for (const command of commands) {
    await execa('bash', ['-lc', command], {
      cwd,
      stderr: 'inherit',
      stdout: 'inherit',
    });
  }

  bootstrapped = true;
}
