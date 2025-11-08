import blessed from 'blessed';
import { t } from './i18n.js';

export function showInputDialog(
  screen: blessed.Widgets.Screen,
  title: string,
  label: string,
  initial: string,
  onSubmit: (value: string) => void,
  onClose?: () => void,
) {
  const overlay = blessed.box({ top: 'center', left: 'center', width: '60%', height: 7, border: 'line', label: ` ${title} `, tags: true });
  blessed.text({ parent: overlay, top: 1, left: 2, content: `${label}:` });
  const tb = blessed.textbox({ parent: overlay, top: 2, left: 2, height: 1, inputOnFocus: true, width: '90%', keys: true, mouse: false });
  screen.append(overlay);
  overlay.focus();
  tb.setValue(initial || '');
  tb.focus();
  const close = () => {
    try { overlay.destroy(); } catch {}
    try { onClose && onClose(); } catch {}
    screen.render();
  };
  overlay.key(['escape'], () => { close(); });
  tb.key(['enter'], () => { const v = (tb as any).getValue?.() ?? ''; close(); onSubmit(String(v).trim()); });
  screen.render();
}

export function showConfirmDialog(
  screen: blessed.Widgets.Screen,
  title: string,
  message: string,
  onConfirm: () => void,
  onClose?: () => void,
) {
  const overlay = blessed.box({ top: 'center', left: 'center', width: '60%', height: 7, border: 'line', label: ` ${title} `, tags: true, keys: true });
  blessed.text({ parent: overlay, top: 2, left: 2, content: message });
  screen.append(overlay);
  overlay.focus();
  const close = () => {
    try { overlay.destroy(); } catch {}
    try { onClose && onClose(); } catch {}
    screen.render();
  };
  // Enter or 'y' confirms; Esc or 'n' cancels
  overlay.key(['enter', 'y'], () => { close(); onConfirm(); });
  overlay.key(['escape', 'n'], () => { close(); });
  screen.render();
}

export function showSelectStateDialog(
  screen: blessed.Widgets.Screen,
  current: 'TODO'|'ACTIVE'|'DONE',
  onSubmit: (state: 'TODO'|'ACTIVE'|'DONE') => void,
  onClose?: () => void,
) {
  const overlay = blessed.box({ top: 'center', left: 'center', width: 40, height: 9, border: 'line', label: ` ${t('dlg_move_title')} `, keys: true });
  const list = blessed.list({ parent: overlay, top: 1, left: 1, width: '98%', height: 5, keys: true, vi: true, items: ['TODO','ACTIVE','DONE'], style: { selected: { inverse: true, bold: true } } });
  screen.append(overlay);
  const idx = ['TODO','ACTIVE','DONE'].indexOf(current);
  if (idx >= 0) (list as any).select(idx);
  list.focus();
  const close = () => {
    try { overlay.destroy(); } catch {}
    try { onClose && onClose(); } catch {}
    screen.render();
  };
  function currentIndex(): number {
    return typeof (list as any).selected === 'number' ? (list as any).selected : 0;
  }
  function selectIndex(i: number) {
    const max = 2;
    (list as any).select(Math.max(0, Math.min(max, i)));
  }
  function moveBy(delta: number) { selectIndex(currentIndex() + delta); }
  list.key(['enter'], () => {
    const value = (['TODO','ACTIVE','DONE'] as const)[currentIndex()];
    close();
    onSubmit(value);
  });
  // Support left/right to navigate options for consistency
  list.key(['left'], () => moveBy(-1));
  list.key(['right'], () => moveBy(1));
  // Mirror navigation on overlay for robustness if overlay gets focus
  overlay.key(['left'], () => moveBy(-1));
  overlay.key(['right'], () => moveBy(1));
  overlay.key(['up'], () => moveBy(-1));
  overlay.key(['down'], () => moveBy(1));
  overlay.key(['enter'], () => {
    const value = (['TODO','ACTIVE','DONE'] as const)[currentIndex()];
    close();
    onSubmit(value);
  });
  // Keep focus on list if overlay steals it
  overlay.on('focus', () => { try { list.focus(); } catch {} });
  // Allow ESC from either the list or the overlay
  list.key(['escape'], () => { close(); });
  overlay.key(['escape'], () => { close(); });
  screen.render();
}
