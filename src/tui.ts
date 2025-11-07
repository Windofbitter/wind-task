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

function formatEventTitle(event: any): string {
  switch (event.type) {
    case 'created':
      return `Task created: "${event.payload.title}"`;
    case 'state_changed':
      return `Moved to ${event.payload.to}`;
    case 'retitled':
      return 'Title changed';
    case 'summary_set':
      return 'Summary updated';
    case 'content_set':
      return 'Content updated';
    case 'log_appended': {
      const msg = event.payload.message;
      return msg.length > 50 ? msg.substring(0, 47) + '...' : msg;
    }
    case 'archived':
      return 'Task archived';
    case 'unarchived':
      return 'Task unarchived';
    default:
      return event.type;
  }
}

function formatEventDetails(event: any): string[] {
  const lines: string[] = [];
  lines.push(`{bold}Event Type:{/bold} ${event.type}`);
  lines.push(`{bold}Sequence:{/bold} ${event.seq}`);
  lines.push(`{bold}Timestamp:{/bold} ${event.at}`);
  lines.push(`{bold}Actor:{/bold} ${event.actor}`);
  lines.push('');
  lines.push('{bold}Details:{/bold}');
  
  switch (event.type) {
    case 'created':
      lines.push(`Title: ${event.payload.title}`);
      if (event.payload.summary) {
        lines.push(`Summary: ${event.payload.summary}`);
      }
      break;
    case 'state_changed':
      lines.push(`${event.payload.from} → ${event.payload.to}`);
      break;
    case 'retitled':
      lines.push(`New title: ${event.payload.title}`);
      break;
    case 'summary_set':
      lines.push(event.payload.summary);
      break;
    case 'content_set':
      lines.push(`Format: ${event.payload.format}`);
      if (typeof event.payload.bytes === 'number') lines.push(`Bytes: ${event.payload.bytes}`);
      break;
    case 'log_appended':
      lines.push(event.payload.message);
      break;
    case 'archived':
      if (event.payload.reason) {
        lines.push(`Reason: ${event.payload.reason}`);
      }
      break;
    case 'unarchived':
      lines.push('Task was unarchived');
      break;
  }
  
  return lines;
}

function showEventDetails(
  screen: blessed.Widgets.Screen,
  event: any,
  onClose?: () => void
) {
  const detailsBox = blessed.box({
    top: 'center',
    left: 'center',
    width: '60%',
    height: '60%',
    border: 'line',
    label: ' Event Details — Esc to close ',
    keys: true,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      style: { bg: 'white' }
    }
  });
  
  const content = formatEventDetails(event).join('\n');
  detailsBox.setContent(content);
  
  screen.append(detailsBox);
  detailsBox.focus();
  screen.render();
  
  const close = () => {
    try { detailsBox.destroy(); } catch {}
    try { onClose && onClose(); } catch {}
    screen.render();
  };
  
  detailsBox.key(['escape', 'q'], close);
}

async function showContent(
  screen: blessed.Widgets.Screen,
  store: TaskStore,
  id: string,
  onClose?: () => void
) {
  const overlay = blessed.box({ top: 'center', left: 'center', width: '80%', height: '80%', border: 'line', label: ` Content ${id} — Esc to close `, keys: true });
  const contentBox = blessed.box({ parent: overlay, top: 0, left: 0, width: '100%', height: '100%', tags: true, keys: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', style: { bg: 'white' } } });

  screen.append(overlay);
  screen.render();

  try {
    const res = await store.readContent(id);
    const body = res.content || '(no content)';
    contentBox.setContent(body);
  } catch (err: any) {
    contentBox.setContent(`Error: ${err?.message ?? String(err)}`);
  }

  const close = () => {
    try { overlay.destroy(); } catch {}
    try { onClose && onClose(); } catch {}
    screen.render();
  };

  const switchToTimeline = async () => {
    try { overlay.destroy(); } catch {}
    await showTimeline(screen, store, id, undefined, async () => {
      await showContent(screen, store, id, onClose);
    });
  };

  overlay.key(['escape', 'q'], close);
  contentBox.key(['escape', 'q'], close);
  overlay.key(['t'], () => { switchToTimeline(); });
  contentBox.key(['t'], () => { switchToTimeline(); });
  contentBox.focus();
}

async function showTimeline(
  screen: blessed.Widgets.Screen,
  store: TaskStore,
  id: string,
  onCloseToList?: () => void,
  onBackToContent?: () => void
) {
  const overlay = blessed.box({ top: 'center', left: 'center', width: '80%', height: '80%', border: 'line', label: ` Timeline ${id} — Esc to close `, keys: true });
  const list = blessed.list({ parent: overlay, top: 0, left: 0, width: '100%', height: '100%', keys: true, vi: true, tags: true, scrollbar: { ch: ' ', style: { bg: 'white' } } });
  screen.append(overlay);
  screen.render();
  
  let events: any[] = [];
  
  try {
    const view = await store.timelineView(id, { limit: 100 });
    events = view.events;
    const lines = events.map((e) => {
      const title = formatEventTitle(e);
      return `{bold}${e.seq}{/bold} {gray-fg}${e.type}{/gray-fg} {blue-fg}${e.actor}{/blue-fg}\n    ${title}`;
    });
    list.setItems(lines);
  } catch (err: any) {
    list.setItems([`Error: ${err?.message ?? String(err)}`]);
  }
  
  list.focus();
  
  // Handle Enter key to show details
  list.key(['enter'], () => {
    const idx = typeof (list as any).selected === 'number' ? (list as any).selected : 0;
    if (events[idx]) {
      showEventDetails(screen, events[idx], () => {
        list.focus();
      });
    }
  });
  
  const closeToList = () => {
    try { overlay.destroy(); } catch {}
    try { onCloseToList && onCloseToList(); } catch {}
    screen.render();
  };
  const backToContent = async () => {
    try { overlay.destroy(); } catch {}
    if (onBackToContent) {
      try { await onBackToContent(); } catch {}
    } else {
      screen.render();
    }
  };
  // Register ESC handler on both overlay and list to ensure it's captured
  overlay.key(['escape', 'q'], () => { onBackToContent ? backToContent() : closeToList(); });
  list.key(['escape', 'q'], () => { onBackToContent ? backToContent() : closeToList(); });
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
        : '(↑/↓: move, ←/→: switch, Enter: content, t: timeline, Esc: back, r: reload, q: quit)';
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
    const sel = typeof (list as any).selected === 'number' ? (list as any).selected : 0;
    selectedIdxByCol[layout.order[activeColIdx] as ColumnName] = sel;
    setColumnStyles();
    updateHeader();
    updateStatusFrom(list);
    screen.render();
  }

  function moveFocus(delta: number) {
    const current = activeColIdx;
    const curList = activeList();
    const curIdx = typeof (curList as any).selected === 'number' ? (curList as any).selected : (selectedIdxByCol[layout.order[current] as ColumnName] ?? 0);
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
  screen.key(['left'], () => {
    if (overlayActive) return; // Don't navigate when overlay is active
    moveFocus(-1);
  });
  screen.key(['right'], () => {
    if (overlayActive) return; // Don't navigate when overlay is active
    moveFocus(1);
  });

  // Enter to select column or open content
  screen.key(['enter'], async () => {
    if (overlayActive) return; // Don't process Enter when overlay is active
    if (mode === 'column') {
      enterColumn();
      return;
    }
    const list = activeList();
    const idx = typeof (list as any).selected === 'number' ? (list as any).selected : 0;
    const items: any[] = (list as any).taskItems ?? [];
    const id = items[idx]?.id || items[items.length - 1]?.id;
    if (id) {
      overlayActive = true;
      const prevList = list;
      await showContent(screen, store, id, () => {
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

  // 't' to show timeline overlay for selected task
  screen.key(['t'], async () => {
    if (overlayActive) return;
    if (mode !== 'task') return;
    const list = activeList();
    const idx = typeof (list as any).selected === 'number' ? (list as any).selected : 0;
    const items: any[] = (list as any).taskItems ?? [];
    const id = items[idx]?.id || items[items.length - 1]?.id;
    if (!id) return;
    overlayActive = true;
    const prevList = list;
    await showTimeline(screen, store, id, () => {
      overlayActive = false;
      try { prevList.focus(); } catch {}
    });
    screen.render();
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
    if (overlayActive) return; // Don't reload when overlay is active
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
