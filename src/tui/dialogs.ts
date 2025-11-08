import blessed from 'blessed';
import { t } from './i18n.js';

export function showInputDialog(
  screen: blessed.Widgets.Screen,
  title: string,
  label: string,
  initial: string,
  onSubmit: (value: string) => void
) {
  const overlay = blessed.box({ top: 'center', left: 'center', width: '60%', height: 7, border: 'line', label: ` ${title} `, tags: true });
  blessed.text({ parent: overlay, top: 1, left: 2, content: `${label}:` });
  const tb = blessed.textbox({ parent: overlay, top: 2, left: 2, height: 1, inputOnFocus: true, width: '90%', keys: true, mouse: false });
  const btnOk = blessed.button({ parent: overlay, bottom: 1, left: 2, width: 12, height: 1, content: `[ ${t('btn_confirm')} ]`, keys: true });
  const btnCancel = blessed.button({ parent: overlay, bottom: 1, left: 16, width: 12, height: 1, content: `[ ${t('btn_cancel')} ]`, keys: true });
  screen.append(overlay);
  overlay.focus();
  tb.setValue(initial || '');
  tb.focus();
  const close = () => { try { overlay.destroy(); } catch {}; screen.render(); };
  btnCancel.on('press', () => { close(); });
  btnOk.on('press', () => { const v = (tb as any).getValue?.() ?? ''; close(); onSubmit(String(v).trim()); });
  overlay.key(['escape'], () => { close(); });
  tb.key(['enter'], () => { const v = (tb as any).getValue?.() ?? ''; close(); onSubmit(String(v).trim()); });
  screen.render();
}

export function showConfirmDialog(
  screen: blessed.Widgets.Screen,
  title: string,
  message: string,
  onConfirm: () => void
) {
  const overlay = blessed.box({ top: 'center', left: 'center', width: '60%', height: 7, border: 'line', label: ` ${title} `, tags: true });
  blessed.text({ parent: overlay, top: 2, left: 2, content: message });
  const btnOk = blessed.button({ parent: overlay, bottom: 1, left: 2, width: 12, height: 1, content: `[ ${t('btn_confirm')} ]`, keys: true });
  const btnCancel = blessed.button({ parent: overlay, bottom: 1, left: 16, width: 12, height: 1, content: `[ ${t('btn_cancel')} ]`, keys: true });
  screen.append(overlay);
  overlay.focus();
  const close = () => { try { overlay.destroy(); } catch {}; screen.render(); };
  btnCancel.on('press', () => { close(); });
  btnOk.on('press', () => { close(); onConfirm(); });
  overlay.key(['escape'], () => { close(); });
  screen.render();
}

export function showSelectStateDialog(
  screen: blessed.Widgets.Screen,
  current: 'TODO'|'ACTIVE'|'DONE',
  onSubmit: (state: 'TODO'|'ACTIVE'|'DONE') => void
) {
  const overlay = blessed.box({ top: 'center', left: 'center', width: 40, height: 9, border: 'line', label: ` ${t('dlg_move_title')} `, keys: true });
  const list = blessed.list({ parent: overlay, top: 1, left: 1, width: '98%', height: 5, keys: true, vi: true, items: ['TODO','ACTIVE','DONE'] });
  const btnCancel = blessed.button({ parent: overlay, bottom: 1, left: 2, width: 12, height: 1, content: `[ ${t('btn_cancel')} ]`, keys: true });
  screen.append(overlay);
  const idx = ['TODO','ACTIVE','DONE'].indexOf(current);
  if (idx >= 0) (list as any).select(idx);
  list.focus();
  const close = () => { try { overlay.destroy(); } catch {}; screen.render(); };
  btnCancel.on('press', () => { close(); });
  list.key(['enter'], () => {
    const i = typeof (list as any).selected === 'number' ? (list as any).selected : 0;
    const value = (['TODO','ACTIVE','DONE'] as const)[Math.max(0, Math.min(2, i))];
    close();
    onSubmit(value);
  });
  overlay.key(['escape'], () => { close(); });
  screen.render();
}

