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
import type { ExecutionJob } from './types.js';
import { handleExecute } from './handlers/execute.js';
import { handleStatus } from './handlers/status.js';
import { handleSpec } from './handlers/spec.js';
import { handlePlan } from './handlers/plan.js';

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
// @ts-expect-error - MCP SDK types are complex, using runtime approach
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'spectacular_execute',
        description:
          'Execute implementation plan with automatic parallel/sequential orchestration. Returns immediately with run_id for status polling.',
        inputSchema: {
          type: 'object',
          properties: {
            plan_path: {
              type: 'string',
              description: 'Path to plan.md file (e.g., specs/abc123/plan.md)',
            },
          },
          required: ['plan_path'],
        },
      },
      {
        name: 'spectacular_status',
        description:
          'Get execution status for a running or completed job. Shows current phase, task statuses, and completion timestamps.',
        inputSchema: {
          type: 'object',
          properties: {
            run_id: {
              type: 'string',
              description: 'Run identifier returned by spectacular_execute',
            },
          },
          required: ['run_id'],
        },
      },
      {
        name: 'spectacular_spec',
        description:
          'Generate feature specification using brainstorming and writing-specs skill. Creates spec.md in specs/{slug}/ directory.',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Brief feature description to elaborate via brainstorming',
            },
          },
          required: ['description'],
        },
      },
      {
        name: 'spectacular_plan',
        description:
          'Generate implementation plan from specification. Creates plan.md with sequential/parallel phase decomposition.',
        inputSchema: {
          type: 'object',
          properties: {
            spec_path: {
              type: 'string',
              description: 'Path to spec.md file (e.g., specs/my-feature/spec.md)',
            },
          },
          required: ['spec_path'],
        },
      },
    ],
  };
});

// Register tools/call handler
// @ts-expect-error - MCP SDK types are complex, using runtime approach
server.setRequestHandler('tools/call', async (request) => {
  // biome-ignore lint/suspicious/noExplicitAny: MCP SDK types use any
  // @ts-expect-error - request params available at runtime
  const { name, arguments: args } = request.params as { name: string; arguments: any };

  try {
    switch (name) {
      case 'spectacular_execute':
        return await handleExecute(args, jobs);
      case 'spectacular_status':
        return await handleStatus(args, jobs);
      case 'spectacular_spec':
        return await handleSpec(args);
      case 'spectacular_plan':
        return await handlePlan(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Error handling at layer boundary
    return {
      error: String(error instanceof Error ? error.message : error),
      status: 'failed',
    };
  }
});

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run main() if executed directly (not during tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

// Export for testing
export { server, jobs };
