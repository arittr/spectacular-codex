/**
 * Integration tests for MCP server core (index.ts).
 *
 * These tests verify:
 * - MCP server initialization
 * - Tool registration (execute, status, spec, plan)
 * - Error handling at tool boundary
 * - Job state sharing across handlers
 *
 * @module index.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionJob } from './types.js';

// Mock the MCP SDK
const mockConnect = vi.fn();
const mockSetRequestHandler = vi.fn();
const mockListToolsHandler = vi.fn();

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
const mockSpecHandler = vi.fn();
const mockPlanHandler = vi.fn();

vi.mock('./handlers/execute.js', () => ({
  handleExecute: mockExecuteHandler,
}));

vi.mock('./handlers/status.js', () => ({
  handleStatus: mockStatusHandler,
}));

vi.mock('./handlers/spec.js', () => ({
  handleSpec: mockSpecHandler,
}));

vi.mock('./handlers/plan.js', () => ({
  handlePlan: mockPlanHandler,
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
    await import('./index.js');

    // Server should register a tools/call handler
    expect(mockSetRequestHandler).toHaveBeenCalledWith('tools/call', expect.any(Function));
  });

  it('registers tools/list request handler', async () => {
    // Import triggers server initialization
    await import('./index.js');

    // Server should register a tools/list handler
    expect(mockSetRequestHandler).toHaveBeenCalledWith('tools/list', expect.any(Function));
  });

  it('routes spectacular_execute to handleExecute', async () => {
    mockExecuteHandler.mockResolvedValue({
      run_id: 'abc123',
      status: 'started',
    });

    await import('./index.js');

    // Get the registered handler
    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === 'tools/call'
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

  it('routes spectacular_status to handleStatus', async () => {
    mockStatusHandler.mockResolvedValue({
      phase: 1,
      run_id: 'abc123',
      status: 'running',
      tasks: [],
    });

    await import('./index.js');

    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === 'tools/call'
    )?.[1];

    const result = await callHandler({
      params: {
        arguments: { run_id: 'abc123' },
        name: 'spectacular_status',
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

  it('routes spectacular_spec to handleSpec', async () => {
    mockSpecHandler.mockResolvedValue({
      feature_slug: 'my-feature',
      status: 'created',
    });

    await import('./index.js');

    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === 'tools/call'
    )?.[1];

    const result = await callHandler({
      params: {
        arguments: { description: 'Test feature' },
        name: 'spectacular_spec',
      },
    });

    expect(mockSpecHandler).toHaveBeenCalledWith({
      description: 'Test feature',
    });

    expect(result).toEqual({
      feature_slug: 'my-feature',
      status: 'created',
    });
  });

  it('routes spectacular_plan to handlePlan', async () => {
    mockPlanHandler.mockResolvedValue({
      run_id: 'abc123',
      status: 'created',
    });

    await import('./index.js');

    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === 'tools/call'
    )?.[1];

    const result = await callHandler({
      params: {
        arguments: { spec_path: 'specs/my-feature/spec.md' },
        name: 'spectacular_plan',
      },
    });

    expect(mockPlanHandler).toHaveBeenCalledWith({
      spec_path: 'specs/my-feature/spec.md',
    });

    expect(result).toEqual({
      run_id: 'abc123',
      status: 'created',
    });
  });

  it('returns error response for unknown tool', async () => {
    await import('./index.js');

    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === 'tools/call'
    )?.[1];

    const result = await callHandler({
      params: {
        arguments: {},
        name: 'unknown_tool',
      },
    });

    expect(result).toEqual({
      error: 'Unknown tool: unknown_tool',
      status: 'failed',
    });
  });

  it('catches handler errors and formats response', async () => {
    mockExecuteHandler.mockRejectedValue(new Error('Plan not found'));

    await import('./index.js');

    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === 'tools/call'
    )?.[1];

    const result = await callHandler({
      params: {
        arguments: { plan_path: 'invalid.md' },
        name: 'spectacular_execute',
      },
    });

    expect(result).toEqual({
      error: 'Plan not found',
      status: 'failed',
    });
  });

  it('shares job state across handlers', async () => {
    // Setup: Execute creates a job
    mockExecuteHandler.mockImplementation(
      async (args: unknown, jobs: Map<string, ExecutionJob>) => {
        jobs.set('abc123', {
          phase: 1,
          runId: 'abc123',
          startedAt: new Date(),
          status: 'running',
          tasks: [],
          totalPhases: 2,
        });
        return { run_id: 'abc123', status: 'started' };
      }
    );

    // Setup: Status retrieves the job
    mockStatusHandler.mockImplementation(async (args: unknown, jobs: Map<string, ExecutionJob>) => {
      const job = jobs.get('abc123');
      if (!job) throw new Error('Job not found');
      return {
        phase: job.phase,
        run_id: job.runId,
        status: job.status,
        tasks: job.tasks,
      };
    });

    await import('./index.js');

    const callHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === 'tools/call'
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
        name: 'spectacular_status',
      },
    });

    expect(statusResult).toEqual({
      phase: 1,
      run_id: 'abc123',
      status: 'running',
      tasks: [],
    });
  });

  it('returns tool list on tools/list request', async () => {
    await import('./index.js');

    const listHandler = mockSetRequestHandler.mock.calls.find(
      (call) => call[0] === 'tools/list'
    )?.[1];

    expect(listHandler).toBeDefined();

    const result = await listHandler();

    expect(result).toEqual({
      tools: [
        {
          description: expect.stringContaining('Execute implementation plan'),
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({
              plan_path: expect.any(Object),
            }),
            type: 'object',
          }),
          name: 'spectacular_execute',
        },
        {
          description: expect.stringContaining('Get execution status'),
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({
              run_id: expect.any(Object),
            }),
            type: 'object',
          }),
          name: 'spectacular_status',
        },
        {
          description: expect.stringContaining('Generate feature specification'),
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({
              description: expect.any(Object),
            }),
            type: 'object',
          }),
          name: 'spectacular_spec',
        },
        {
          description: expect.stringContaining('Generate implementation plan'),
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({
              spec_path: expect.any(Object),
            }),
            type: 'object',
          }),
          name: 'spectacular_plan',
        },
      ],
    });
  });
});
