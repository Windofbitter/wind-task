import { promises as fs } from 'fs';
import { join } from 'path';

const BASE_DIR = '.wind-task';

async function exists(p) {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function readJson(p) {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

function nowISO() {
  return new Date().toISOString();
}

async function migrateTask(id) {
  const dir = join(BASE_DIR, id);
  const taskPath = join(dir, 'task.json');
  const eventsPath = join(dir, 'events.jsonl');
  const contentPath = join(dir, 'content.md');

  const hasTask = await exists(taskPath);
  const hasEvents = await exists(eventsPath);
  if (!hasTask || !hasEvents) return { id, skipped: true, reason: 'missing files' };
  if (await exists(contentPath)) return { id, skipped: true, reason: 'already has content' };

  const task = await readJson(taskPath);
  const summary = typeof task.summary === 'string' && task.summary.trim().length ? task.summary.trim() : '';
  const title = String(task.title ?? '').trim();
  const body = summary || '';
  const content = body;

  await fs.writeFile(contentPath, content, 'utf8');

  const at = nowISO();
  const nextSeq = (task.last_event_seq ?? 0) + 1;
  const event = { seq: nextSeq, type: 'content_set', at, actor: 'system:migration', payload: { bytes: Buffer.byteLength(content, 'utf8'), format: 'markdown' } };
  await fs.appendFile(eventsPath, JSON.stringify(event) + '\n');

  task.content_updated_at = at;
  task.content_format = 'markdown';
  task.updated_at = at;
  task.last_event_seq = nextSeq;
  await fs.writeFile(taskPath, JSON.stringify(task, null, 2));
  return { id, migrated: true };
}

async function main() {
  let ids = [];
  try {
    ids = await fs.readdir(BASE_DIR);
  } catch {
    console.error('No base dir:', BASE_DIR);
    process.exit(1);
  }

  let migrated = 0;
  for (const id of ids) {
    try {
      const res = await migrateTask(id);
      if (res?.migrated) migrated++; else if (res?.skipped) {}
    } catch (err) {
      console.error('Failed to migrate', id, String(err?.message ?? err));
    }
  }
  console.log('migrated tasks:', migrated);
}

main().catch((err) => { console.error(err); process.exit(1); });

