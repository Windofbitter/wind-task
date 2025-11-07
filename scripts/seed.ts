import { TaskStore } from '../src/store.js';

async function seed() {
  const store = new TaskStore({ baseDir: '.wind-task' });
  await store.init();

  const existing = await store.listTasks(true);
  if (existing.length > 0) {
    console.log(`Tasks already present (${existing.length}). Creating one extra demo task.`);
    let t = await store.createTask('Demo Task', 'This is a demo task created by the seed script.', { actor: 'human:dev' });
    t = await store.appendLog(t.id, 'Initial log entry.', { expected_last_seq: t.last_event_seq, actor: 'human:dev' });
    console.log(`Created demo task: ${t.id}`);
    return;
  }

  // Create a TODO task
  let todo = await store.createTask('Write README', 'Document server and TUI usage.', { actor: 'human:dev' });
  todo = await store.appendLog(todo.id, 'Initialized repository and base layout.', { expected_last_seq: todo.last_event_seq, actor: 'human:dev' });

  // Create an ACTIVE task
  let active = await store.createTask('Implement TUI board', 'Add blessed-based board and timeline.', { actor: 'human:dev' });
  active = await store.setState(active.id, 'ACTIVE', { expected_last_seq: active.last_event_seq, actor: 'human:dev' });
  active = await store.appendLog(active.id, 'Basic columns wired up.', { expected_last_seq: active.last_event_seq, actor: 'human:dev' });

  // Create a DONE task
  let done = await store.createTask('Setup MCP task server', 'Expose resources and tools.', { actor: 'human:dev' });
  done = await store.setState(done.id, 'ACTIVE', { expected_last_seq: done.last_event_seq, actor: 'human:dev' });
  done = await store.appendLog(done.id, 'Resources: index/board/task/timeline.', { expected_last_seq: done.last_event_seq, actor: 'human:dev' });
  done = await store.setState(done.id, 'DONE', { expected_last_seq: done.last_event_seq, actor: 'human:dev' });

  // Create an ARCHIVED task
  let archived = await store.createTask('Archived example task', 'Demonstrates archive column and lock.', { actor: 'human:dev' });
  archived = await store.archive(archived.id, 'Obsolete example.', { expected_last_seq: archived.last_event_seq, actor: 'human:dev' });

  console.log('Seeded tasks:');
  console.log(`TODO:     ${todo.id}`);
  console.log(`ACTIVE:   ${active.id}`);
  console.log(`DONE:     ${done.id}`);
  console.log(`ARCHIVED: ${archived.id}`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

