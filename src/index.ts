#!/usr/bin/env node

/**
 * MCP server entry point for spectacular-codex.
 *
 * This module:
 * - Initializes the MCP server with stdio transport
 * - Registers 4 tools (execute, status, spec, plan)
 * - Manages in-memory job state shared across handlers
 * - Implements error handling at tool boundary
 *
 * @module index
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { handleExecute } from '@/handlers/execute';
import { handleStatus } from '@/handlers/status';
import type { ExecutionJob } from '@/types';
import { formatMCPError } from '@/utils/mcp-response';

// Job tracker (in-memory state shared across handlers)
const jobs = new Map<string, ExecutionJob>();

// Create MCP server
const server = new Server(
  {
    name: 'spectacular-codex',
    version: '0.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools/list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        description:
          'Execute implementation plan by spawning Codex CLI subagents per task. Returns run_id for status polling.',
        inputSchema: {
          properties: {
            base_branch: {
              description: 'Optional base branch for .worktrees/{runId}-main (defaults to main)',
              type: 'string',
            },
            plan: {
              description:
                'Inline plan object ({ runId, featureSlug?, phases: [{ id, name, strategy, tasks: [...] }] })',
              type: 'object',
            },
            plan_path: {
              description: 'Path to plan.md file (e.g., specs/abc123/plan.md)',
              type: 'string',
            },
            tasks: {
              description:
                'Optional array of task overrides ({ id, branch?, worktree_path? }) to filter execution',
              items: {
                properties: {
                  branch: { type: 'string' },
                  id: { type: 'string' },
                  worktree_path: { type: 'string' },
                },
                required: ['id'],
                type: 'object',
              },
              type: 'array',
            },
          },
          required: [],
          type: 'object',
        },
        name: 'spectacular_execute',
      },
      {
        description:
          'Execute implementation plan by spawning Codex CLI subagents per task. Alias for spectacular_execute.',
        inputSchema: {
          properties: {
            base_branch: {
              description: 'Optional base branch for .worktrees/{runId}-main (defaults to main)',
              type: 'string',
            },
            plan: {
              description:
                'Inline plan object ({ runId, featureSlug?, phases: [{ id, name, strategy, tasks: [...] }] })',
              type: 'object',
            },
            plan_path: {
              description: 'Path to plan.md file (e.g., specs/abc123/plan.md)',
              type: 'string',
            },
            tasks: {
              description:
                'Optional array of task overrides ({ id, branch?, worktree_path? }) to filter execution',
              items: {
                properties: {
                  branch: { type: 'string' },
                  id: { type: 'string' },
                  worktree_path: { type: 'string' },
                },
                required: ['id'],
                type: 'object',
              },
              type: 'array',
            },
          },
          required: [],
          type: 'object',
        },
        name: 'subagent_execute',
      },
      {
        description:
          'Get execution status for a running or completed subagent job. Shows current phase, task statuses, and completion timestamps.',
        inputSchema: {
          properties: {
            run_id: {
              description: 'Run identifier returned by spectacular_execute/subagent_execute',
              type: 'string',
            },
          },
          required: ['run_id'],
          type: 'object',
        },
        name: 'subagent_status',
      },
    ],
  };
});

// Register tools/call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // biome-ignore lint/suspicious/noExplicitAny: MCP SDK request params use any
  const { name, arguments: args } = request.params as { name: string; arguments: any };

  try {
    switch (name) {
      case 'spectacular_execute':
      case 'subagent_execute':
        return await handleExecute(args, jobs);
      case 'subagent_status':
        return await handleStatus(args, jobs);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Error handling at layer boundary (MCP format)
    return formatMCPError(error instanceof Error ? error : new Error(String(error)));
  }
});

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run main() unless we're in test mode (NODE_ENV=test or vitest detected)
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
if (!isTest) {
  // biome-ignore lint/suspicious/noConsole: Entry point needs error logging
  main().catch(console.error);
}

// Export for testing
export { server, jobs };
