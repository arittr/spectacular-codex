# Repository Guidelines

## Project Structure & Module Organization
Source lives in `src/`, grouped by responsibility: `handlers/` for MCP tool entry points, `orchestrator/` for parallel/sequential/review logic, `prompts/` for Codex thread templates, `utils/` for git/plan helpers, and `types.ts` for shared interfaces. Tests mirror their targets under `src/**/__tests__/`. Distribution artifacts are emitted to `dist/` via `tsup`, and feature specs live in `specs/{runId-feature}/`.

## Build, Test, and Development Commands
- `pnpm build` – Bundles TypeScript to `dist/` using `tsup`.
- `pnpm dev` – Watch-mode build for iterating on the MCP server.
- `pnpm test` / `pnpm test:watch` – Run or watch Vitest suites across orchestrators and handlers.
- `pnpm lint` – Type-checks (`pnpm check-types`) then formats/lints with Biome.
- `pnpm check-types` – Runs `tsc --noEmit` in strict mode; keep it clean before commits.

## Coding Style & Naming Conventions
TypeScript strict mode is enforced via `tsconfig.json`; avoid `any` unless there is a documented, localized justification. Prefer ES modules without explicit extensions (e.g., `@/orchestrator/parallel-phase`). Follow Biome’s default formatting (2-space indent, trailing commas where valid). Branch names should follow the pattern `{runId}-task-{phase}-{id}-{slug}` to keep resume logic intact.

## Testing Guidelines
Vitest drives unit coverage for orchestrators, handlers, and utilities; place tests under the nearest `__tests__/` folder and mirror the module name (`parallel-phase.test.ts`). When adding new orchestration paths, cover both success and failure flows, especially branch detection/resume logic. Run `pnpm test` before pushing and include relevant status output in PRs if non-trivial.

## Commit & Pull Request Guidelines
Message format observed in git history follows “scope: summary” (e.g., `orchestrator: add sequential phase resume`). Keep commits focused on a single concern and ensure build/test/lint pass beforehand. Pull requests should describe the feature, link to the corresponding spec (`specs/{runId-feature}/`), and call out quality checks run (`pnpm test`, `pnpm lint`). Include screenshots or command logs only when useful (e.g., demonstrating MCP server startup). Tag reviewers familiar with the touched layer (handlers vs. orchestrators) to speed review cycles.

## Security & Configuration Tips
Never expose Codex tokens or local git credentials; `.env` files are intentionally absent. When running locally, ensure `~/.codex/mcp-servers.json` points to the built `dist/index.js`, and keep git-spice installed for stacking workflows. Use dedicated worktrees (`.worktrees/`) when testing parallel execution to avoid polluting the main worktree.
