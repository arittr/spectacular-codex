# Technology Stack

## Core Principle

**spectacular-codex uses TypeScript with strict mode, Node.js 18+, and stdio-based MCP architecture.**

The stack prioritizes:
1. **Type safety** - Catch errors at compile time, not runtime
2. **Standard protocols** - MCP stdio transport for universal compatibility
3. **Minimal dependencies** - Only essential libraries, no framework bloat
4. **Safe shell execution** - Structured command execution, no injection risks

## Runtime Environment

### Node.js 18+

**Version:** Node.js 18.0.0 or higher

**Rationale:**
- **ESM support** - Native ES modules without transpilation hacks
- **Modern APIs** - fetch(), structuredClone(), enhanced error stacks
- **LTS timeline** - Active support through April 2025, maintenance through April 2026
- **Codex SDK compatibility** - @openai/codex requires Node 18+

**Configuration:**
```json
{
  "engines": {
    "node": ">=18.0.0"
  },
  "type": "module"
}
```

**Key:** Use ESM imports (`import`), not CommonJS (`require`). All code is ES modules by default.

## Language

### TypeScript (Strict Mode)

**Version:** TypeScript 5.x

**Configuration:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Mandatory Flags:**
- `strict: true` - All strict type checking enabled
- `noUncheckedIndexedAccess: true` - Array/object access returns T | undefined
- `noImplicitOverride: true` - Explicit override keyword required
- `exactOptionalPropertyTypes: true` - Optional properties cannot be explicitly undefined

**Rationale:**
- **Catch errors early** - Type errors at compile time, not production
- **Self-documenting** - Types serve as inline documentation
- **Refactoring safety** - Compiler catches broken references
- **IDE support** - Full autocomplete and navigation

**Key:** Embrace strict mode. If TypeScript complains, fix the code, not the types.

## Core Dependencies

### @openai/codex

**Purpose:** Spawn and manage Codex SDK threads for parallel task execution.

**Usage:**
```typescript
import { Codex } from '@openai/codex';

const codex = new Codex({
  workingDirectory: '.worktrees/abc123-task-1'
});
const thread = codex.startThread();
const result = await thread.run(prompt);
```

**Rationale:**
- **Official SDK** - Maintained by OpenAI, first-class Codex support
- **Thread isolation** - Each thread has separate working directory
- **Async operations** - Non-blocking thread spawning via Promises
- **Conversation context** - Threads maintain chat history for review loops

**Key:** Use Promise.all() for parallel thread execution. Each thread is isolated.

### @modelcontextprotocol/sdk

**Purpose:** Implement MCP server with stdio transport for Codex CLI integration.

**Usage:**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'spectacular-codex',
  version: '1.0.0'
}, {
  capabilities: { tools: {} }
});

server.setRequestHandler(/* ... */);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Rationale:**
- **Standard protocol** - MCP is Codex's native extension mechanism
- **Stdio transport** - Standard input/output, works everywhere
- **Tool registration** - Expose spectacular_execute, spectacular_status, etc.
- **JSON-RPC 2.0** - Structured request/response with error handling

**Key:** MCP server is orchestration layer only. Never execute code directly.

### execa

**Purpose:** Safe shell command execution with structured arguments.

**Usage:**
```typescript
import { execa } from 'execa';

// ✅ CORRECT: Array arguments (no injection)
await execa('git', ['worktree', 'add', worktreePath, branch]);

// ❌ WRONG: String interpolation (injection risk)
await execa(`git worktree add ${worktreePath} ${branch}`);
```

**Rationale:**
- **Security** - Array arguments prevent shell injection
- **Promise-based** - async/await support, no callbacks
- **Error handling** - Structured errors with stdout/stderr capture
- **Cross-platform** - Works on Windows, macOS, Linux

**Key:** Always use array arguments. Never interpolate user input into command strings.

## Utility Libraries

### Git Command Wrappers

**Approach:** Wrap execa calls in pure utility functions.

**Pattern:**
```typescript
// src/utils/git.ts
export async function createWorktree(path: string, branch: string): Promise<void> {
  await execa('git', ['worktree', 'add', path, branch]);
}

export async function stackBranches(runId: string): Promise<void> {
  await execa('gs', ['stack', 'branch', 'onto', `${runId}-main`]);
}
```

**Rationale:**
- **Abstraction** - Hide execa details from orchestrator
- **Type safety** - Function signatures enforce correct usage
- **Testability** - Pure functions, easy to mock
- **Centralization** - Git logic in one place, not scattered

**Key:** Utils are stateless. No side effects beyond shell commands.

## External Dependencies

### git-spice

**Purpose:** Stacked branch management for task organization.

**Installation:** User installs via Homebrew/binary (not npm)

**Usage:**
```bash
gs repo init                    # Initialize repository
gs branch create {name}         # Create stacked branch
gs stack submit                 # Submit stacked PRs
```

**Rationale:**
- **Stacked workflow** - Task branches stack linearly
- **PR organization** - Each task becomes separate PR
- **Navigation** - Easy movement between dependent branches
- **GitHub integration** - Auto-create stacked PRs

**Key:** git-spice is external tool, not npm dependency. Validate in init command.

## Development Dependencies

### Testing

**Not Yet Defined** - See testing.md for test strategy.

Future candidates:
- **vitest** - Fast test runner with TypeScript support
- **@types/node** - Node.js type definitions

### Linting

**Approach:** Follow project's existing linter (if any).

**Philosophy:** spectacular-codex should adapt to host project's style, not enforce its own.

**Key:** No ESLint/Prettier in spectacular-codex itself. TypeScript strict mode is sufficient.

## Dependency Management

### Package Manager

**Recommended:** npm (universal, no setup)

**Alternative:** bun, pnpm, yarn (if project uses them)

**Rationale:**
- **Universal** - npm ships with Node.js
- **Lockfile** - package-lock.json ensures reproducible installs
- **Simple** - No extra installation step

**Key:** Don't assume specific package manager. Detect from lockfile or use npm as fallback.

### Version Pinning

**Approach:** Caret ranges for dependencies (`^1.0.0`)

**Rationale:**
- **Semver trust** - Patch/minor updates assumed non-breaking
- **Security updates** - Automatic patch version updates
- **Maintenance** - No manual bumps for every patch

**Exception:** Pin exact versions for critical dependencies if bugs are discovered.

## Anti-Patterns

### ❌ Don't Add Framework Bloat

**Wrong:**
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "lodash": "^4.17.21",
    "axios": "^1.6.0"
  }
}
```

**Why:** MCP server uses stdio (no HTTP), execa handles shell (no axios), TypeScript has array methods (no lodash).

**Key:** Every dependency is a maintenance burden. Add only when essential.

### ❌ Don't Use Global State Libraries

**Wrong:**
```typescript
import { createStore } from 'redux';
const store = createStore(/* ... */);
```

**Why:** Git branches are state. MCP server only tracks job status in-memory.

**Key:** State lives in git, not application memory. Simple Map for job tracking.

### ❌ Don't Use Process Managers

**Wrong:**
```bash
pm2 start spectacular-codex
```

**Why:** Codex CLI spawns MCP server as child process. No manual process management.

**Key:** MCP server is stdio subprocess, not long-running daemon.

## Technology Decisions Summary

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| Node.js 18+ | Runtime | ESM, modern APIs, Codex SDK compat |
| TypeScript Strict | Language | Type safety, refactoring, docs |
| @openai/codex | Thread spawning | Official SDK, parallel execution |
| @modelcontextprotocol/sdk | MCP server | Standard protocol, stdio transport |
| execa | Shell commands | Security, structure, cross-platform |
| git-spice | Branch management | Stacked workflow, PR organization |

## Future Considerations

**v2 Candidates:**
- **SQLite** - Job persistence across server restarts
- **vitest** - Test framework for unit/integration tests
- **Winston/Pino** - Structured logging for debugging
- **Zod** - Runtime validation for MCP tool arguments

**Remember:** Add dependencies only when proven necessary. Keep v1 minimal.
