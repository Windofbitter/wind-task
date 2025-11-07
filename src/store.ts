import { promises as fs } from 'fs';
import { join } from 'path';
import {
  CURRENT_TASK_VERSION,
  EventType,
  MutationOptions,
  PaginationOptions,
  Task,
  TaskEvent,
  TaskState,
  StoreOptions,
  IndexItem,
  IndexView,
  BoardView,
  TimelineView,
} from './types.js';
import { ulid } from './id.js';

export class ConflictError extends Error {}
export class ArchivedError extends Error {}
export class NotFoundError extends Error {}

function nowISO(): string {
  return new Date().toISOString();
}

function isValidState(state: string): state is TaskState {
  return state === 'TODO' || state === 'ACTIVE' || state === 'DONE';
}

export class TaskStore {
  private baseDir: string;
  private maxLogMessageLength: number;
  private maxContentBytes: number;

  constructor(options: StoreOptions) {
    this.baseDir = options.baseDir;
    this.maxLogMessageLength = options.maxLogMessageLength ?? 2000;
    this.maxContentBytes = options.maxContentBytes ?? 200000; // 200 KB default
  }

  private taskDir(id: string): string {
    return join(this.baseDir, id);
  }

  private taskFile(id: string): string {
    return join(this.taskDir(id), 'task.json');
  }

  private eventsFile(id: string): string {
    return join(this.taskDir(id), 'events.jsonl');
  }

  private contentFile(id: string): string {
    return join(this.taskDir(id), 'content.md');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async createTask(title: string, summary: string | undefined, { actor }: Pick<MutationOptions, 'actor'>): Promise<Task> {
    const id = ulid();
    const dir = this.taskDir(id);
    await fs.mkdir(dir, { recursive: true });
    const created_at = nowISO();
    const task: Task = {
      id,
      title,
      state: 'TODO',
      summary,
      created_at,
      updated_at: created_at,
      last_event_seq: 0,
      version: CURRENT_TASK_VERSION,
    };
    const ev: TaskEvent = {
      seq: 1,
      type: 'created',
      at: created_at,
      actor,
      payload: { title, summary },
    };
    await fs.writeFile(this.taskFile(id), JSON.stringify(task, null, 2));
    await fs.writeFile(this.eventsFile(id), JSON.stringify(ev) + '\n');
    // bump last_event_seq to 1
    task.last_event_seq = 1;
    await fs.writeFile(this.taskFile(id), JSON.stringify(task, null, 2));
    return task;
  }

  async getTask(id: string): Promise<Task> {
    try {
      const raw = await fs.readFile(this.taskFile(id), 'utf8');
      return JSON.parse(raw) as Task;
    } catch (err: any) {
      if (err?.code === 'ENOENT') throw new NotFoundError(`Task not found: ${id}`);
      throw err;
    }
  }

  private async writeTask(task: Task): Promise<void> {
    await fs.writeFile(this.taskFile(task.id), JSON.stringify(task, null, 2));
  }

  private async appendEvent(id: string, event: TaskEvent): Promise<void> {
    await fs.appendFile(this.eventsFile(id), JSON.stringify(event) + '\n');
  }

  private ensureMutable(task: Task): void {
    if (task.archived_at) throw new ArchivedError(`Task ${task.id} is archived`);
  }

  private ensureExpectedSeq(task: Task, expected: number): void {
    if (task.last_event_seq !== expected) {
      throw new ConflictError(`expected_last_seq=${expected} does not match current=${task.last_event_seq}`);
    }
  }

  async retitle(id: string, title: string, opts: MutationOptions): Promise<Task> {
    const task = await this.getTask(id);
    this.ensureMutable(task);
    this.ensureExpectedSeq(task, opts.expected_last_seq);
    const at = nowISO();
    const event: TaskEvent = { seq: task.last_event_seq + 1, type: 'retitled', at, actor: opts.actor, payload: { title } };
    task.title = title;
    task.updated_at = at;
    task.last_event_seq = event.seq;
    await this.appendEvent(id, event);
    await this.writeTask(task);
    return task;
  }

  async setState(id: string, stateInput: string, opts: MutationOptions): Promise<Task> {
    const task = await this.getTask(id);
    this.ensureMutable(task);
    this.ensureExpectedSeq(task, opts.expected_last_seq);
    const up = String(stateInput).toUpperCase();
    if (!isValidState(up)) throw new Error(`Unknown state: ${stateInput}`);
    const to = up;
    const from = task.state;
    if (from === to) return task; // no-op
    const at = nowISO();
    const event: TaskEvent = { seq: task.last_event_seq + 1, type: 'state_changed', at, actor: opts.actor, payload: { from, to } };
    task.state = to;
    task.updated_at = at;
    task.last_event_seq = event.seq;
    await this.appendEvent(id, event);
    await this.writeTask(task);
    return task;
  }

  async appendLog(id: string, message: string, opts: MutationOptions): Promise<Task> {
    if (message.length > this.maxLogMessageLength) {
      throw new Error(`Log message exceeds max length ${this.maxLogMessageLength}`);
    }
    const task = await this.getTask(id);
    this.ensureMutable(task);
    this.ensureExpectedSeq(task, opts.expected_last_seq);
    const at = nowISO();
    const event: TaskEvent = { seq: task.last_event_seq + 1, type: 'log_appended', at, actor: opts.actor, payload: { message } };
    task.updated_at = at;
    task.last_event_seq = event.seq;
    await this.appendEvent(id, event);
    await this.writeTask(task);
    return task;
  }

  async setSummary(id: string, summary: string, opts: MutationOptions): Promise<Task> {
    const task = await this.getTask(id);
    this.ensureMutable(task);
    this.ensureExpectedSeq(task, opts.expected_last_seq);
    const at = nowISO();
    const event: TaskEvent = { seq: task.last_event_seq + 1, type: 'summary_set', at, actor: opts.actor, payload: { summary } };
    task.summary = summary;
    task.updated_at = at;
    task.last_event_seq = event.seq;
    await this.appendEvent(id, event);
    await this.writeTask(task);
    return task;
  }

  async setContent(
    id: string,
    content: string,
    opts: MutationOptions,
    format: 'markdown' | 'text' = 'markdown'
  ): Promise<Task> {
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > this.maxContentBytes) {
      throw new Error(`Content exceeds max size ${this.maxContentBytes} bytes`);
    }
    const task = await this.getTask(id);
    this.ensureMutable(task);
    this.ensureExpectedSeq(task, opts.expected_last_seq);
    const at = nowISO();
    await fs.writeFile(this.contentFile(id), content, 'utf8');
    const event: TaskEvent = {
      seq: task.last_event_seq + 1,
      type: 'content_set',
      at,
      actor: opts.actor,
      payload: { bytes, format },
    } as any;
    task.content_updated_at = at;
    task.content_format = format;
    task.updated_at = at;
    task.last_event_seq = event.seq;
    await this.appendEvent(id, event);
    await this.writeTask(task);
    return task;
  }

  async readContent(id: string): Promise<{ content: string; format: 'markdown' | 'text' }> {
    try {
      const buf = await fs.readFile(this.contentFile(id), 'utf8');
      const t = await this.getTask(id);
      return { content: buf, format: t.content_format ?? 'markdown' };
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        // No content yet
        return { content: '', format: 'markdown' };
      }
      throw err;
    }
  }

  async archive(id: string, reason: string | undefined, opts: MutationOptions): Promise<Task> {
    const task = await this.getTask(id);
    this.ensureMutable(task);
    this.ensureExpectedSeq(task, opts.expected_last_seq);
    const at = nowISO();
    const event: TaskEvent = { seq: task.last_event_seq + 1, type: 'archived', at, actor: opts.actor, payload: { reason } };
    task.archived_at = at;
    task.updated_at = at;
    task.last_event_seq = event.seq;
    await this.appendEvent(id, event);
    await this.writeTask(task);
    return task;
  }

  async unarchive(id: string, opts: MutationOptions): Promise<Task> {
    const task = await this.getTask(id);
    this.ensureExpectedSeq(task, opts.expected_last_seq);
    if (!task.archived_at) return task; // no-op
    const at = nowISO();
    const event: TaskEvent = { seq: task.last_event_seq + 1, type: 'unarchived', at, actor: opts.actor, payload: {} };
    task.archived_at = undefined;
    task.updated_at = at;
    task.last_event_seq = event.seq;
    await this.appendEvent(id, event);
    await this.writeTask(task);
    return task;
  }

  async listTasks(includeArchived = true): Promise<Task[]> {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.baseDir);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      throw err;
    }
    const tasks: Task[] = [];
    for (const id of entries) {
      try {
        const t = await this.getTask(id);
        if (!includeArchived && t.archived_at) continue;
        tasks.push(t);
      } catch {
        // ignore malformed dirs
      }
    }
    tasks.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return tasks;
  }

  async indexView(): Promise<IndexView> {
    const tasks = await this.listTasks(true);
    const items: IndexItem[] = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      state: t.state,
      archived: Boolean(t.archived_at),
      updated_at: t.updated_at,
    }));
    return { generated_at: nowISO(), items };
  }

  async boardView(): Promise<BoardView> {
    const tasks = await this.listTasks(true);
    const columns: BoardView['columns'] = [
      { name: 'TODO', items: [] },
      { name: 'ACTIVE', items: [] },
      { name: 'DONE', items: [] },
      { name: 'ARCHIVED', items: [] },
    ];
    for (const t of tasks) {
      const item = { id: t.id, title: t.title, state: t.state, updated_at: t.updated_at, archived_at: t.archived_at };
      if (t.archived_at) {
        columns[3].items.push(item);
      } else if (t.state === 'TODO') {
        columns[0].items.push(item);
      } else if (t.state === 'ACTIVE') {
        columns[1].items.push(item);
      } else {
        columns[2].items.push(item);
      }
    }
    return { generated_at: nowISO(), columns };
  }

  async timelineView(id: string, opts: PaginationOptions = {}): Promise<TimelineView> {
    // Read events.jsonl and optionally page
    const path = this.eventsFile(id);
    let raw = '';
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch (err: any) {
      if (err?.code === 'ENOENT') throw new NotFoundError(`Task not found: ${id}`);
      throw err;
    }
    const lines = raw.split('\n').filter(Boolean);
    const eventsAll: TaskEvent[] = lines.map((l) => JSON.parse(l));
    let events = eventsAll;
    if (opts.after_seq != null) {
      events = events.filter((e) => e.seq > opts.after_seq!);
    }
    if (opts.limit != null) {
      events = events.slice(-opts.limit);
    }
    return { id, generated_at: nowISO(), events };
  }
}
