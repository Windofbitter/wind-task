import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListToolsResultSchema, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

function textFromContent(content) {
  for (const c of content) {
    if (typeof c?.text === 'string') return c.text;
    if (c?.type === 'text' && typeof c?.text === 'string') return c.text;
  }
  return '';
}

async function run() {
  const project = process.env.WIND_PROJECT || 'wind-task';
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'] });
  const client = new Client({ name: 'demo-client', version: '0.0.1' }, { capabilities: {} });
  await client.connect(transport);
  const tools = await client.request({ method: 'tools/list' }, ListToolsResultSchema);
  const hasCreate = tools.tools.some(t => t.name === 'create_task');
  if (!hasCreate) throw new Error('Server did not expose create_task tool');
  const title = 'Demo Task (created via MCP)';
  const res = await client.request({
    method: 'tools/call',
    params: { name: 'create_task', arguments: { project, title, summary: 'demo', actor: 'human:cli' } },
  }, CallToolResultSchema);
  const text = textFromContent(res.content);
  if (!text) throw new Error('No content returned from create_task');
  const parsed = JSON.parse(text);
  if (!parsed?.task?.id) throw new Error('Unexpected response: ' + text);
  console.log('Created task id:', parsed.task.id);
}

run().catch((err) => { console.error(err); process.exit(1); });

