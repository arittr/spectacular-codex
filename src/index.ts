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
import { handlePlan } from '@/handlers/plan';
import { handleSpec } from '@/handlers/spec';
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
          'Execute implementation plan with automatic parallel/sequential orchestration. Returns immediately with run_id for status polling.',
        inputSchema: {
          properties: {
            plan_path: {
              description: 'Path to plan.md file (e.g., specs/abc123/plan.md)',
              type: 'string',
            },
          },
          required: ['plan_path'],
          type: 'object',
        },
        name: 'spectacular_execute',
      },
      {
        description:
          'Get execution status for a running or completed job. Shows current phase, task statuses, and completion timestamps.',
        inputSchema: {
          properties: {
            run_id: {
              description: 'Run identifier returned by spectacular_execute',
              type: 'string',
            },
          },
          required: ['run_id'],
          type: 'object',
        },
        name: 'spectacular_status',
      },
      {
        description:
          'Generate feature specification using brainstorming and writing-specs skill. Creates spec.md in specs/{slug}/ directory.',
        inputSchema: {
          properties: {
            feature_request: {
              description: 'Brief feature description to elaborate via brainstorming',
              type: 'string',
            },
          },
          required: ['feature_request'],
          type: 'object',
        },
        name: 'spectacular_spec',
      },
      {
        description:
          'Generate implementation plan from specification. Creates plan.md with sequential/parallel phase decomposition.',
        inputSchema: {
          properties: {
            spec_path: {
              description: 'Path to spec.md file (e.g., specs/my-feature/spec.md)',
              type: 'string',
            },
          },
          required: ['spec_path'],
          type: 'object',
        },
        name: 'spectacular_plan',
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
        return await handleExecute(args, jobs);
      case 'spectacular_status':
        return await handleStatus(args, jobs);
      case 'spectacular_spec':
        return await handleSpec(args, jobs);
      case 'spectacular_plan':
        return await handlePlan(args, jobs);
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
