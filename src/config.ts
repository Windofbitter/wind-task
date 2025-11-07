import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join, resolve, isAbsolute, dirname, basename } from 'path';

export interface ProjectsConfig {
  projects?: Record<string, string>;
  defaultProject?: string;
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

export async function loadConfig(): Promise<ProjectsConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as ProjectsConfig;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { projects: {} };
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
  // Preserve defaultProject if present
  let existing: ProjectsConfig = {};
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    existing = JSON.parse(raw);
  } catch {}
  const out: ProjectsConfig = { projects: normalized };
  if (existing.defaultProject) out.defaultProject = existing.defaultProject;
  const body = JSON.stringify(out, null, 2) + '\n';
  const tmp = CONFIG_PATH + `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, body, 'utf8');
  await fs.rename(tmp, CONFIG_PATH);
}

/**
 * Resolve the actual task store directory for a given configured path.
 * Back-compat: if the path already ends with '/.wind-task' (or basename is '.wind-task'),
 * use it as-is; otherwise treat it as the project root and append '/.wind-task'.
 */
export function resolveStoreDir(configPath: string): string {
  const base = normalizeBaseDir(configPath);
  if (!base) return base;
  try {
    if (basename(base) === '.wind-task') return base;
  } catch {}
  return join(base, '.wind-task');
}
