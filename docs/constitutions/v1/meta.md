# Constitution Metadata

**Version:** 1
**Created:** 2025-01-13
**Previous Version:** N/A (initial version)

## Summary

Initial constitution for spectacular-codex, establishing foundational architecture for an MCP server that enables Spectacular workflows (spec → plan → parallel execute) within Codex CLI via parallel Codex thread orchestration.

## Rationale

This v1 constitution establishes the architectural foundation for spectacular-codex based on lessons learned from the spectacular Claude Code plugin and the commitment project:

1. **MCP Server Architecture**: spectacular-codex is fundamentally different from spectacular (Claude Code plugin). It's a Node.js MCP server that orchestrates multiple Codex threads via the Codex SDK. The architecture reflects this: MCP server (orchestration) → Codex threads (execution) → Git worktrees (state).

2. **Skills as Embedded Prompts**: Unlike spectacular where skills are separate files read by subagents, spectacular-codex embeds skill instructions directly into prompts sent to Codex threads. This requires a different pattern: prompt templates with embedded skill logic rather than skill references.

3. **Async Job Pattern**: MCP tool calls expect synchronous responses, but parallel execution takes hours. The architecture uses an async job pattern: `spectacular_execute` returns immediately with run_id, execution continues in background, user polls with `spectacular_status`. Job state tracked in-memory, git branches are source of truth.

4. **Selective Abstraction Philosophy**: Following commitment's v3 constitution, spectacular-codex embraces selective abstraction:
   - ✅ Simple orchestration modules (parallel-phase, sequential-phase, code-review)
   - ✅ Pure utility functions (git operations, plan parsing)
   - ✅ Prompt templates (task-executor, code-reviewer, fixer)
   - ❌ Complex factories or provider chains
   - ❌ Auto-detection systems
   - ❌ Complex inheritance hierarchies

5. **True Parallelism**: The value proposition is parallel task execution via multiple Codex SDK threads + Promise.all(). Each thread operates in an isolated worktree. Coordination happens through git branches, not shared state. The architecture enforces this: no shared mutable state, git branches are truth, MCP server only tracks job status.

6. **Git-Based State**: State lives in git (branches, worktrees, commits), not in the MCP server. This enables:
   - Resume after failure (check existing branches)
   - Verification (branch existence = task completion)
   - User visibility (gs log short shows progress)
   - No database dependency

7. **Why Now**: spectacular-codex was created to bring Spectacular's parallel orchestration methodology to Codex CLI users. The MCP planning document (docs/mcp-planning.md) validated the technical feasibility: Codex SDK supports parallel threads, MCP stdio transport works, and skills can be embedded in prompts.

## What This Version Establishes

**Core Architecture:**
- 4-layer architecture: MCP Server → Codex SDK → Git Worktrees → External Systems
- Orchestration in TypeScript (MCP server)
- Execution in Codex threads (parallel instances)
- State in git (branches, worktrees, commits)

**Key Patterns:**
- Async job pattern (return immediately, poll for status)
- Prompt template pattern (skills embedded in prompts)
- Pure orchestration (MCP server coordinates, Codex threads execute)
- Git-based coordination (branches = truth, MCP = status tracker)

**Technology Foundation:**
- TypeScript + Node.js 18+
- @openai/codex SDK for thread spawning
- @modelcontextprotocol/sdk for MCP server
- stdio transport (standard for Codex MCP servers)

**Guiding Principles:**
1. User stays in Codex CLI (slash commands call MCP tools)
2. True parallelism via Codex SDK threads
3. Skills embedded in prompts (not separate files)
4. Git-based state (branches are truth)
5. Autonomous execution (code review loops without user prompts)

## Related Documents

- docs/mcp-planning.md - Complete architecture and implementation plan
- ../commitment/ - Reference project for TypeScript patterns and constitution structure

## Notes for Future Versions

When creating v2, consider:
- Performance optimizations (thread pooling, caching)
- State persistence (SQLite for job history)
- Advanced orchestration (dependencies between parallel tasks, conditional execution)
- Plugin system for custom prompt templates
- Multi-project support (workspace orchestration)

**Remember**: This is v1 - the foundation. Keep it simple, focused, and well-documented. Add complexity only when proven necessary.
