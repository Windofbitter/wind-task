import blessed from 'blessed';
import { TaskStore } from './store.js';
import { BoardView } from './types.js';

type ColumnName = 'TODO' | 'ACTIVE' | 'DONE' | 'ARCHIVED';
type Mode = 'column' | 'task';

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
    content: '{bold}Wind Task Board{/bold}'
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
    TODO: blessed.list({ parent: screen, label: ' TODO ', border: 'line', keys: true, tags: true, top: 1, left: lefts[0], width: '25%', height: '100%-2', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    ACTIVE: blessed.list({ parent: screen, label: ' ACTIVE ', border: 'line', keys: true, tags: true, top: 1, left: lefts[1], width: '25%', height: '100%-2', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    DONE: blessed.list({ parent: screen, label: ' DONE ', border: 'line', keys: true, tags: true, top: 1, left: lefts[2], width: '25%', height: '100%-2', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    ARCHIVED: blessed.list({ parent: screen, label: ' ARCHIVED ', border: 'line', keys: true, tags: true, top: 1, left: lefts[3], width: '25%', height: '100%-2', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
  } as any;

  return { header, status, cols, order: columnOrder };
}

function formatItem(id: string, title: string, updated: string, archivedAt?: string) {
  const shortId = id.slice(-6);
  const archivedBadge = archivedAt ? ' {red-fg}[A]{/red-fg}' : '';
  return `${title} {gray-fg}(${shortId}) · ${updated}${archivedBadge}{/gray-fg}`;
}

async function renderBoard(layout: ReturnType<typeof makeLayout>, store: TaskStore) {
  const board = await loadBoard(store);
  const byName = layout.cols;
  (Object.keys(byName) as ColumnName[]).forEach((name) => byName[name].clearItems());
  for (const col of board.columns) {
    const list = byName[col.name as ColumnName];
    const items = col.items.map((t) => formatItem(t.id, t.title, t.updated_at, t.archived_at));
    list.setItems(items);
    // attach task items for retrieval
    (list as any).taskItems = col.items;
  }
  layout.status.setContent(`Loaded at ${new Date().toLocaleTimeString()}`);
}

async function showTimeline(
  screen: blessed.Widgets.Screen,
  store: TaskStore,
  id: string,
  onClose?: () => void
) {
  const overlay = blessed.box({ top: 'center', left: 'center', width: '80%', height: '80%', border: 'line', label: ` Timeline ${id} — Esc to close `, keys: true });
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
  const close = () => {
    try { overlay.destroy(); } catch {}
    try { onClose && onClose(); } catch {}
    screen.render();
  };
  overlay.key(['escape'], close);
}

async function main() {
  const store = new TaskStore({ baseDir: BASE_DIR });
  await store.init();

  const screen = makeScreen();
  const layout = makeLayout(screen);
  await renderBoard(layout, store);

  // Navigation state
  let mode: Mode = 'column';
  let activeColIdx = 0;
  let overlayActive = false;
  const selectedIdxByCol: Record<ColumnName, number> = {
    TODO: 0,
    ACTIVE: 0,
    DONE: 0,
    ARCHIVED: 0,
  };

  function activeList() {
    return layout.cols[layout.order[activeColIdx]];
  }

  function updateHeader() {
    const modeHelp =
      mode === 'column'
        ? '(←/→: column, Enter: select, r: reload, q: quit)'
        : '(↑/↓: move, ←/→: switch, Enter: timeline, Esc: back, r: reload, q: quit)';
    layout.header.setContent(`{bold}Wind Task Board{/bold}  ${modeHelp}`);
  }

  function setColumnStyles() {
    (layout.order as ColumnName[]).forEach((name, i) => {
      const list = layout.cols[name];
      (list as any).style = {
        ...(list as any).style,
        border: { fg: i === activeColIdx ? 'cyan' : 'white' },
        selected: i === activeColIdx && mode === 'task' ? { inverse: true, bold: true } : { fg: 'white' },
      };
    });
  }

  function updateStatusFrom(list: blessed.Widgets.ListElement | null) {
    if (mode === 'column') {
      const name = layout.order[activeColIdx];
      const items: any[] = (layout.cols[name] as any).taskItems ?? [];
      layout.status.setContent(`${name}: ${items.length} tasks`);
      return;
    }
    if (!list) return;
    const idx = selectedIdxByCol[layout.order[activeColIdx] as ColumnName] ?? 0;
    const items: any[] = (list as any).taskItems ?? [];
    if (!items.length) {
      layout.status.setContent('No tasks');
      return;
    }
    const t = items[Math.min(Math.max(idx, 0), items.length - 1)];
    const col = layout.order[activeColIdx];
    layout.status.setContent(`${col}: ${t.title} (${t.id}) · ${t.state}${t.archived_at ? ' · archived' : ''} · updated ${t.updated_at}`);
  }

  function focusColumn(idx: number) {
    activeColIdx = (idx + layout.order.length) % layout.order.length;
    activeList().focus();
    setColumnStyles();
    updateHeader();
    updateStatusFrom(activeList());
    screen.render();
  }

  function enterColumn() {
    mode = 'task';
    const list = activeList();
    const items: any[] = (list as any).taskItems ?? [];
    if (items.length > 0) list.select(Math.min(selectedIdxByCol[layout.order[activeColIdx] as ColumnName] ?? 0, items.length - 1));
    setColumnStyles();
    updateHeader();
    updateStatusFrom(list);
    screen.render();
  }

  function leaveColumn() {
    mode = 'column';
    const list = activeList();
    const sel = typeof list.selected === 'number' ? list.selected : 0;
    selectedIdxByCol[layout.order[activeColIdx] as ColumnName] = sel;
    setColumnStyles();
    updateHeader();
    updateStatusFrom(list);
    screen.render();
  }

  function moveFocus(delta: number) {
    const current = activeColIdx;
    const curList = activeList();
    const curIdx = typeof curList.selected === 'number' ? curList.selected : (selectedIdxByCol[layout.order[current] as ColumnName] ?? 0);
    const next = (current + delta + layout.order.length) % layout.order.length;
    activeColIdx = next;
    const nextList = activeList();
    const nextItems: any[] = (nextList as any).taskItems ?? [];
    if (mode === 'task' && nextItems.length > 0) {
      const target = Math.min(curIdx, nextItems.length - 1);
      nextList.select(target);
      selectedIdxByCol[layout.order[next] as ColumnName] = target;
    }
    focusColumn(activeColIdx);
  }

  // Initial focus and styles
  focusColumn(0);

  // Column navigation on arrows
  screen.key(['left'], () => moveFocus(-1));
  screen.key(['right'], () => moveFocus(1));

  // Enter to select column or open timeline
  screen.key(['enter'], async () => {
    if (mode === 'column') {
      enterColumn();
      return;
    }
    const list = activeList();
    const idx = typeof list.selected === 'number' ? list.selected : 0;
    const items: any[] = (list as any).taskItems ?? [];
    const id = items[idx]?.id || items[items.length - 1]?.id;
    if (id) {
      overlayActive = true;
      const prevList = list;
      await showTimeline(screen, store, id, () => {
        overlayActive = false;
        // restore focus to the originating list
        try { prevList.focus(); } catch {}
      });
    }
    screen.render();
  });

  // Esc to back out of task mode
  screen.key(['escape'], () => {
    if (overlayActive) return; // overlay handles its own Esc
    if (mode === 'task') leaveColumn();
  });

  // Update status on up/down in task mode
  (Object.values(layout.cols) as blessed.Widgets.ListElement[]).forEach((list) => {
    list.on('keypress', (_ch: any, key: any) => {
      if (mode !== 'task') return;
      if (key.name === 'up' || key.name === 'down' || key.name === 'home' || key.name === 'end' || key.name === 'pageup' || key.name === 'pagedown') {
        setImmediate(() => {
          updateStatusFrom(activeList());
          screen.render();
        });
      }
    });
  });

  screen.key(['r'], async () => {
    layout.status.setContent('Reloading...');
    screen.render();
    await renderBoard(layout, store);
    setColumnStyles();
    updateHeader();
    updateStatusFrom(activeList());
    screen.render();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
