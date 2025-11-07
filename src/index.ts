import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TaskStore, ConflictError, ArchivedError, NotFoundError } from './store.js';

async function main() {
  const store = new TaskStore({ baseDir: '.wind-task' });
  await store.init();

  const server = new Server(
    { name: 'mcp-task-server', version: '0.2.0' },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Resources: list static resources and templates
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'tasks://index',
          name: 'Task Index',
          description: 'Compact list of tasks with state and archive flag',
          mimeType: 'application/json',
        },
        {
          uri: 'tasks://board',
          name: 'Task Board',
          description: 'Kanban with TODO/ACTIVE/DONE and ARCHIVED',
          mimeType: 'application/json',
        },
      ],
    } as any;
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: [
        {
          uriTemplate: 'tasks://task/{id}',
          name: 'Task View',
          description: 'Full task JSON for a given task id',
          mimeType: 'application/json',
        },
        {
          uriTemplate: 'tasks://timeline/{id}',
          name: 'Task Timeline',
          description: 'Event stream for a given task id',
          mimeType: 'application/json',
        },
      ],
    } as any;
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const jsonText = await renderResourceUri(store, uri);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: jsonText,
        },
      ],
    } as any;
  });

  // Tools: list and call
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'create_task',
          description: 'Create a new task in TODO with an optional summary',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
              actor: { type: 'string', description: 'actor id, e.g., agent:llm' },
            },
            required: ['title', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'retitle',
          description: 'Change task title',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['id', 'title', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'set_state',
          description: 'Set task state to TODO|ACTIVE|DONE (accepts legacy IN_DEV/FINISHED)',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              state: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['id', 'state', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'append_log',
          description: 'Append a log message to a task',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              message: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['id', 'message', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'set_summary',
          description: 'Set or update the task summary',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              summary: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['id', 'summary', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'archive',
          description: 'Archive a task (blocks all other mutations)',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              reason: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['id', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'unarchive',
          description: 'Unarchive a task',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['id', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
      ],
    } as any;
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params as any;
    try {
      let task: any;
      switch (name) {
        case 'create_task': {
          const { title, summary, actor } = args || {};
          task = await store.createTask(String(title), summary ? String(summary) : undefined, { actor: String(actor) });
          break;
        }
        case 'retitle': {
          const { id, title, expected_last_seq, actor } = args || {};
          task = await store.retitle(String(id), String(title), { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        case 'set_state': {
          const { id, state, expected_last_seq, actor } = args || {};
          task = await store.setState(String(id), String(state), { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        case 'append_log': {
          const { id, message, expected_last_seq, actor } = args || {};
          task = await store.appendLog(String(id), String(message), { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        case 'set_summary': {
          const { id, summary, expected_last_seq, actor } = args || {};
          task = await store.setSummary(String(id), String(summary), { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        case 'archive': {
          const { id, reason, expected_last_seq, actor } = args || {};
          task = await store.archive(String(id), reason != null ? String(reason) : undefined, { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        case 'unarchive': {
          const { id, expected_last_seq, actor } = args || {};
          task = await store.unarchive(String(id), { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: true, task }, null, 2),
          },
        ],
      } as any;
    } catch (err: any) {
      const res = normalizeError(err);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(res, null, 2),
          },
        ],
      } as any;
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function normalizeError(err: any) {
  if (err instanceof ConflictError) return { ok: false, error: 'conflict', message: err.message };
  if (err instanceof ArchivedError) return { ok: false, error: 'archived', message: err.message };
  if (err instanceof NotFoundError) return { ok: false, error: 'not_found', message: err.message };
  return { ok: false, error: 'unknown', message: String(err?.message ?? err) };
}

async function renderResourceUri(store: TaskStore, uri: string): Promise<string> {
  if (uri === 'tasks://index') {
    const v = await store.indexView();
    return JSON.stringify(v, null, 2);
  }
  if (uri === 'tasks://board') {
    const v = await store.boardView();
    return JSON.stringify(v, null, 2);
  }
  if (uri.startsWith('tasks://task/')) {
    const id = uri.substring('tasks://task/'.length);
    const v = await store.getTask(id);
    return JSON.stringify(v, null, 2);
  }
  if (uri.startsWith('tasks://timeline/')) {
    const id = uri.substring('tasks://timeline/'.length);
    const v = await store.timelineView(id);
    return JSON.stringify(v, null, 2);
  }
  throw new Error(`Unknown resource URI: ${uri}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
