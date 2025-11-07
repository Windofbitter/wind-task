export type TaskState = 'TODO' | 'ACTIVE' | 'DONE';

export interface Task {
  id: string;
  title: string;
  state: TaskState;
  summary?: string;
  created_at: string; // ISO8601
  updated_at: string; // ISO8601
  archived_at?: string; // ISO8601 when archived, undefined otherwise
  content_updated_at?: string; // ISO8601 when content was last updated
  content_format?: 'markdown' | 'text';
  last_event_seq: number; // optimistic concurrency per-task
  version: number; // schema version for forward compatibility
}

export type EventType =
  | 'created'
  | 'retitled'
  | 'state_changed'
  | 'log_appended'
  | 'summary_set'
  | 'content_set'
  | 'archived'
  | 'unarchived';

export interface EventBase {
  seq: number; // monotonically increasing per task
  type: EventType;
  at: string; // ISO8601
  actor: string; // e.g., "agent:llm" or "human:user"
}

export interface CreatedEvent extends EventBase {
  type: 'created';
  payload: { title: string; summary?: string };
}

export interface RetitledEvent extends EventBase {
  type: 'retitled';
  payload: { title: string };
}

export interface StateChangedEvent extends EventBase {
  type: 'state_changed';
  payload: { from: TaskState; to: TaskState };
}

export interface LogAppendedEvent extends EventBase {
  type: 'log_appended';
  payload: { message: string };
}

export interface SummarySetEvent extends EventBase {
  type: 'summary_set';
  payload: { summary: string };
}

export interface ContentSetEvent extends EventBase {
  type: 'content_set';
  payload: { bytes: number; format: 'markdown' | 'text'; sha256?: string };
}

export interface ArchivedEvent extends EventBase {
  type: 'archived';
  payload: { reason?: string };
}

export interface UnarchivedEvent extends EventBase {
  type: 'unarchived';
  payload: Record<string, never>;
}

export type TaskEvent =
  | CreatedEvent
  | RetitledEvent
  | StateChangedEvent
  | LogAppendedEvent
  | SummarySetEvent
  | ContentSetEvent
  | ArchivedEvent
  | UnarchivedEvent;

export interface BoardColumn {
  name: 'TODO' | 'ACTIVE' | 'DONE' | 'ARCHIVED';
  items: Array<Pick<Task, 'id' | 'title' | 'state' | 'updated_at' | 'archived_at'>>;
}

export interface BoardView {
  generated_at: string; // ISO8601
  columns: BoardColumn[];
}

export interface IndexItem {
  id: string;
  title: string;
  state: TaskState;
  archived: boolean;
  updated_at: string;
}

export interface IndexView {
  generated_at: string; // ISO8601
  items: IndexItem[];
}

export interface TimelineView {
  id: string;
  generated_at: string;
  events: TaskEvent[];
}

export interface StoreOptions {
  baseDir: string; // directory where tasks/ live
  maxLogMessageLength?: number;
  maxContentBytes?: number;
}

export interface MutationOptions {
  expected_last_seq: number; // optimistic concurrency guard
  actor: string; // who performed the mutation
}

export interface PaginationOptions {
  after_seq?: number; // exclusive
  limit?: number; // max events to return
}

export const CURRENT_TASK_VERSION = 1;
