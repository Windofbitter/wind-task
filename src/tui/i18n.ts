export type Lang = 'en' | 'zh';

let currentLang: Lang = 'en';

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export const I18N = {
  en: {
    title: 'Wind Task Board',
    status_ready: 'Ready',
    help_column: '(←/→: column, Enter: select, F2: language, F6: actions, r: reload, q: quit)',
    help_task: '(↑/↓: move, ←/→: switch, Enter: content, t: timeline, Esc: back, F2: language, F6: actions, r: reload, q: quit)',
    help_actions: '(Tab/←/→: choose, Enter: run, Esc: back)',
    col_TODO: 'TODO',
    col_ACTIVE: 'ACTIVE',
    col_DONE: 'DONE',
    col_ARCHIVED: 'ARCHIVED',
    loaded_at: (time: string) => `Loaded at ${time}`,
    no_tasks: 'No tasks',
    archived_suffix: 'archived',
    updated_prefix: 'updated',
    reloading: 'Reloading...',
    // Action bar
    btn_new: 'New',
    btn_move: 'Move',
    btn_retitle: 'Retitle',
    btn_log: 'Log',
    btn_timeline: 'Timeline',
    btn_archive: 'Archive',
    btn_unarchive: 'Unarchive',
    btn_reload: 'Reload',
    btn_help: 'Help',
    // Dialogs
    dlg_new_title: 'Create Task',
    dlg_move_title: 'Move to State',
    dlg_retitle_title: 'Retitle Task',
    dlg_log_title: 'Append Log',
    dlg_archive_title: 'Archive Task',
    dlg_unarchive_title: 'Unarchive Task',
    field_title: 'Title',
    field_summary: 'Summary',
    field_message: 'Message',
    field_reason: 'Reason',
    btn_confirm: 'Confirm',
    btn_cancel: 'Cancel',
    // Status / errors
    err_no_task: 'No task selected',
    err_archived: 'Task is archived',
    info_conflict: 'Changed elsewhere; reloading…',
    info_done: 'Done'
  },
  zh: {
    title: 'Wind 任务看板',
    status_ready: '准备就绪',
    help_column: '（←/→：列，Enter：选择，F2：语言，F6：操作，r：刷新，q：退出）',
    help_task: '（↑/↓：移动，←/→：切换，Enter：内容，t：时间线，Esc：返回，F2：语言，F6：操作，r：刷新，q：退出）',
    help_actions: '（Tab/←/→：选择，Enter：执行，Esc：返回）',
    col_TODO: '待办',
    col_ACTIVE: '进行中',
    col_DONE: '已完成',
    col_ARCHIVED: '已归档',
    loaded_at: (time: string) => `已加载 ${time}`,
    no_tasks: '无任务',
    archived_suffix: '已归档',
    updated_prefix: '更新于',
    reloading: '重新加载中...',
    // Action bar
    btn_new: '新建',
    btn_move: '移动',
    btn_retitle: '改名',
    btn_log: '日志',
    btn_timeline: '时间线',
    btn_archive: '归档',
    btn_unarchive: '取消归档',
    btn_reload: '刷新',
    btn_help: '帮助',
    // Dialogs
    dlg_new_title: '新建任务',
    dlg_move_title: '移动到状态',
    dlg_retitle_title: '修改标题',
    dlg_log_title: '追加日志',
    dlg_archive_title: '归档任务',
    dlg_unarchive_title: '取消归档任务',
    field_title: '标题',
    field_summary: '摘要',
    field_message: '消息',
    field_reason: '原因',
    btn_confirm: '确认',
    btn_cancel: '取消',
    // Status / errors
    err_no_task: '未选择任务',
    err_archived: '任务已归档',
    info_conflict: '已在其他地方变更；正在刷新…',
    info_done: '已完成'
  }
} as const;

export function t(key: keyof typeof I18N['en']): any {
  return (I18N as any)[currentLang][key];
}

export function stateLabel(state: 'TODO' | 'ACTIVE' | 'DONE' | 'ARCHIVED'): string {
  switch (state) {
    case 'TODO': return t('col_TODO');
    case 'ACTIVE': return t('col_ACTIVE');
    case 'DONE': return t('col_DONE');
    case 'ARCHIVED': return t('col_ARCHIVED');
  }
}

