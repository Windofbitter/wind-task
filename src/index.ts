import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TaskStore, ConflictError, ArchivedError, NotFoundError } from './store.js';

// Types local to server responses
type JSONValue = any;

async function main() {
  const store = new TaskStore({ baseDir: '.wind-task' });
  await store.init();

  const server = new Server(
    { name: 'mcp-task-server', version: '0.1.0' },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Resources
  server.resource(
    {
      uri: 'tasks://index',
      name: 'Task Index',
      description: 'Compact list of tasks with state and archive flag',
      mimeType: 'application/json',
    },
    async () => {
      const view = await store.indexView();
      return [{ type: 'text', text: JSON.stringify(view, null, 2) }];
    }
  );

  server.resource(
    {
      uri: 'tasks://board',
      name: 'Task Board',
      description: 'Kanban view with TODO/ACTIVE/DONE and ARCHIVED columns',
      mimeType: 'application/json',
    },
    async () => {
      const view = await store.boardView();
      return [{ type: 'text', text: JSON.stringify(view, null, 2) }];
    }
  );

  server.resourceTemplate(
    {
      uriTemplate: 'tasks://task/{id}',
      name: 'Task View',
      description: 'Full task JSON for a given task id',
      mimeType: 'application/json',
    },
    async ({ id }) => {
      const task = await store.getTask(id);
      return [{ type: 'text', text: JSON.stringify(task, null, 2) }];
    }
  );

  server.resourceTemplate(
    {
      uriTemplate: 'tasks://timeline/{id}',
      name: 'Task Timeline',
      description: 'Full event stream for a given task id',
      mimeType: 'application/json',
    },
    async ({ id }) => {
      const view = await store.timelineView(id);
      return [{ type: 'text', text: JSON.stringify(view, null, 2) }];
    }
  );

  // Tools
  server.tool(
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
    async ({ title, summary, actor }): Promise<JSONValue> => {
      const task = await store.createTask(title, summary, { actor });
      return { ok: true, task };
    }
  );

  server.tool(
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
    async ({ id, title, expected_last_seq, actor }) => mutateWrap(() => store.retitle(id, title, { expected_last_seq, actor }))
  );

  server.tool(
    {
      name: 'set_state',
      description: 'Set task state to TODO|ACTIVE|DONE (maps legacy states)',
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
    async ({ id, state, expected_last_seq, actor }) => mutateWrap(() => store.setState(id, state, { expected_last_seq, actor }))
  );

  server.tool(
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
    async ({ id, message, expected_last_seq, actor }) => mutateWrap(() => store.appendLog(id, message, { expected_last_seq, actor }))
  );

  server.tool(
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
    async ({ id, summary, expected_last_seq, actor }) => mutateWrap(() => store.setSummary(id, summary, { expected_last_seq, actor }))
  );

  server.tool(
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
    async ({ id, reason, expected_last_seq, actor }) => mutateWrap(() => store.archive(id, reason, { expected_last_seq, actor }))
  );

  server.tool(
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
    async ({ id, expected_last_seq, actor }) => mutateWrap(() => store.unarchive(id, { expected_last_seq, actor }))
  );

  function errorToResult(err: any) {
    if (err instanceof ConflictError) {
      return { ok: false, error: 'conflict', message: err.message };
    }
    if (err instanceof ArchivedError) {
      return { ok: false, error: 'archived', message: err.message };
    }
    if (err instanceof NotFoundError) {
      return { ok: false, error: 'not_found', message: err.message };
    }
    return { ok: false, error: 'unknown', message: String(err?.message ?? err) };
  }

  async function mutateWrap<T>(fn: () => Promise<T>) {
    try {
      const task = (await fn()) as any;
      return { ok: true, task };
    } catch (err) {
      return errorToResult(err);
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
