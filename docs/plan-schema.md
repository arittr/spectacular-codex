# Plan Schema for spectacular-codex

`spectacular_execute` accepts either a `plan_path` (pointing to `specs/{runId}-{feature}/plan.md`) or an inline `plan` object. When integrating with an external orchestrator—such as a Codex-specific `/spectacular:execute` command—you'll typically send the plan object directly so the MCP server can skip markdown scraping.

## Top-Level Shape

```json5
{
  "runId": "0729be",
  "featureSlug": "mobile-optimizations",         // optional
  "phases": [
    {
      "id": 1,
      "name": "Responsive Shell",
      "strategy": "parallel",                     // "parallel" or "sequential"
      "tasks": [
        {
          "id": "1-1",
          "name": "Update layout breakpoints",
          "description": "Split desktop/mobile breakpoints in layout.tsx",
          "files": ["src/layout.tsx", "src/theme.ts"],
          "acceptanceCriteria": [
            "Desktop layout unchanged",
            "Mobile layout uses responsive grid"
          ],
          "dependencies": []
        }
      ]
    }
  ],
  "stackingBackend": "git-spice"                  // optional; defaults to git-spice
}
```

### Required fields

| Field          | Type          | Notes |
|----------------|---------------|-------|
| `runId`        | string        | Six-character hex identifier used for branches/worktrees. |
| `phases`       | Phase[]       | At least one phase with at least one task. |
| `phases[].id`  | number        | 1-based phase index; used for status reporting. |
| `phases[].name`| string        | Human-readable phase name. |
| `phases[].strategy` | `"parallel"` or `"sequential"` | Controls whether tasks run concurrently or serially. |
| `phases[].tasks[].id` | string | Task identifier (format flexible, but typically `"phase-task"`). |
| `phases[].tasks[].name` | string | Task title shown in prompts/status. |
| `phases[].tasks[].description` | string | Task summary embedded in prompts. |

### Optional fields

- `featureSlug`: Used to build spec references in prompts (`specs/{runId}-{featureSlug}/spec.md`). If omitted, prompts fall back to `specs/{runId}-feature/`.
- `stackingBackend`: Defaults to `git-spice`. Leave unset unless you add new stacking helpers.
- `tasks[].files`: Array of absolute/relative paths. Prompts include `(caller did not specify)` if omitted.
- `tasks[].acceptanceCriteria`: Array of bullet points. Prompts include a placeholder if omitted.
- `tasks[].dependencies`: Array of other task IDs. Used mainly for documentation; executor does not enforce DAG ordering.

## Example Tool Call

```json
{
  "plan": {
    "runId": "0729be",
    "featureSlug": "mobile-optimizations",
    "phases": [
      {
        "id": 1,
        "name": "Layout Updates",
        "strategy": "parallel",
        "tasks": [
          {
            "id": "1-1",
            "name": "Refactor breakpoints",
            "description": "Update layout.tsx breakpoints for new devices",
            "files": ["src/layout.tsx"],
            "acceptanceCriteria": [
              "All breakpoints defined in constants",
              "Tests updated for new sizes"
            ]
          }
        ]
      }
    ]
  }
}
```

Send that payload to `spectacular_execute` (or `subagent_execute`), optionally adding `base_branch` or `tasks` overrides. The executor will bootstrap skills, create worktrees, run Codex CLI subagents, and expose progress via `subagent_status`.

## When to Use Inline Plans

- **Codex-specific commands** where you already parsed `plan.md` or generated tasks programmatically.
- **Automation/testing** that synthesizes tasks without writing markdown files.
- **Partial re-runs** where you filter tasks before calling the MCP tool (e.g., resume only phase 2 tasks).

If you still want the MCP server to parse markdown, pass `plan_path` instead. The inline plan simply skips that step and gives you full control over the task structure you send.
