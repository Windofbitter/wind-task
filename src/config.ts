import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join, resolve, isAbsolute } from 'path';

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
      if (v.startsWith('~/')) {
        v = join(homedir(), v.slice(2));
      }
      if (!isAbsolute(v)) {
        v = resolve(v);
      }
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

