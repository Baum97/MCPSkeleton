#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: '{{projectName}}',
  version: '0.1.0',
});

server.registerTool(
  'echo',
  {
    title: 'Echo',
    description: 'Echo a message back to the caller.',
    inputSchema: { message: z.string().describe('The message to echo back') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ message }) => ({
    content: [{ type: 'text', text: `You said: ${message}` }],
  }),
);

// create-mcp-server:add — `npx @baum97/create-mcp-server add` inserts new tools, resources and prompts above this line.

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for JSON-RPC messages — log to stderr only.
  console.error('{{projectName}} MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
