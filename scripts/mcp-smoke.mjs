import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ReadResourceResultSchema,
  ListToolsResultSchema,
  CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

function textFromContent(content) {
  for (const c of content) {
    if (typeof c?.text === 'string') return c.text;
    if (c?.type === 'text' && typeof c?.text === 'string') return c.text;
  }
  return '';
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
  });

  const client = new Client({ name: 'smoke-client', version: '0.0.1' }, { capabilities: {} });
  await client.connect(transport);

  const resources = await client.request({ method: 'resources/list' }, ListResourcesResultSchema);
  console.log('resources:', resources.resources.map(r => r.uri));

  const templates = await client.request({ method: 'resources/templates/list' }, ListResourceTemplatesResultSchema);
  console.log('templates:', templates.resourceTemplates.map(t => t.uriTemplate));

  const tools = await client.request({ method: 'tools/list' }, ListToolsResultSchema);
  console.log('tools:', tools.tools.map(t => t.name));

  // Create a task
  const createRes = await client.request({
    method: 'tools/call',
    params: { name: 'create_task', arguments: { title: 'MCP Smoke Test', summary: 'created via smoke client', actor: 'agent:cli' } },
  }, CallToolResultSchema);
  const createText = textFromContent(createRes.content);
  const created = JSON.parse(createText);
  const id = created.task?.id;
  const seq = created.task?.last_event_seq ?? 1;
  if (!id) throw new Error('Create did not return task id');
  console.log('created id:', id);

  // Set content
  const contentRes = await client.request({
    method: 'tools/call',
    params: { name: 'set_content', arguments: { id, content: '# Smoke Content\n\nThis is a test.', expected_last_seq: seq, actor: 'agent:cli', format: 'markdown' } },
  }, CallToolResultSchema);
  const contentText = textFromContent(contentRes.content);
  const contentSet = JSON.parse(contentText);
  const seqContent = contentSet.task?.last_event_seq;
  console.log('set content seq:', seqContent);

  // Append log
  const appendRes = await client.request({
    method: 'tools/call',
    params: { name: 'append_log', arguments: { id, message: 'hello from smoke', expected_last_seq: seqContent, actor: 'agent:cli' } },
  }, CallToolResultSchema);
  const appendText = textFromContent(appendRes.content);
  const appended = JSON.parse(appendText);
  const seq2 = appended.task?.last_event_seq;
  console.log('append seq:', seq2);

  // Move to ACTIVE
  const activeRes = await client.request({
    method: 'tools/call',
    params: { name: 'set_state', arguments: { id, state: 'ACTIVE', expected_last_seq: seq2, actor: 'agent:cli' } },
  }, CallToolResultSchema);
  const activeText = textFromContent(activeRes.content);
  const active = JSON.parse(activeText);
  const seq3 = active.task?.last_event_seq;
  console.log('set ACTIVE seq:', seq3);

  // Read timeline
  const timeline = await client.request({ method: 'resources/read', params: { uri: `tasks://timeline/${id}` } }, ReadResourceResultSchema);
  const timelineText = textFromContent(timeline.contents);
  console.log('timeline raw length:', timelineText?.length ?? 0);
  const timelineJson = JSON.parse(timelineText);
  console.log('timeline events:', timelineJson.events.length);

  // Read task view
  const taskView = await client.request({ method: 'resources/read', params: { uri: `tasks://task/${id}` } }, ReadResourceResultSchema);
  const taskText = textFromContent(taskView.contents);
  const taskJson = JSON.parse(taskText);
  console.log('task state:', taskJson.state, 'last_seq:', taskJson.last_event_seq);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
