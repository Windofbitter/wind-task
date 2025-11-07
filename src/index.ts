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
import { loadProjects, isValidProjectName, configPath } from './config.js';

async function main() {
  // Load project mapping from user config and cache TaskStores per project
  const projects = await loadProjects();
  const stores = new Map<string, TaskStore>();

  async function storeFor(project: string | undefined): Promise<TaskStore> {
    if (!project) {
      throw new Error(`Missing required 'project'. Define mappings in ${configPath()} and include project on each request.`);
    }
    if (!isValidProjectName(project)) {
      throw new Error(`Invalid project name: ${project}`);
    }
    const baseDir = projects[project];
    if (!baseDir) {
      const known = Object.keys(projects);
      const hint = known.length ? `Known projects: ${known.join(', ')}` : `No projects configured at ${configPath()}`;
      throw new Error(`Unknown project: ${project}. ${hint}`);
    }
    let s = stores.get(project);
    if (!s) {
      s = new TaskStore({ baseDir });
      await s.init();
      stores.set(project, s);
    }
    return s;
  }

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
          description: 'Compact list of tasks (use ?project=NAME when reading)',
          mimeType: 'application/json',
        },
        {
          uri: 'tasks://board',
          name: 'Task Board',
          description: 'Kanban with TODO/ACTIVE/DONE and ARCHIVED (use ?project=NAME)',
          mimeType: 'application/json',
        },
      ],
    } as any;
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: [
        {
          uriTemplate: 'tasks://task/{id}?project={project}',
          name: 'Task View',
          description: 'Full task JSON for a given task id',
          mimeType: 'application/json',
        },
        {
          uriTemplate: 'tasks://timeline/{id}?project={project}',
          name: 'Task Timeline',
          description: 'Event stream for a given task id',
          mimeType: 'application/json',
        },
        {
          uriTemplate: 'tasks://content/{id}?project={project}',
          name: 'Task Content',
          description: 'Long-form content for a given task id',
          mimeType: 'text/markdown',
        },
      ],
    } as any;
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const qIndex = uri.indexOf('?');
    const cleanUri = qIndex >= 0 ? uri.substring(0, qIndex) : uri;
    const query = qIndex >= 0 ? new URLSearchParams(uri.substring(qIndex + 1)) : undefined;
    const project = query?.get('project') ?? undefined;
    const s = await storeFor(project);
    const jsonText = await renderResourceUri(s, cleanUri);
    return {
      contents: [
        {
          uri,
          mimeType: cleanUri.startsWith('tasks://content/') ? 'text/markdown' : 'application/json',
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
              project: { type: 'string', description: 'Project key name' },
              title: { type: 'string' },
              summary: { type: 'string' },
              actor: { type: 'string', description: 'actor id, e.g., agent:llm' },
            },
            required: ['project', 'title', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'retitle',
          description: 'Change task title',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              id: { type: 'string' },
              title: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['project', 'id', 'title', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'set_state',
          description: 'Set task state to TODO|ACTIVE|DONE',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              id: { type: 'string' },
              state: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['project', 'id', 'state', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'append_log',
          description: 'Append a log message to a task',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              id: { type: 'string' },
              message: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['project', 'id', 'message', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'set_summary',
          description: 'Set or update the task summary',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              id: { type: 'string' },
              summary: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['project', 'id', 'summary', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'set_content',
          description: 'Set or replace the long-form task content (markdown)',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              id: { type: 'string' },
              content: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
              format: { type: 'string', enum: ['markdown', 'text'] },
            },
            required: ['project', 'id', 'content', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'archive',
          description: 'Archive a task (blocks all other mutations)',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              id: { type: 'string' },
              reason: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['project', 'id', 'expected_last_seq', 'actor'],
            additionalProperties: false,
          },
        },
        {
          name: 'unarchive',
          description: 'Unarchive a task',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string' },
              id: { type: 'string' },
              expected_last_seq: { type: 'number' },
              actor: { type: 'string' },
            },
            required: ['project', 'id', 'expected_last_seq', 'actor'],
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
          const { project, title, summary, actor } = args || {};
          const s = await storeFor(project ? String(project) : undefined);
          task = await s.createTask(String(title), summary ? String(summary) : undefined, { actor: String(actor) });
          break;
        }
        case 'retitle': {
          const { project, id, title, expected_last_seq, actor } = args || {};
          const s = await storeFor(project ? String(project) : undefined);
          task = await s.retitle(String(id), String(title), { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        case 'set_state': {
          const { project, id, state, expected_last_seq, actor } = args || {};
          const s = await storeFor(project ? String(project) : undefined);
          task = await s.setState(String(id), String(state), { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        case 'append_log': {
          const { project, id, message, expected_last_seq, actor } = args || {};
          const s = await storeFor(project ? String(project) : undefined);
          task = await s.appendLog(String(id), String(message), { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        case 'set_summary': {
          const { project, id, summary, expected_last_seq, actor } = args || {};
          const s = await storeFor(project ? String(project) : undefined);
          task = await s.setSummary(String(id), String(summary), { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        case 'set_content': {
          const { project, id, content, expected_last_seq, actor, format } = args || {};
          const s = await storeFor(project ? String(project) : undefined);
          task = await s.setContent(String(id), String(content), { expected_last_seq: Number(expected_last_seq), actor: String(actor) }, format ? String(format) as any : 'markdown');
          break;
        }
        case 'archive': {
          const { project, id, reason, expected_last_seq, actor } = args || {};
          const s = await storeFor(project ? String(project) : undefined);
          task = await s.archive(String(id), reason != null ? String(reason) : undefined, { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
          break;
        }
        case 'unarchive': {
          const { project, id, expected_last_seq, actor } = args || {};
          const s = await storeFor(project ? String(project) : undefined);
          task = await s.unarchive(String(id), { expected_last_seq: Number(expected_last_seq), actor: String(actor) });
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
  if (uri.startsWith('tasks://content/')) {
    const id = uri.substring('tasks://content/'.length);
    const v = await store.readContent(id);
    return v.content; // plain text/markdown
  }
  throw new Error(`Unknown resource URI: ${uri}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
