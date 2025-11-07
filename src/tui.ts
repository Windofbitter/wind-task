import blessed from 'blessed';
import { TaskStore } from './store.js';
import { BoardView } from './types.js';

type Lang = 'en' | 'zh';

let currentLang: Lang = 'en';

const I18N = {
  en: {
    title: 'Wind Task Board',
    status_ready: 'Ready',
    help_column: '(←/→: column, Enter: select, F2: language, r: reload, q: quit)',
    help_task: '(↑/↓: move, ←/→: switch, Enter: content, t: timeline, Esc: back, F2: language, r: reload, q: quit)',
    col_TODO: 'TODO',
    col_ACTIVE: 'ACTIVE',
    col_DONE: 'DONE',
    col_ARCHIVED: 'ARCHIVED',
    loaded_at: (time: string) => `Loaded at ${time}`,
    no_tasks: 'No tasks',
    archived_suffix: 'archived',
    updated_prefix: 'updated',
    reloading: 'Reloading...'
  },
  zh: {
    title: 'Wind 任务看板',
    status_ready: '准备就绪',
    help_column: '（←/→：列，Enter：选择，F2：语言，r：刷新，q：退出）',
    help_task: '（↑/↓：移动，←/→：切换，Enter：内容，t：时间线，Esc：返回，F2：语言，r：刷新，q：退出）',
    col_TODO: '待办',
    col_ACTIVE: '进行中',
    col_DONE: '已完成',
    col_ARCHIVED: '已归档',
    loaded_at: (time: string) => `已加载 ${time}`,
    no_tasks: '无任务',
    archived_suffix: '已归档',
    updated_prefix: '更新于',
    reloading: '重新加载中...'
  }
} as const;

function t(key: keyof typeof I18N['en']): any {
  return (I18N as any)[currentLang][key];
}

function stateLabel(state: 'TODO' | 'ACTIVE' | 'DONE' | 'ARCHIVED'): string {
  switch (state) {
    case 'TODO': return t('col_TODO');
    case 'ACTIVE': return t('col_ACTIVE');
    case 'DONE': return t('col_DONE');
    case 'ARCHIVED': return t('col_ARCHIVED');
  }
}

type ColumnName = 'TODO' | 'ACTIVE' | 'DONE' | 'ARCHIVED';
type Mode = 'column' | 'task';

const BASE_DIR = '.wind-task';

async function loadBoard(store: TaskStore): Promise<BoardView> {
  return store.boardView();
}

function makeScreen() {
  const screen = blessed.screen({
    smartCSR: true,
    title: t('title'),
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
    content: `{bold}${t('title')}{/bold}`
  });

  const status = blessed.box({
    parent: screen,
    bottom: 0,
    height: 1,
    width: '100%',
    tags: true,
    content: t('status_ready'),
  });

  const columnOrder: ColumnName[] = ['TODO', 'ACTIVE', 'DONE', 'ARCHIVED'];
  const lefts = ['0%', '25%', '50%', '75%'];

  const cols: Record<ColumnName, blessed.Widgets.ListElement> = {
    TODO: blessed.list({ parent: screen, label: ` ${stateLabel('TODO')} `, border: 'line', keys: true, tags: true, top: 1, left: lefts[0], width: '25%', height: '100%-2', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    ACTIVE: blessed.list({ parent: screen, label: ` ${stateLabel('ACTIVE')} `, border: 'line', keys: true, tags: true, top: 1, left: lefts[1], width: '25%', height: '100%-2', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    DONE: blessed.list({ parent: screen, label: ` ${stateLabel('DONE')} `, border: 'line', keys: true, tags: true, top: 1, left: lefts[2], width: '25%', height: '100%-2', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    ARCHIVED: blessed.list({ parent: screen, label: ` ${stateLabel('ARCHIVED')} `, border: 'line', keys: true, tags: true, top: 1, left: lefts[3], width: '25%', height: '100%-2', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
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
  {
    const time = new Date().toLocaleTimeString();
    const msgFn = t('loaded_at') as (s: string) => string;
    layout.status.setContent(msgFn(time));
  }
}

function formatEventTitle(event: any): string {
  switch (event.type) {
    case 'created':
      return currentLang === 'zh'
        ? `创建任务：“${event.payload.title}”`
        : `Task created: "${event.payload.title}"`;
    case 'state_changed':
      return currentLang === 'zh'
        ? `移至 ${stateLabel(event.payload.to)}`
        : `Moved to ${event.payload.to}`;
    case 'retitled':
      return currentLang === 'zh' ? '标题已修改' : 'Title changed';
    case 'summary_set':
      return currentLang === 'zh' ? '摘要已更新' : 'Summary updated';
    case 'content_set':
      return currentLang === 'zh' ? '内容已更新' : 'Content updated';
    case 'log_appended': {
      const msg = event.payload.message;
      return msg.length > 50 ? msg.substring(0, 47) + '...' : msg;
    }
    case 'archived':
      return currentLang === 'zh' ? '任务已归档' : 'Task archived';
    case 'unarchived':
      return currentLang === 'zh' ? '任务已取消归档' : 'Task unarchived';
    default:
      return event.type;
  }
}

function formatEventDetails(event: any): string[] {
  const lines: string[] = [];
  lines.push(`{bold}${currentLang === 'zh' ? '事件类型：' : 'Event Type:'}{/bold} ${event.type}`);
  lines.push(`{bold}${currentLang === 'zh' ? '序号：' : 'Sequence:'}{/bold} ${event.seq}`);
  lines.push(`{bold}${currentLang === 'zh' ? '时间：' : 'Timestamp:'}{/bold} ${event.at}`);
  lines.push(`{bold}${currentLang === 'zh' ? '执行者：' : 'Actor:'}{/bold} ${event.actor}`);
  lines.push('');
  lines.push(currentLang === 'zh' ? '{bold}详情：{/bold}' : '{bold}Details:{/bold}');
  
  switch (event.type) {
    case 'created':
      lines.push(`${currentLang === 'zh' ? '标题：' : 'Title:'} ${event.payload.title}`);
      if (event.payload.summary) {
        lines.push(`${currentLang === 'zh' ? '摘要：' : 'Summary:'} ${event.payload.summary}`);
      }
      break;
    case 'state_changed':
      lines.push(`${stateLabel(event.payload.from)} → ${stateLabel(event.payload.to)}`);
      break;
    case 'retitled':
      lines.push(`${currentLang === 'zh' ? '新标题：' : 'New title:'} ${event.payload.title}`);
      break;
    case 'summary_set':
      lines.push(event.payload.summary);
      break;
    case 'content_set':
      lines.push(`${currentLang === 'zh' ? '格式：' : 'Format:'} ${event.payload.format}`);
      if (typeof event.payload.bytes === 'number') lines.push(`${currentLang === 'zh' ? '字节：' : 'Bytes:'} ${event.payload.bytes}`);
      break;
    case 'log_appended':
      lines.push(event.payload.message);
      break;
    case 'archived':
      if (event.payload.reason) {
        lines.push(`${currentLang === 'zh' ? '原因：' : 'Reason:'} ${event.payload.reason}`);
      }
      break;
    case 'unarchived':
      lines.push(currentLang === 'zh' ? '任务已取消归档' : 'Task was unarchived');
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
    label: currentLang === 'zh' ? ' 事件详情 — Esc 关闭 ' : ' Event Details — Esc to close ',
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
  const overlay = blessed.box({ top: 'center', left: 'center', width: '80%', height: '80%', border: 'line', label: currentLang === 'zh' ? ` 内容 ${id} — Esc 关闭 ` : ` Content ${id} — Esc to close `, keys: true });
  const contentBox = blessed.box({ parent: overlay, top: 0, left: 0, width: '100%', height: '100%', tags: true, keys: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', style: { bg: 'white' } } });

  screen.append(overlay);
  screen.render();

  try {
    const res = await store.readContent(id);
    const body = res.content || (currentLang === 'zh' ? '(无内容)' : '(no content)');
    contentBox.setContent(body);
  } catch (err: any) {
    contentBox.setContent(`${currentLang === 'zh' ? '错误：' : 'Error:'} ${err?.message ?? String(err)}`);
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
  const overlay = blessed.box({ top: 'center', left: 'center', width: '80%', height: '80%', border: 'line', label: currentLang === 'zh' ? ` 时间线 ${id} — Esc 关闭 ` : ` Timeline ${id} — Esc to close `, keys: true });
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
    list.setItems([`${currentLang === 'zh' ? '错误：' : 'Error:'} ${err?.message ?? String(err)}`]);
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
    const modeHelp = mode === 'column' ? t('help_column') : t('help_task');
    layout.header.setContent(`{bold}${t('title')}{/bold}  ${modeHelp}`);
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
      layout.status.setContent(`${stateLabel(name as ColumnName)}: ${items.length} ${currentLang === 'zh' ? '个任务' : 'tasks'}`);
      return;
    }
    if (!list) return;
    const idx = selectedIdxByCol[layout.order[activeColIdx] as ColumnName] ?? 0;
    const items: any[] = (list as any).taskItems ?? [];
    if (!items.length) {
      layout.status.setContent(t('no_tasks'));
      return;
    }
    const task = items[Math.min(Math.max(idx, 0), items.length - 1)];
    const col = layout.order[activeColIdx];
    const archivedText = task.archived_at ? ` · ${t('archived_suffix')}` : '';
    const updatedPrefix = t('updated_prefix');
    layout.status.setContent(`${stateLabel(col as ColumnName)}: ${task.title} (${task.id}) · ${stateLabel(task.state)}${archivedText} · ${updatedPrefix} ${task.updated_at}`);
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
    layout.status.setContent(t('reloading'));
    screen.render();
    await renderBoard(layout, store);
    setColumnStyles();
    updateHeader();
    updateStatusFrom(activeList());
    screen.render();
  });

  // F2: toggle language (English/中文)
  screen.key(['f2'], () => {
    currentLang = currentLang === 'en' ? 'zh' : 'en';
    // Update terminal title
    try { (screen as any).title = t('title'); } catch {}
    // Update column labels
    try { layout.cols.TODO.setLabel(` ${stateLabel('TODO')} `); } catch {}
    try { layout.cols.ACTIVE.setLabel(` ${stateLabel('ACTIVE')} `); } catch {}
    try { layout.cols.DONE.setLabel(` ${stateLabel('DONE')} `); } catch {}
    try { layout.cols.ARCHIVED.setLabel(` ${stateLabel('ARCHIVED')} `); } catch {}
    updateHeader();
    updateStatusFrom(activeList());
    screen.render();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
