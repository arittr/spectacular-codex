/**
 * Integration tests for MCP server core (index.ts).
 *
 * These tests verify:
 * - MCP server initialization
 * - Tool registration (execute, status)
 * - Error handling at tool boundary
 * - Job state sharing across handlers
 *
 * @module index.test
 */

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionJob } from '@/types';

// Mock the MCP SDK
const mockConnect = vi.fn();
const mockSetRequestHandler = vi.fn();
const _mockListToolsHandler = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class MockServer {
    constructor(
      public info: { name: string; version: string },
      public options: { capabilities: { tools: object } }
    ) {}
    connect = mockConnect;
    setRequestHandler = mockSetRequestHandler;
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class MockTransport {},
}));

// Mock handlers
const mockExecuteHandler = vi.fn();
const mockStatusHandler = vi.fn();

vi.mock('@/handlers/execute', () => ({
  handleExecute: mockExecuteHandler,
}));

vi.mock('@/handlers/status', () => ({
  handleStatus: mockStatusHandler,
}));

describe('MCP Server Core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('registers tools/call request handler', async () => {
    // Import triggers server initialization
    await import('@/index');

    // Server should register a tools/call handler
    expect(mockSetRequestHandler).toHaveBeenCalledWith(CallToolRequestSchema, expect.any(Function));
  });

  it('registers tools/list request handler', async () => {
    // Import triggers server initialization
    await import('@/index');

    // Server should register a tools/list handler
    expect(mockSetRequestHandler).toHaveBeenCalledWith(
      ListToolsRequestSchema,
      expect.any(Function)
    );
  });

  it('routes spectacular_execute to handleExecute', async () => {
    mockExecuteHandler.mockResolvedValue({
      run_id: 'abc123',
      status: 'started',
    });

    await import('@/index');

    // Get the registered handler
    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === CallToolRequestSchema
    )?.[1];

    expect(callHandler).toBeDefined();

    // Call the handler
    const result = await callHandler({
      params: {
        arguments: { plan_path: 'specs/abc123/plan.md' },
        name: 'spectacular_execute',
      },
    });

    expect(mockExecuteHandler).toHaveBeenCalledWith(
      { plan_path: 'specs/abc123/plan.md' },
      expect.any(Map) // jobs tracker
    );

    expect(result).toEqual({
      run_id: 'abc123',
      status: 'started',
    });
  });

  it('routes subagent_status to handleStatus', async () => {
    mockStatusHandler.mockResolvedValue({
      phase: 1,
      run_id: 'abc123',
      status: 'running',
      tasks: [],
    });

    await import('@/index');

    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === CallToolRequestSchema
    )?.[1];

    const result = await callHandler({
      params: {
        arguments: { run_id: 'abc123' },
        name: 'subagent_status',
      },
    });

    expect(mockStatusHandler).toHaveBeenCalledWith({ run_id: 'abc123' }, expect.any(Map));

    expect(result).toEqual({
      phase: 1,
      run_id: 'abc123',
      status: 'running',
      tasks: [],
    });
  });

  it('returns error response for unknown tool', async () => {
    await import('@/index');

    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === CallToolRequestSchema
    )?.[1];

    const result = await callHandler({
      params: {
        arguments: {},
        name: 'unknown_tool',
      },
    });

    expect(result).toEqual({
      content: [
        {
          text: JSON.stringify({ error: 'Unknown tool: unknown_tool' }, null, 2),
          type: 'text',
        },
      ],
      isError: true,
    });
  });

  it('catches handler errors and formats response', async () => {
    mockExecuteHandler.mockRejectedValue(new Error('Plan not found'));

    await import('@/index');

    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === CallToolRequestSchema
    )?.[1];

    const result = await callHandler({
      params: {
        arguments: { plan_path: 'invalid.md' },
        name: 'spectacular_execute',
      },
    });

    expect(result).toEqual({
      content: [
        {
          text: JSON.stringify({ error: 'Plan not found' }, null, 2),
          type: 'text',
        },
      ],
      isError: true,
    });
  });

  it('shares job state across handlers', async () => {
    // Setup: Execute creates a job
    mockExecuteHandler.mockImplementation(
      async (_args: unknown, jobs: Map<string, ExecutionJob>) => {
        jobs.set('abc123', {
          phase: 1,
          runId: 'abc123',
          startedAt: new Date(),
          status: 'running',
          tasks: [],
          totalPhases: 2,
        });
        return {
          content: [
            {
              text: JSON.stringify({ run_id: 'abc123', status: 'started' }, null, 2),
              type: 'text',
            },
          ],
          isError: false,
        };
      }
    );

    // Setup: Status retrieves the job
    mockStatusHandler.mockImplementation(
      async (_args: unknown, jobs: Map<string, ExecutionJob>) => {
        const job = jobs.get('abc123');
        if (!job) throw new Error('Job not found');
        return {
          content: [
            {
              text: JSON.stringify(
                {
                  phase: job.phase,
                  run_id: job.runId,
                  status: job.status,
                  tasks: job.tasks,
                },
                null,
                2
              ),
              type: 'text',
            },
          ],
          isError: false,
        };
      }
    );

    await import('@/index');

    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === CallToolRequestSchema
    )?.[1];

    // Execute
    await callHandler({
      params: {
        arguments: { plan_path: 'specs/abc123/plan.md' },
        name: 'spectacular_execute',
      },
    });

    // Status should see the job
    const statusResult = await callHandler({
      params: {
        arguments: { run_id: 'abc123' },
        name: 'subagent_status',
      },
    });

    // Parse the response text
    const parsedResult = JSON.parse(statusResult.content[0].text);

    expect(parsedResult).toEqual({
      phase: 1,
      run_id: 'abc123',
      status: 'running',
      tasks: [],
    });
  });

  it('returns tool list on tools/list request', async () => {
    await import('@/index');

    const listHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === ListToolsRequestSchema
    )?.[1];

    expect(listHandler).toBeDefined();

    const result = await listHandler();

    expect(result).toEqual({
      tools: [
        {
          description: expect.stringContaining('Execute implementation plan'),
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({
              plan: expect.any(Object),
            }),
            type: 'object',
          }),
          name: 'spectacular_execute',
        },
        {
          description: expect.stringContaining('Execute implementation plan'),
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({
              plan: expect.any(Object),
            }),
            type: 'object',
          }),
          name: 'subagent_execute',
        },
        {
          description: expect.stringContaining('Get execution status'),
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({
              run_id: expect.any(Object),
            }),
            type: 'object',
          }),
          name: 'subagent_status',
        },
      ],
    });
  });
});
