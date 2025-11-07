import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join, resolve, isAbsolute, dirname } from 'path';

export interface ProjectsConfig {
  projects?: Record<string, string>;
}

const CONFIG_PATH = join(homedir(), '.wind-task', 'config.json');

export async function loadProjects(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const json = JSON.parse(raw) as ProjectsConfig;
    const map = json.projects ?? {};
    const out: Record<string, string> = {};
    for (const [name, p] of Object.entries(map)) {
      if (!name) continue;
      let v = String(p || '').trim();
      if (!v) continue;
      v = normalizeBaseDir(v);
      out[name] = v;
    }
    return out;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return {};
    throw err;
  }
}

export function isValidProjectName(s: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(s);
}

export function configPath(): string {
  return CONFIG_PATH;
}

export function normalizeBaseDir(input: string): string {
  let v = String(input || '').trim();
  if (!v) return v;
  if (v.startsWith('~/')) {
    v = join(homedir(), v.slice(2));
  }
  if (!isAbsolute(v)) {
    v = resolve(v);
  }
  return v;
}

export async function saveProjects(projects: Record<string, string>): Promise<void> {
  const dir = dirname(CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true });
  // Normalize all values before saving
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(projects)) {
    if (!k) continue;
    const nv = normalizeBaseDir(v);
    if (!nv) continue;
    normalized[k] = nv;
  }
  const body = JSON.stringify({ projects: normalized }, null, 2) + '\n';
  const tmp = CONFIG_PATH + `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, body, 'utf8');
  await fs.rename(tmp, CONFIG_PATH);
}
