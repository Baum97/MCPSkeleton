#!/usr/bin/env node
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer(
  {
    name: '{{projectName}}',
    version: '0.1.0',
  },
  {
    // Shown to the model when it connects — describe what the server is for.
    instructions: 'Example server: arithmetic + time tools, a notes resource and a review prompt.',
  },
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

// A tool with structured output: `outputSchema` lets clients validate and
// consume `structuredContent` directly instead of parsing text.
server.registerTool(
  'add',
  {
    title: 'Add numbers',
    description: 'Add two numbers.',
    inputSchema: {
      a: z.number().describe('First addend'),
      b: z.number().describe('Second addend'),
    },
    outputSchema: { sum: z.number() },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ a, b }) => {
    const output = { sum: a + b };
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output,
    };
  },
);

server.registerTool(
  'get_time',
  {
    title: 'Current time',
    description: 'Return the current server time, optionally in a given IANA time zone.',
    inputSchema: {
      timeZone: z
        .string()
        .optional()
        .describe('IANA time zone, e.g. "Europe/Berlin". Defaults to UTC.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ timeZone }) => {
    try {
      const text = new Date().toLocaleString('en-US', { timeZone: timeZone ?? 'UTC' });
      return { content: [{ type: 'text', text }] };
    } catch {
      // Tool errors are reported in-band so the model can see and recover.
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown time zone: ${timeZone}` }],
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

const notes = new Map<string, string>([
  ['welcome', 'Welcome to {{projectName}}!'],
  ['todo', 'Replace these example notes with real data.'],
]);

server.registerResource(
  'note',
  new ResourceTemplate('note://{id}', {
    // `list` makes every note discoverable via resources/list.
    list: async () => ({
      resources: [...notes.keys()].map((id) => ({
        uri: `note://${id}`,
        name: id,
        mimeType: 'text/plain',
      })),
    }),
    // `complete` powers argument auto-completion in clients that support it.
    complete: {
      id: (value) => [...notes.keys()].filter((id) => id.startsWith(value)),
    },
  }),
  { title: 'Note', description: 'A plain-text note by id.', mimeType: 'text/plain' },
  async (uri, { id }) => {
    const text = notes.get(String(id));
    if (text === undefined) throw new Error(`Note not found: ${id}`);
    return { contents: [{ uri: uri.href, mimeType: 'text/plain', text }] };
  },
);

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

server.registerPrompt(
  'review-code',
  {
    title: 'Review code',
    description: 'Ask the model to review a code snippet.',
    argsSchema: {
      code: z.string().describe('The code to review'),
      focus: z.string().optional().describe('What to focus on, e.g. "security"'),
    },
  },
  ({ code, focus }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please review this code${focus ? `, focusing on ${focus}` : ''}:\n\n${code}`,
        },
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
