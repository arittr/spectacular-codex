/**
 * Utilities for detecting project configuration from CLAUDE.md or AGENTS.md.
 *
 * These are pure functions that parse markdown/text content to extract
 * commands for installation, quality checks, and git hooks setup.
 */

/**
 * Detects install and postinstall commands from CLAUDE.md or AGENTS.md.
 *
 * Supports formats:
 * - CLAUDE.md: `- **install**: \`pnpm install\``
 * - AGENTS.md: `install: pnpm install`
 *
 * @param content - The markdown content of CLAUDE.md or AGENTS.md
 * @returns Object with optional installCommand and postInstallCommand
 */
export function detectInstallCommand(content: string): {
  installCommand?: string;
  postInstallCommand?: string;
} {
  const result: {
    installCommand?: string;
    postInstallCommand?: string;
  } = {};

  // Try CLAUDE.md format: - **install**: `command`
  const claudeInstallMatch = content.match(/\*\*install\*\*:\s*`([^`]+)`/i);
  if (claudeInstallMatch?.[1]) {
    result.installCommand = claudeInstallMatch[1].trim();
  }

  const claudePostInstallMatch = content.match(/\*\*postinstall\*\*:\s*`([^`]+)`/i);
  if (claudePostInstallMatch?.[1]) {
    result.postInstallCommand = claudePostInstallMatch[1].trim();
  }

  // Try AGENTS.md format: install: command (no backticks)
  if (!result.installCommand) {
    const agentsInstallMatch = content.match(/^install:\s*(.+)$/m);
    if (agentsInstallMatch?.[1]) {
      result.installCommand = agentsInstallMatch[1].trim();
    }
  }

  if (!result.postInstallCommand) {
    const agentsPostInstallMatch = content.match(/^postinstall:\s*(.+)$/m);
    if (agentsPostInstallMatch?.[1]) {
      result.postInstallCommand = agentsPostInstallMatch[1].trim();
    }
  }

  return result;
}

/**
 * Detects quality check commands (test, lint, build, type-check) from CLAUDE.md or AGENTS.md.
 *
 * Supports formats:
 * - CLAUDE.md: `- **test**: \`pnpm test\` - Description`
 * - AGENTS.md: `test: npm test`
 *
 * @param content - The markdown content of CLAUDE.md or AGENTS.md
 * @returns Object with optional quality check commands
 */
export function detectQualityChecks(content: string): {
  testCommand?: string;
  lintCommand?: string;
  buildCommand?: string;
  typeCheckCommand?: string;
} {
  const result: {
    testCommand?: string;
    lintCommand?: string;
    buildCommand?: string;
    typeCheckCommand?: string;
  } = {};

  // Helper to try both CLAUDE.md and AGENTS.md formats
  const detectCommand = (name: string): string | undefined => {
    // Try CLAUDE.md format: - **name**: `command` - Description
    const claudeMatch = content.match(new RegExp(`\\*\\*${name}\\*\\*:\\s*\`([^\`]+)\``, 'i'));
    if (claudeMatch?.[1]) {
      return claudeMatch[1].trim();
    }

    // Try AGENTS.md format: name: command
    const agentsMatch = content.match(new RegExp(`^${name}:\\s*(.+)$`, 'mi'));
    if (agentsMatch?.[1]) {
      return agentsMatch[1].trim();
    }

    return undefined;
  };

  const testCommand = detectCommand('test');
  if (testCommand) result.testCommand = testCommand;

  const lintCommand = detectCommand('lint');
  if (lintCommand) result.lintCommand = lintCommand;

  const buildCommand = detectCommand('build');
  if (buildCommand) result.buildCommand = buildCommand;

  const typeCheckCommand = detectCommand('check-types');
  if (typeCheckCommand) result.typeCheckCommand = typeCheckCommand;

  return result;
}

/**
 * Detects git hooks installation command from CLAUDE.md or AGENTS.md.
 *
 * Looks for common patterns:
 * - lefthook install
 * - husky install
 * - commitment git-hooks install
 *
 * @param content - The markdown content of CLAUDE.md or AGENTS.md
 * @returns Git hooks command if found, undefined otherwise
 */
export function detectGitHooks(content: string): string | undefined {
  // Try to find common git hooks commands in various formats

  // 1. In code blocks (```bash\nlefthook install\n```)
  const codeBlockMatch = content.match(
    /```(?:bash|sh)?\s*\n\s*(lefthook install|husky install|commitment git-hooks install)\s*\n```/
  );
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  // 2. In inline code: `lefthook install`
  const patterns = [
    /`(lefthook install)`/,
    /`(husky install)`/,
    /`(commitment git-hooks install)`/,
    // Also try without backticks in AGENTS.md format
    /^git-hooks:\s*(.+)$/m,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}
