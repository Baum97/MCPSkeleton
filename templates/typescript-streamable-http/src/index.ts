#!/usr/bin/env node
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { z } from 'zod';

const PORT = Number(process.env.PORT ?? 3000);
// 127.0.0.1 (the default) enables DNS-rebinding protection automatically.
// Set HOST=0.0.0.0 in a container and list public hostnames in ALLOWED_HOSTS.
const HOST = process.env.HOST ?? '127.0.0.1';
const ALLOWED_HOSTS = process.env.ALLOWED_HOSTS?.split(',').map((h) => h.trim());

/**
 * Build a fresh server per request. In stateless mode nothing is shared
 * between requests, so this scales horizontally behind any load balancer.
 */
function buildServer(): McpServer {
  const server = new McpServer({ name: '{{projectName}}', version: '0.1.0' });

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

  return server;
}

const app = createMcpExpressApp({ host: HOST, allowedHosts: ALLOWED_HOSTS });

app.post('/mcp', async (req: Request, res: Response) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('Error handling MCP request:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// Stateless servers have no session stream to open or close.
const methodNotAllowed = (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
};
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

const httpServer = app.listen(PORT, HOST, (err?: Error) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
  console.error(`{{projectName}} MCP server listening on http://${HOST}:${PORT}/mcp`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    httpServer.close(() => process.exit(0));
  });
}
