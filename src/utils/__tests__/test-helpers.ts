/**
 * Test helper utilities for MCP response handling.
 *
 * @module utils/__tests__/test-helpers
 */

import type { MCPToolResponse } from '@/utils/mcp-response';

/**
 * Extracts data from an MCP tool response.
 *
 * Parses the JSON string from the first text content item.
 *
 * @param response - MCP tool response
 * @returns Parsed data object
 *
 * @example
 * ```typescript
 * const response = await handleSpec({ feature_request: 'Add dark mode' }, jobs);
 * const data = extractMCPData(response);
 * expect(data.run_id).toMatch(/^[0-9a-f]{6}$/);
 * ```
 */
export function extractMCPData<T = unknown>(response: MCPToolResponse): T {
  const firstContent = response.content[0];
  if (!firstContent || firstContent.type !== 'text') {
    throw new Error('Expected text content in MCP response');
  }
  return JSON.parse(firstContent.text) as T;
}
