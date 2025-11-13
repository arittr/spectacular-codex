/**
 * MCP response formatting utilities.
 *
 * This module provides helpers to format tool responses according to the MCP protocol.
 * All MCP tool responses must have a `content` array containing content items.
 *
 * @module utils/mcp-response
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP content item (text type).
 */
export interface MCPTextContent {
  type: 'text';
  text: string;
}

/**
 * MCP tool response format (re-export of CallToolResult).
 */
export type MCPToolResponse = CallToolResult;

/**
 * Formats a success response in MCP protocol format.
 *
 * Converts arbitrary data to MCP response with JSON-stringified text content.
 *
 * @param data - Response data to format
 * @returns MCP-formatted response
 *
 * @example
 * ```typescript
 * return formatMCPResponse({ run_id: 'abc123', status: 'started' });
 * // Returns:
 * // {
 * //   content: [
 * //     {
 * //       type: 'text',
 * //       text: '{"run_id":"abc123","status":"started"}'
 * //     }
 * //   ]
 * // }
 * ```
 */
export function formatMCPResponse(data: unknown): MCPToolResponse {
  return {
    content: [
      {
        text: JSON.stringify(data, null, 2),
        type: 'text',
      },
    ],
  };
}

/**
 * Formats an error response in MCP protocol format.
 *
 * Converts error message to MCP response with isError flag.
 *
 * @param error - Error message or Error object
 * @returns MCP-formatted error response
 *
 * @example
 * ```typescript
 * return formatMCPError('Plan file not found');
 * // Returns:
 * // {
 * //   content: [
 * //     {
 * //       type: 'text',
 * //       text: '{"error":"Plan file not found"}'
 * //     }
 * //   ],
 * //   isError: true
 * // }
 * ```
 */
export function formatMCPError(error: string | Error): MCPToolResponse {
  const errorMessage = error instanceof Error ? error.message : error;
  return {
    content: [
      {
        text: JSON.stringify({ error: errorMessage }, null, 2),
        type: 'text',
      },
    ],
    isError: true,
  };
}
