#!/usr/bin/env node
import blessed from 'blessed';
import { TaskStore, ConflictError, ArchivedError } from './store.js';
import { BoardView } from './types.js';
import { loadProjects, resolveStoreDir } from './config.js';
import { join } from 'path';
import { userInfo } from 'os';
import { getLang, setLang, t, stateLabel } from './tui/i18n.js';
import { showContent, showTimeline } from './tui/overlays.js';
import { showConfirmDialog, showInputDialog, showSelectStateDialog } from './tui/dialogs.js';

type ColumnName = 'TODO' | 'ACTIVE' | 'DONE' | 'ARCHIVED';
type Mode = 'column' | 'task';

// TUI source of truth
// - Default: read from current working directory's `.wind-task`.
// - Optional: accept `--project <name>` or `-p <name>` to target a configured project
//   from ~/.wind-task/config.json and resolve its store dir.

async function loadBoard(store: TaskStore): Promise<BoardView> {
  return store.boardView();
}

function makeScreen() {
  const screen = blessed.screen({
    smartCSR: true,
    // Enable proper width handling and rendering for CJK/Unicode characters
    fullUnicode: true,
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

  const actionBar = blessed.box({
    parent: screen,
    top: 1,
    height: 1,
    width: '100%',
    tags: true,
    content: ''
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
    TODO: blessed.list({ parent: screen, label: ` ${stateLabel('TODO')} `, border: 'line', keys: true, tags: true, top: 2, left: lefts[0], width: '25%', height: '100%-3', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    ACTIVE: blessed.list({ parent: screen, label: ` ${stateLabel('ACTIVE')} `, border: 'line', keys: true, tags: true, top: 2, left: lefts[1], width: '25%', height: '100%-3', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    DONE: blessed.list({ parent: screen, label: ` ${stateLabel('DONE')} `, border: 'line', keys: true, tags: true, top: 2, left: lefts[2], width: '25%', height: '100%-3', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
    ARCHIVED: blessed.list({ parent: screen, label: ` ${stateLabel('ARCHIVED')} `, border: 'line', keys: true, tags: true, top: 2, left: lefts[3], width: '25%', height: '100%-3', style: { selected: { inverse: true, bold: true }, item: { } }, scrollbar: { ch: ' ', track: { bg: 'gray' }, style: { bg: 'white' } } }),
  } as any;

  return { header, actionBar, status, cols, order: columnOrder };
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

 

async function main() {
  const screen = makeScreen();

  // Parse CLI args for optional --project/-p
  const argv = process.argv.slice(2);
  function getArg(nameLong: string, nameShort?: string): string | undefined {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === nameLong || (nameShort && a === nameShort)) {
        return argv[i + 1];
      }
      if (a.startsWith(nameLong + '=')) return a.slice(nameLong.length + 1);
    }
    return undefined;
  }
  const projectName = getArg('--project', '-p');

  let storeDir: string;
  if (projectName) {
    const projects = await loadProjects();
    const configured = projects[projectName];
    if (!configured) {
      const known = Object.keys(projects);
      const hint = known.length ? `Known projects: ${known.join(', ')}` : 'No projects configured';
      throw new Error(`Unknown project: ${projectName}. ${hint}`);
    }
    storeDir = resolveStoreDir(configured);
  } else {
    storeDir = join(process.cwd(), '.wind-task');
  }

  const store = new TaskStore({ baseDir: storeDir });
  await store.init();
  const layout = makeLayout(screen);
  await renderBoard(layout, store);

  // Navigation state
  let mode: Mode = 'column';
  let activeColIdx = 0;
  let overlayActive = false;
  let focusArea: 'columns' | 'actionbar' = 'columns';
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
    const base = `{bold}${t('title')}{/bold}`;
    if (focusArea === 'actionbar') {
      layout.header.setContent(`${base}  ${t('help_actions')}`);
    } else {
      const modeHelp = mode === 'column' ? t('help_column') : t('help_task');
      layout.header.setContent(`${base}  ${modeHelp}`);
    }
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
      layout.status.setContent(`${stateLabel(name as ColumnName)}: ${items.length} ${getLang() === 'zh' ? '个任务' : 'tasks'}`);
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
    if (mode === 'task') {
      try { (activeList() as any).focus(); } catch {}
    } else {
      // In column mode, keep focus off lists to avoid up/down moving selection
      try { (layout.header as any).focus?.(); } catch {}
    }
    setColumnStyles();
    updateHeader();
    updateStatusFrom(activeList());
    renderActionBar();
    screen.render();
  }

  function enterColumn() {
    mode = 'task';
    const list = activeList();
    const items: any[] = (list as any).taskItems ?? [];
    if (items.length > 0) list.select(Math.min(selectedIdxByCol[layout.order[activeColIdx] as ColumnName] ?? 0, items.length - 1));
    try { (list as any).focus(); } catch {}
    setColumnStyles();
    updateHeader();
    updateStatusFrom(list);
    renderActionBar();
    screen.render();
  }

  function leaveColumn() {
    mode = 'column';
    const list = activeList();
    const sel = typeof (list as any).selected === 'number' ? (list as any).selected : 0;
    selectedIdxByCol[layout.order[activeColIdx] as ColumnName] = sel;
    // Move focus away from lists to avoid up/down moving selection in column mode
    try { (layout.header as any).focus?.(); } catch {}
    setColumnStyles();
    updateHeader();
    updateStatusFrom(list);
    renderActionBar();
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

  // Initial focus and styles are set after action bar is initialized

  // Actor id for mutations
  function actorId(): string {
    try {
      const u = userInfo();
      return `user:${u.username}:tui`;
    } catch {
      return 'actor:tui';
    }
  }

  // Generic status helper
  function setStatusMessage(msg: string) {
    layout.status.setContent(msg);
    screen.render();
  }

  // Build Action Bar (keyboard-only pseudo buttons)
  type ActionItem = { key: string; label: string; handler: () => Promise<void> | void };
  let actions: ActionItem[] = [];
  let actionIdx = 0;

  function selectedTaskId(): string | null {
    const list = activeList();
    const idx = typeof (list as any).selected === 'number' ? (list as any).selected : 0;
    const items: any[] = (list as any).taskItems ?? [];
    const id = items[idx]?.id || items[items.length - 1]?.id;
    return id || null;
  }

  function selectedTaskMeta(): any | null {
    const list = activeList();
    const idx = typeof (list as any).selected === 'number' ? (list as any).selected : 0;
    const items: any[] = (list as any).taskItems ?? [];
    return items[idx] || null;
  }

  async function mutateThenReload(run: (expected: number) => Promise<void>) {
    const id = selectedTaskId();
    if (!id) { setStatusMessage(t('err_no_task')); return; }
    try {
      const t0 = await store.getTask(id);
      await run(t0.last_event_seq);
      // reload and try to focus the task
      await renderBoard(layout, store);
      // try focus by id
      for (let i = 0; i < layout.order.length; i++) {
        const name = layout.order[i] as ColumnName;
        const list = layout.cols[name] as any;
        const items: any[] = list.taskItems ?? [];
        const idx = items.findIndex((it) => it.id === id);
        if (idx >= 0) {
          activeColIdx = i;
          mode = 'task';
          focusArea = 'columns';
          list.select(idx);
          setColumnStyles();
          updateHeader();
          updateStatusFrom(list);
          screen.render();
          return;
        }
      }
      // fallback
      setColumnStyles();
      updateHeader();
      updateStatusFrom(activeList());
      screen.render();
    } catch (err: any) {
      if (err instanceof ConflictError) {
        setStatusMessage(t('info_conflict'));
        await renderBoard(layout, store);
        setColumnStyles();
        updateHeader();
        updateStatusFrom(activeList());
        screen.render();
        return;
      }
      if (err instanceof ArchivedError) {
        setStatusMessage(t('err_archived'));
        return;
      }
      setStatusMessage(String(err?.message ?? err));
    }
  }

  // Modal wrapper to ensure exclusive key handling during dialogs
  function withDialog(open: (onClose: () => void) => void) {
    overlayActive = true;
    const prev = activeList();
    const restore = () => {
      overlayActive = false;
      try { (prev as any).focus(); } catch {}
      screen.render();
    };
    open(restore);
  }

  function renderActionBar() {
    const parts = actions.map((a, i) => i === actionIdx ? `{inverse} ${a.label} {/inverse}` : ` ${a.label} `);
    layout.actionBar.setContent(parts.join(' '));
    screen.render();
  }

  async function actionNew() {
    const currentCol = layout.order[activeColIdx] as ColumnName;
    withDialog((onClose) => {
      showInputDialog(screen, t('dlg_new_title'), t('field_title'), '', async (title) => {
        if (!title) return;
        try {
          const created = await store.createTask(title, undefined, { actor: actorId() });
          // set state if needed
          if (currentCol !== 'TODO') {
            await store.setState(created.id, currentCol, { expected_last_seq: created.last_event_seq, actor: actorId() });
          }
          await renderBoard(layout, store);
          // focus created task
          for (let i = 0; i < layout.order.length; i++) {
            const name = layout.order[i] as ColumnName;
            const list = layout.cols[name] as any;
            const items: any[] = list.taskItems ?? [];
            const idx = items.findIndex((it) => it.id === created.id);
            if (idx >= 0) {
              activeColIdx = i;
              mode = 'task';
              focusArea = 'columns';
              list.select(idx);
              setColumnStyles();
              updateHeader();
              updateStatusFrom(list);
              screen.render();
              return;
            }
          }
          setStatusMessage(String(t('info_done')));
        } catch (err: any) {
          setStatusMessage(String(err?.message ?? err));
        }
      }, onClose);
    });
  }

  async function actionMove() {
    const meta = selectedTaskMeta();
    if (!meta) { setStatusMessage(t('err_no_task')); return; }
    if (meta.archived_at) { setStatusMessage(t('err_archived')); return; }
    withDialog((onClose) => {
      showSelectStateDialog(screen, meta.state as any, async (target) => {
        await mutateThenReload(async (expected) => {
          await store.setState(meta.id, target, { expected_last_seq: expected, actor: actorId() });
        });
      }, onClose);
    });
  }

  async function actionRetitle() {
    const meta = selectedTaskMeta();
    if (!meta) { setStatusMessage(t('err_no_task')); return; }
    if (meta.archived_at) { setStatusMessage(t('err_archived')); return; }
    withDialog((onClose) => {
      showInputDialog(screen, t('dlg_retitle_title'), t('field_title'), meta.title || '', async (value) => {
        if (!value) return;
        await mutateThenReload(async (expected) => {
          await store.retitle(meta.id, value, { expected_last_seq: expected, actor: actorId() });
        });
      }, onClose);
    });
  }

  async function actionLog() {
    const meta = selectedTaskMeta();
    if (!meta) { setStatusMessage(t('err_no_task')); return; }
    if (meta.archived_at) { setStatusMessage(t('err_archived')); return; }
    withDialog((onClose) => {
      showInputDialog(screen, t('dlg_log_title'), t('field_message'), '', async (value) => {
        if (!value) return;
        await mutateThenReload(async (expected) => {
          await store.appendLog(meta.id, value, { expected_last_seq: expected, actor: actorId() });
        });
      }, onClose);
    });
  }

  async function actionArchiveToggle() {
    const meta = selectedTaskMeta();
    if (!meta) { setStatusMessage(t('err_no_task')); return; }
    if (meta.archived_at) {
      withDialog((onClose) => {
        showConfirmDialog(screen, t('dlg_unarchive_title'), meta.title, async () => {
          await mutateThenReload(async (expected) => {
            await store.unarchive(meta.id, { expected_last_seq: expected, actor: actorId() });
          });
        }, onClose);
      });
    } else {
      // optional reason
      withDialog((onClose) => {
        showInputDialog(screen, t('dlg_archive_title'), t('field_reason'), '', async (reason) => {
          await mutateThenReload(async (expected) => {
            await store.archive(meta.id, reason || undefined, { expected_last_seq: expected, actor: actorId() });
          });
        }, onClose);
      });
    }
  }

  async function actionTimeline() {
    const meta = selectedTaskMeta();
    if (!meta) { setStatusMessage(t('err_no_task')); return; }
    overlayActive = true;
    const prevList = activeList();
    await showTimeline(screen, store, meta.id, () => {
      overlayActive = false;
      try { (prevList as any).focus(); } catch {}
    });
    screen.render();
  }

  async function actionReload() {
    layout.status.setContent(t('reloading'));
    screen.render();
    await renderBoard(layout, store);
    setColumnStyles();
    updateHeader();
    updateStatusFrom(activeList());
    screen.render();
  }

  actions = [
    { key: 'new', label: t('btn_new'), handler: actionNew },
    { key: 'move', label: t('btn_move'), handler: actionMove },
    { key: 'retitle', label: t('btn_retitle'), handler: actionRetitle },
    { key: 'log', label: t('btn_log'), handler: actionLog },
    { key: 'timeline', label: t('btn_timeline'), handler: actionTimeline },
    { key: 'archive', label: t('btn_archive'), handler: actionArchiveToggle },
    { key: 'reload', label: t('btn_reload'), handler: actionReload },
  ];
  renderActionBar();
  focusColumn(0);

  // Column navigation on arrows
  screen.key(['left'], () => {
    if (overlayActive) return; // Don't navigate when overlay is active
    if (focusArea === 'actionbar') { // move action selection
      actionIdx = (actionIdx - 1 + actions.length) % actions.length;
      renderActionBar();
      return;
    }
    moveFocus(-1);
  });
  screen.key(['right'], () => {
    if (overlayActive) return; // Don't navigate when overlay is active
    if (focusArea === 'actionbar') { // move action selection
      actionIdx = (actionIdx + 1) % actions.length;
      renderActionBar();
      return;
    }
    moveFocus(1);
  });

  // Enter to select column or open content
  screen.key(['enter'], async () => {
    if (overlayActive) return; // Don't process Enter when overlay is active
    if (focusArea === 'actionbar') {
      try { await actions[actionIdx].handler(); } catch {}
      return;
    }
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
    if (focusArea === 'actionbar') { focusArea = 'columns'; updateHeader(); screen.render(); return; }
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
          renderActionBar();
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
    setLang(getLang() === 'en' ? 'zh' : 'en');
    // Update terminal title
    try { (screen as any).title = t('title'); } catch {}
    // Update column labels
    try { layout.cols.TODO.setLabel(` ${stateLabel('TODO')} `); } catch {}
    try { layout.cols.ACTIVE.setLabel(` ${stateLabel('ACTIVE')} `); } catch {}
    try { layout.cols.DONE.setLabel(` ${stateLabel('DONE')} `); } catch {}
    try { layout.cols.ARCHIVED.setLabel(` ${stateLabel('ARCHIVED')} `); } catch {}
    // Update action labels
    actions = [
      { key: 'new', label: t('btn_new'), handler: actionNew },
      { key: 'move', label: t('btn_move'), handler: actionMove },
      { key: 'retitle', label: t('btn_retitle'), handler: actionRetitle },
      { key: 'log', label: t('btn_log'), handler: actionLog },
      { key: 'timeline', label: t('btn_timeline'), handler: actionTimeline },
      { key: 'archive', label: selectedTaskMeta()?.archived_at ? t('btn_unarchive') : t('btn_archive'), handler: actionArchiveToggle },
      { key: 'reload', label: t('btn_reload'), handler: actionReload },
    ];
    renderActionBar();
    updateHeader();
    updateStatusFrom(activeList());
    screen.render();
  });

  // F6: toggle focus to action bar
  screen.key(['f6'], () => {
    if (overlayActive) return;
    focusArea = focusArea === 'actionbar' ? 'columns' : 'actionbar';
    updateHeader();
    screen.render();
  });

  // Tab/Shift-Tab to move in action bar
  screen.key(['tab'], () => {
    if (overlayActive) return;
    if (focusArea !== 'actionbar') return;
    actionIdx = (actionIdx + 1) % actions.length;
    renderActionBar();
  });
  screen.key(['S-tab'], () => {
    if (overlayActive) return;
    if (focusArea !== 'actionbar') return;
    actionIdx = (actionIdx - 1 + actions.length) % actions.length;
    renderActionBar();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
