import blessed from 'blessed';
import { TaskStore } from './store.js';
import { BoardView } from './types.js';

type ColumnName = 'TODO' | 'ACTIVE' | 'DONE' | 'ARCHIVED';

const BASE_DIR = '.wind-task';

async function loadBoard(store: TaskStore): Promise<BoardView> {
  return store.boardView();
}

function makeScreen() {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Wind Task Board',
  });
  screen.key(['C-c', 'q'], () => process.exit(0));
  return screen;
}

function makeLayout(screen: blessed.Widgets.Screen) {
  const header = blessed.box({
    parent: screen,
    top: 0,
    height: 1,
    width: '100%',
    tags: true,
    content: '{bold}Wind Task Board{/bold}  (Tab: next column, Enter: open timeline, r: reload, q: quit)'
  });

  const status = blessed.box({
    parent: screen,
    bottom: 0,
    height: 1,
    width: '100%',
    tags: true,
    content: 'Ready',
  });

  const columnOrder: ColumnName[] = ['TODO', 'ACTIVE', 'DONE', 'ARCHIVED'];
  const lefts = ['0%', '25%', '50%', '75%'];

  const cols: Record<ColumnName, blessed.Widgets.ListElement> = {
    TODO: blessed.list({ parent: screen, label: ' TODO ', border: 'line', keys: true, vi: true, tags: true, top: 1, left: lefts[0], width: '25%', height: '100%-2', scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    ACTIVE: blessed.list({ parent: screen, label: ' ACTIVE ', border: 'line', keys: true, vi: true, tags: true, top: 1, left: lefts[1], width: '25%', height: '100%-2', scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    DONE: blessed.list({ parent: screen, label: ' DONE ', border: 'line', keys: true, vi: true, tags: true, top: 1, left: lefts[2], width: '25%', height: '100%-2', scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    ARCHIVED: blessed.list({ parent: screen, label: ' ARCHIVED ', border: 'line', keys: true, vi: true, tags: true, top: 1, left: lefts[3], width: '25%', height: '100%-2', scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
  } as any;

  return { header, status, cols, order: columnOrder };
}

function formatItem(id: string, title: string, updated: string, archivedAt?: string) {
  const shortId = id.slice(-6);
  const archivedBadge = archivedAt ? ' {red-fg}[A]{/red-fg}' : '';
  return `${title} {gray-fg}(${shortId}){/gray-fg}\n{gray-fg}${updated}${archivedBadge}{/gray-fg}`;
}

async function renderBoard(layout: ReturnType<typeof makeLayout>, store: TaskStore) {
  const board = await loadBoard(store);
  const byName = layout.cols;
  (Object.keys(byName) as ColumnName[]).forEach((name) => byName[name].clearItems());
  for (const col of board.columns) {
    const list = byName[col.name as ColumnName];
    const items = col.items.map((t) => formatItem(t.id, t.title, t.updated_at, t.archived_at));
    list.setItems(items);
    // attach IDs to items for retrieval
    (list as any).taskIds = col.items.map((t) => t.id);
  }
  layout.status.setContent(`Loaded at ${new Date().toLocaleTimeString()}`);
  layout.cols.TODO.focus();
}

async function showTimeline(screen: blessed.Widgets.Screen, store: TaskStore, id: string) {
  const overlay = blessed.box({ top: 'center', left: 'center', width: '80%', height: '80%', border: 'line', label: ` Timeline ${id} `, keys: true });
  const list = blessed.list({ parent: overlay, top: 0, left: 0, width: '100%', height: '100%', keys: true, vi: true, tags: true, scrollbar: { ch: ' ', style: { bg: 'white' } } });
  screen.append(overlay);
  screen.render();
  try {
    const view = await store.timelineView(id, { limit: 100 });
    const lines = view.events.map((e) => {
      const payload = e.type === 'log_appended' ? e.payload.message : JSON.stringify(e.payload);
      return `{bold}${e.seq}{/bold} ${e.type} {gray-fg}${e.at}{/gray-fg}\n{blue-fg}${e.actor}{/blue-fg}: ${payload}`;
    });
    list.setItems(lines);
  } catch (err: any) {
    list.setItems([`Error: ${err?.message ?? String(err)}`]);
  }
  list.focus();
  overlay.key(['escape', 'q'], () => {
    overlay.destroy();
    screen.render();
  });
}

async function main() {
  const store = new TaskStore({ baseDir: BASE_DIR });
  await store.init();

  const screen = makeScreen();
  const layout = makeLayout(screen);
  await renderBoard(layout, store);
  screen.render();

  // Cycling focus across columns
  screen.key(['tab'], () => {
    const order = layout.order;
    const current = order.findIndex((name) => layout.cols[name].focused);
    const next = order[(current + 1) % order.length];
    layout.cols[next].focus();
    screen.render();
  });

  screen.key(['r'], async () => {
    layout.status.setContent('Reloading...');
    screen.render();
    await renderBoard(layout, store);
    screen.render();
  });

  // Open timeline on Enter
  (Object.values(layout.cols) as blessed.Widgets.ListElement[]).forEach((list) => {
    list.key(['enter'], async () => {
      const idx = list.selected ?? 0;
      const taskIds: string[] = (list as any).taskIds ?? [];
      const id = taskIds[idx] || taskIds[taskIds.length - 1];
      if (id) await showTimeline(screen, store, id);
      screen.render();
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
