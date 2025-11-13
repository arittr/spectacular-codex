import { describe, expect, it } from 'vitest';
import { detectGitHooks, detectInstallCommand, detectQualityChecks } from '@/utils/project-config';

describe('detectInstallCommand', () => {
  it('detects pnpm install from CLAUDE.md', () => {
    const claudeMd = `# CLAUDE.md

## Setup

- **install**: \`pnpm install\` (or \`npm install\`)
- **postinstall**: N/A
`;
    const result = detectInstallCommand(claudeMd);
    expect(result.installCommand).toBe('pnpm install');
    expect(result.postInstallCommand).toBeUndefined();
  });

  it('detects npm install and postinstall', () => {
    const claudeMd = `## Development Commands

### Setup

- **install**: \`npm install\`
- **postinstall**: \`npm run setup-db\`
`;
    const result = detectInstallCommand(claudeMd);
    expect(result.installCommand).toBe('npm install');
    expect(result.postInstallCommand).toBe('npm run setup-db');
  });

  it('detects bun install', () => {
    const claudeMd = `- **install**: \`bun install\``;
    const result = detectInstallCommand(claudeMd);
    expect(result.installCommand).toBe('bun install');
  });

  it('returns undefined if no install command found', () => {
    const claudeMd = `# CLAUDE.md\n\nNo setup commands here.`;
    const result = detectInstallCommand(claudeMd);
    expect(result.installCommand).toBeUndefined();
    expect(result.postInstallCommand).toBeUndefined();
  });

  it('handles AGENTS.md format', () => {
    const agentsMd = `# AGENTS.md

## Setup

install: pnpm install
postinstall: pnpm build
`;
    const result = detectInstallCommand(agentsMd);
    expect(result.installCommand).toBe('pnpm install');
    expect(result.postInstallCommand).toBe('pnpm build');
  });
});

describe('detectQualityChecks', () => {
  it('detects test, lint, and build commands', () => {
    const claudeMd = `## Quality Checks

- **test**: \`pnpm test\` - Run all tests
- **lint**: \`pnpm lint\` - Type check + formatting
- **build**: \`pnpm build\` - Compile TypeScript
`;
    const result = detectQualityChecks(claudeMd);
    expect(result.testCommand).toBe('pnpm test');
    expect(result.lintCommand).toBe('pnpm lint');
    expect(result.buildCommand).toBe('pnpm build');
  });

  it('detects type-check command separately', () => {
    const claudeMd = `- **check-types**: \`tsc --noEmit\`
- **lint**: \`biome check\`
`;
    const result = detectQualityChecks(claudeMd);
    expect(result.typeCheckCommand).toBe('tsc --noEmit');
    expect(result.lintCommand).toBe('biome check');
  });

  it('handles npm script style', () => {
    const claudeMd = `- **test**: \`npm test\`
- **lint**: \`npm run lint\`
`;
    const result = detectQualityChecks(claudeMd);
    expect(result.testCommand).toBe('npm test');
    expect(result.lintCommand).toBe('npm run lint');
  });

  it('returns empty object if no quality checks found', () => {
    const claudeMd = `# No quality checks`;
    const result = detectQualityChecks(claudeMd);
    expect(result.testCommand).toBeUndefined();
    expect(result.lintCommand).toBeUndefined();
    expect(result.buildCommand).toBeUndefined();
  });

  it('handles AGENTS.md format with colons', () => {
    const agentsMd = `test: npm test
lint: npm run lint
build: npm run build
`;
    const result = detectQualityChecks(agentsMd);
    expect(result.testCommand).toBe('npm test');
    expect(result.lintCommand).toBe('npm run lint');
    expect(result.buildCommand).toBe('npm run build');
  });
});

describe('detectGitHooks', () => {
  it('detects lefthook install command', () => {
    const claudeMd = `## Setup

Run lefthook to install git hooks:
\`\`\`bash
lefthook install
\`\`\`
`;
    const result = detectGitHooks(claudeMd);
    expect(result).toBe('lefthook install');
  });

  it('detects husky install command', () => {
    const claudeMd = `- Install hooks: \`husky install\``;
    const result = detectGitHooks(claudeMd);
    expect(result).toBe('husky install');
  });

  it('detects commitment git hooks command', () => {
    const claudeMd = `- **git-hooks**: \`commitment git-hooks install\``;
    const result = detectGitHooks(claudeMd);
    expect(result).toBe('commitment git-hooks install');
  });

  it('returns undefined if no git hooks command found', () => {
    const claudeMd = `# No git hooks here`;
    const result = detectGitHooks(claudeMd);
    expect(result).toBeUndefined();
  });
});
