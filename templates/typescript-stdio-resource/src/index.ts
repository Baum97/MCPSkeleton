#!/usr/bin/env node
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: '{{projectName}}',
  version: '0.1.0',
});

// Static resource — a single fixed URI.
server.registerResource(
  'server-info',
  'info://server',
  {
    title: 'Server info',
    description: 'Basic information about this MCP server.',
    mimeType: 'application/json',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({ name: '{{projectName}}', version: '0.1.0' }, null, 2),
      },
    ],
  }),
);

// Templated resource — URI pattern with a variable.
server.registerResource(
  'greeting',
  new ResourceTemplate('greeting://{name}', { list: undefined }),
  {
    title: 'Greeting',
    description: 'A friendly greeting addressed to {name}.',
    mimeType: 'text/plain',
  },
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/plain',
        text: `Hello, ${name}!`,
      },
    ],
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
