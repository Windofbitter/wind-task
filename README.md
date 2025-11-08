[English](README.md) | [中文](README.zh.md)

MCP Task Server

Minimal MCP server for LLM agents to manage simple tasks backed by files. Lifecycle is TODO → ACTIVE → DONE, with ARCHIVED as a lock (separate board column). Append-only event logs per task provide full history and context.

![Wind Task Board](docs/assets/task_board.png)

Features

- States: `TODO`, `ACTIVE`, `DONE`; `ARCHIVED` via `archived_at` (blocks mutations)
- Append-only `events.jsonl` per task; `task.json` holds current view
- Optimistic concurrency with `expected_last_seq`
- Board and index resources; task and timeline resource templates
- No tags, no assignee, no verify

Project Layout

- `src/types.ts` — types for tasks, events, views
- `src/id.ts` — minimal ULID generator (time-sortable IDs)
- `src/store.ts` — file-backed store and operations
- `src/index.ts` — MCP server (stdio transport)
- `.wind-task/` — data directory (per project; see Projects)

Quick Start

- Prereqs: Node 18+ (tested with Node 22)
- Install: `npm install`
- Start server (stdio): `npm run dev`
- Build and run: `npm run build && npm start`
- TUI (read‑only board and timeline): `npm run tui`
  - Or run via npx: `npx wind-task-tui@latest`
  - Server via npx: `npx wind-task@latest`

Config Setup

- Location: `~/.wind-task/config.json` (user-level config)
- Minimal example (recommended: map to your project root; storage goes under ".wind-task"):

  {
    "projects": { "projA": "/abs/path/to/projA" }
  }

- Rules
  - Use absolute paths for `base_dir` (interpreted as project root by default).
  - `~/` expands to your home directory; relative paths are normalized to absolute.
  - The server resolves storage to `<base_dir>/.wind-task` by default and creates it if missing.
  - Backward compatible: if your config value already ends with `/.wind-task`, it is used as-is.
- Verify
  - Read `config://projects` via your MCP host, or open `~/.wind-task/config.json`.
- Common errors
  - Missing `project` on tool calls.
  - Missing `?project=NAME` on resource URIs.
  - Unknown project key (ensure it exists in config).

- See Projects for details.

MCP Surface

- Resources
  - `tasks://index?project={project}` — compact list of tasks (JSON)
  - `tasks://board?project={project}` — board with `TODO`, `ACTIVE`, `DONE`, `ARCHIVED` columns (JSON)
  - `tasks://task/{id}?project={project}` — full `task.json` (JSON)
  - `tasks://timeline/{id}?project={project}` — `events.jsonl` rendered as JSON array (JSON)
  - `tasks://content/{id}?project={project}` — long-form task content (text/markdown)
  - `config://projects` — read-only view of current project mapping (JSON)

- Tools
  - `add_project(project, base_dir)`
  - `update_project(project, base_dir)`
  - `remove_project(project)`
  - `create_task(project, title, summary?, actor)`
  - `retitle(project, id, title, expected_last_seq, actor)`
  - `set_state(project, id, state, expected_last_seq, actor)`
  - `append_log(project, id, message, expected_last_seq, actor)`
  - `set_summary(project, id, summary, expected_last_seq, actor)`
  - `set_content(project, id, content, expected_last_seq, actor, format?)`
  - `archive(project, id, reason?, expected_last_seq, actor)`
  - `unarchive(project, id, expected_last_seq, actor)`

MCP Host Integrations

<details>
<summary>Claude Code CLI (HTTP)</summary>

- Add an HTTP MCP server via CLI:
  claude mcp add --transport http wind-task http://localhost:3000/mcp
- Note: This repo’s server uses stdio by default. To use HTTP, run a Streamable HTTP wrapper around the server.

</details>

<details>
<summary>Claude Desktop (settings JSON, stdio)</summary>

- Edit config file (platform‑specific path):
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Add under `mcpServers`:
  {
    "mcpServers": {
      "wind-task": {
        "command": "node",
        "args": ["dist/index.js"],
        "env": {},
        "transport": "stdio"
      }
    }
  }

</details>

<details>
<summary>Claude Code (VS Code) settings JSON (stdio)</summary>

- In Settings (JSON) add:
  "anthropic.mcpServers": {
    "wind-task": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {},
      "transport": "stdio"
    }
  }

</details>

<details>
<summary>VS Code (Copilot MCP) CLI</summary>

- Add an MCP server to your profile:
  code --add-mcp "{\"name\":\"wind-task\",\"command\":\"node\",\"args\":[\"/absolute/path/to/this/repo/dist/index.js\"]}"

</details>

<details>
<summary>Codex CLI</summary>

- Edit `~/.codex/config.toml`:
  [mcp_servers.wind-task]
  type = "stdio"
  command = "node"
  args = ["/absolute/path/to/this/repo/dist/index.js"]
- Verify:
  codex mcp list
  codex mcp get wind-task --json

</details>

<details>
<summary>Cursor (HTTP deeplink)</summary>

- Add via deeplink:
  cursor://anysphere.cursor-deeplink/mcp/install?name=wind-task&config=eyJ1cmwiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAvbWNwIn0%3D
- The `config` is base64url of `{ "url": "http://localhost:3000/mcp" }`.
- For this repo (stdio), expose an HTTP endpoint first (Streamable HTTP).

</details>

<details>
<summary>MCP Inspector (HTTP)</summary>

- Inspect and test HTTP servers:
  npx @modelcontextprotocol/inspector
- Connect to: http://localhost:3000/mcp

</details>

- Notes
  - Reads are resources (`resources/read`) and must include `?project=NAME`.
  - Mutations are tools (`tools/call`) and must include `project`.
  - Projects are mapped to absolute paths in `~/.wind-task/config.json`.

Data Directory

- Default store dir: `<project root>/.wind-task` (derived from config)
- Per-task folder structure:
  - `.wind-task/<id>/task.json`
  - `.wind-task/<id>/events.jsonl`

Terminal TUI (developer visualization)

- Start the TUI:

  - CWD mode (recommended): `cd /path/to/repo && npm run tui` or `npx wind-task-tui@latest`
  - Config override: `wind-task-tui --project projA` (uses `~/.wind-task/config.json`)

- Controls:
  - Column mode: `←/→` switch columns, `Enter` enters column
  - Task mode: `↑/↓` move selection, `←/→` switch columns (preserve row), `Enter` opens content, `t` opens timeline, `Esc` back
  - Timeline overlay: `Esc` closes overlay
  - Common: `F2` toggle language (English/中文), `r` reload, `q`/`Ctrl+C` quit

By default, the TUI reads from `<cwd>/.wind-task`. With `--project`, it reads the configured project’s storage (resolved as `<root>/.wind-task`). It is read-only (no mutations).

Actions (keyboard-only)

- Focus the action bar: press `F6`. Use `←/→` or `Tab/Shift+Tab` to choose an action, `Enter` to run, `Esc` to go back.
- Available actions:
  - New — create task (defaults to current column’s state)
  - Move — move selected task to TODO/ACTIVE/DONE
  - Retitle — change selected task’s title
  - Log — append a log message
  - Timeline — open timeline overlay
  - Archive/Unarchive — toggle archive state with confirmation
  - Reload — refresh the board

All destructive operations require confirmation. On conflicts (changed elsewhere), the TUI reloads and preserves selection when possible.

Smoke Test (developer-only)

- A development helper script exists at `scripts/mcp-smoke.mjs`. It is not part of the recommended user flow and may rely on environment variables. Prefer using an MCP host to call tools against the running server.

Notes

- Archived tasks block all mutations except `unarchive`
- All mutating tools require `expected_last_seq` to guard against races
- IDs are ULIDs for stable sorting and readability
- Task content is stored in `.wind-task/<id>/content.md` and exposed via `tasks://content/{id}`
Notes for CLI use

- Use absolute paths for `args`.
- The server ignores cwd; it resolves project storage via `~/.wind-task/config.json`.
 
Projects (multi-repo)

- Configure projects in `~/.wind-task/config.json`:

  {
    "projects": {
      "projA": "/abs/path/to/projA",
      "projB": "/abs/path/to/projB"
    }
  }

- Every tool call requires a `project` field.
- Every resource read requires `?project=NAME` in the URI (e.g., `tasks://board?project=projA`).
- No default project is used; missing or unknown projects return an error listing known keys.
