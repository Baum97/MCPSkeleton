#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: '{{projectName}}',
  version: '0.1.0',
});

server.tool(
  'echo',
  'Echo a message back to the caller.',
  { message: z.string().describe('The message to echo back') },
  async ({ message }) => ({
    content: [{ type: 'text', text: `You said: ${message}` }],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('{{projectName}} MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
