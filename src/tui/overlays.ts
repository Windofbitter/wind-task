import blessed from 'blessed';
import { TaskStore } from '../store.js';
import { getLang, stateLabel, t } from './i18n.js';

function formatEventTitle(event: any): string {
  const lang = getLang();
  switch (event.type) {
    case 'created':
      return lang === 'zh'
        ? `创建任务：“${event.payload.title}”`
        : `Task created: "${event.payload.title}"`;
    case 'state_changed':
      return lang === 'zh'
        ? `移至 ${stateLabel(event.payload.to)}`
        : `Moved to ${event.payload.to}`;
    case 'retitled':
      return lang === 'zh' ? '标题已修改' : 'Title changed';
    case 'summary_set':
      return lang === 'zh' ? '摘要已更新' : 'Summary updated';
    case 'content_set':
      return lang === 'zh' ? '内容已更新' : 'Content updated';
    case 'log_appended': {
      const msg = event.payload.message;
      return msg.length > 50 ? msg.substring(0, 47) + '...' : msg;
    }
    case 'archived':
      return lang === 'zh' ? '任务已归档' : 'Task archived';
    case 'unarchived':
      return lang === 'zh' ? '任务已取消归档' : 'Task unarchived';
    default:
      return event.type;
  }
}

function formatEventDetails(event: any): string[] {
  const lang = getLang();
  const lines: string[] = [];
  lines.push(`{bold}${lang === 'zh' ? '事件类型：' : 'Event Type:'}{/bold} ${event.type}`);
  lines.push(`{bold}${lang === 'zh' ? '序号：' : 'Sequence:'}{/bold} ${event.seq}`);
  lines.push(`{bold}${lang === 'zh' ? '时间：' : 'Timestamp:'}{/bold} ${event.at}`);
  lines.push(`{bold}${lang === 'zh' ? '执行者：' : 'Actor:'}{/bold} ${event.actor}`);
  lines.push('');
  lines.push(lang === 'zh' ? '{bold}详情：{/bold}' : '{bold}Details:{/bold}');
  switch (event.type) {
    case 'created':
      lines.push(`${lang === 'zh' ? '标题：' : 'Title:'} ${event.payload.title}`);
      if (event.payload.summary) {
        lines.push(`${lang === 'zh' ? '摘要：' : 'Summary:'} ${event.payload.summary}`);
      }
      break;
    case 'state_changed':
      lines.push(`${stateLabel(event.payload.from)} → ${stateLabel(event.payload.to)}`);
      break;
    case 'retitled':
      lines.push(`${lang === 'zh' ? '新标题：' : 'New title:'} ${event.payload.title}`);
      break;
    case 'summary_set':
      lines.push(event.payload.summary);
      break;
    case 'content_set':
      lines.push(`${lang === 'zh' ? '格式：' : 'Format:'} ${event.payload.format}`);
      if (typeof event.payload.bytes === 'number') lines.push(`${lang === 'zh' ? '字节：' : 'Bytes:'} ${event.payload.bytes}`);
      break;
    case 'log_appended':
      lines.push(event.payload.message);
      break;
    case 'archived':
      if (event.payload.reason) {
        lines.push(`${lang === 'zh' ? '原因：' : 'Reason:'} ${event.payload.reason}`);
      }
      break;
    case 'unarchived':
      lines.push(lang === 'zh' ? '任务已取消归档' : 'Task was unarchived');
      break;
  }
  return lines;
}

export function showEventDetails(
  screen: blessed.Widgets.Screen,
  event: any,
  onClose?: () => void
) {
  const lang = getLang();
  const detailsBox = blessed.box({
    top: 'center',
    left: 'center',
    width: '60%',
    height: '60%',
    border: 'line',
    label: lang === 'zh' ? ' 事件详情 — Esc 关闭 ' : ' Event Details — Esc to close ',
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

export async function showContent(
  screen: blessed.Widgets.Screen,
  store: TaskStore,
  id: string,
  onClose?: () => void
) {
  const lang = getLang();
  const overlay = blessed.box({ top: 'center', left: 'center', width: '80%', height: '80%', border: 'line', label: lang === 'zh' ? ` 内容 ${id} — Esc 关闭 ` : ` Content ${id} — Esc to close `, keys: true });
  const contentBox = blessed.box({ parent: overlay, top: 0, left: 0, width: '100%', height: '100%', tags: true, keys: true, scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', style: { bg: 'white' } } });
  screen.append(overlay);
  screen.render();
  try {
    const res = await store.readContent(id);
    const body = res.content || (getLang() === 'zh' ? '(无内容)' : '(no content)');
    contentBox.setContent(body);
  } catch (err: any) {
    contentBox.setContent(`${getLang() === 'zh' ? '错误：' : 'Error:'} ${err?.message ?? String(err)}`);
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

export async function showTimeline(
  screen: blessed.Widgets.Screen,
  store: TaskStore,
  id: string,
  onCloseToList?: () => void,
  onBackToContent?: () => void
) {
  const lang = getLang();
  const overlay = blessed.box({ top: 'center', left: 'center', width: '80%', height: '80%', border: 'line', label: lang === 'zh' ? ` 时间线 ${id} — Esc 关闭 ` : ` Timeline ${id} — Esc to close `, keys: true });
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
    list.setItems([`${getLang() === 'zh' ? '错误：' : 'Error:'} ${err?.message ?? String(err)}`]);
  }
  list.focus();
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
  overlay.key(['escape', 'q'], () => { onBackToContent ? backToContent() : closeToList(); });
  list.key(['escape', 'q'], () => { onBackToContent ? backToContent() : closeToList(); });
}

