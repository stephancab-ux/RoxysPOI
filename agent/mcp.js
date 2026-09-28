// =============================================================================
// MCP server over stdio: Atlas (or any MCP client) starts `roxys-agent mcp` and
// calls the tools. stdout carries the protocol, so logs go to stderr only.
// =============================================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import { TOOLS, VERSION, INSTRUCTIONS } from './tools.js';
import { ToolError } from './core.js';

function zodShape(input) {
  const shape = {};
  for (const [key, spec] of Object.entries(input)) {
    let s = spec.type === 'number' ? z.number() : spec.type === 'boolean' ? z.boolean() : z.string();
    s = s.describe(spec.description);
    shape[key] = spec.required ? s : s.optional();
  }
  return shape;
}

/** `opts` = { master?, docs? } path overrides from the command line. */
export async function startMcpServer(opts = {}) {
  const server = new McpServer({ name: 'roxys', version: VERSION }, { instructions: INSTRUCTIONS });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: zodShape(tool.input),
        annotations: { readOnlyHint: tool.readOnly, destructiveHint: false, idempotentHint: tool.readOnly, openWorldHint: false },
      },
      async (args) => {
        try {
          const result = await tool.run(args, opts);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (e) {
          if (!(e instanceof ToolError)) console.error(e);
          return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] };
        }
      }
    );
  }
  await server.connect(new StdioServerTransport());
  console.error(`roxys-agent ${VERSION}: MCP server ready (stdio).`);
}
