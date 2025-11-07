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
- `.wind-task/` — data directory (created on first run)

Projects (multi-repo)

- Configure projects in `~/.wind-task/config.json`:

  {
    "projects": {
      "projA": "/abs/path/to/projA/.wind-task",
      "projB": "/abs/path/to/projB/.wind-task"
    }
  }

- Every tool call requires a `project` field.
- Every resource read requires `?project=NAME` in the URI (e.g., `tasks://board?project=projA`).
- No default project is used; missing or unknown projects return an error listing known keys.

Quick Start

- Prereqs: Node 18+ (tested with Node 22)
- Install: `npm install`
- Start server (stdio): `npm run dev`
- Build and run: `npm run build && npm start`
- TUI (read‑only board and timeline): `npm run tui`

MCP Surface

- Resources
  - `tasks://index?project={project}` — compact list of tasks (JSON)
  - `tasks://board?project={project}` — board with `TODO`, `ACTIVE`, `DONE`, `ARCHIVED` columns (JSON)
  - `tasks://task/{id}?project={project}` — full `task.json` (JSON)
  - `tasks://timeline/{id}?project={project}` — `events.jsonl` rendered as JSON array (JSON)
  - `tasks://content/{id}?project={project}` — long-form task content (text/markdown)

- Tools
  - `create_task(project, title, summary?, actor)`
  - `retitle(project, id, title, expected_last_seq, actor)`
  - `set_state(project, id, state, expected_last_seq, actor)`
  - `append_log(project, id, message, expected_last_seq, actor)`
  - `set_summary(project, id, summary, expected_last_seq, actor)`
  - `set_content(project, id, content, expected_last_seq, actor, format?)`
  - `archive(project, id, reason?, expected_last_seq, actor)`
  - `unarchive(project, id, expected_last_seq, actor)`

Using With LLM Hosts

- Claude Desktop
  - Edit config file (platform‑specific path):
    - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
    - Linux: `~/.config/Claude/claude_desktop_config.json`
    - Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`
  - Add under `mcpServers`:
    {
      "mcpServers": {
        "mcp-task-server": {
          "command": "node",
          "args": ["dist/index.js"],
          "cwd": "/absolute/path/to/this/repo",
          "env": {},
          "transport": "stdio"
        }
      }
    }
  - Restart Claude. Ask it to list MCP resources; you should see `tasks://board`.

- Claude for VS Code (Claude Code)
  - In Settings (JSON) add:
    "anthropic.mcpServers": {
      "mcp-task-server": {
        "command": "node",
        "args": ["dist/index.js"],
        "cwd": "/absolute/path/to/this/repo",
        "env": {},
        "transport": "stdio"
      }
    }

- Notes
  - Reads are exposed as resources (use `resources/read`), always include `?project=NAME`.
  - Mutations are tools (use `tools/call`), always include `project`.
  - Projects are mapped to absolute paths in `~/.wind-task/config.json`.

Data Directory

- Default base dir: `.wind-task/`
- Per-task folder structure:
  - `.wind-task/<id>/task.json`
  - `.wind-task/<id>/events.jsonl`

Terminal TUI (developer visualization)

- Start the TUI:

  npm run tui

- Controls:
  - Column mode: `←/→` switch columns, `Enter` enters column
  - Task mode: `↑/↓` move selection, `←/→` switch columns (preserve row), `Enter` opens content, `t` opens timeline, `Esc` back
  - Timeline overlay: `Esc` closes overlay
  - Common: `F2` toggle language (English/中文), `r` reload, `q`/`Ctrl+C` quit

The TUI reads from `.wind-task/` and is read-only (no mutations).

Codex CLI

- Register the MCP server globally (stdio transport):

  codex mcp add mcp-task-server -- node /absolute/path/to/this/repo/dist/index.js

- Verify registration:

  codex mcp list

- Show details or remove:

  codex mcp get mcp-task-server --json
  codex mcp remove mcp-task-server

- Notes
  - Codex CLI stores config in `~/.codex/config.toml`.
  - Use an absolute path in the `add` command to avoid `cwd` issues.
  - This server requires a `project` for all tools and `?project=` on resources; include it in your prompts so the agent passes it.

Smoke Test (optional)

- Run a small client that creates a task, appends a log, moves state, and reads the timeline:
  - `timeout 5 node scripts/mcp-smoke.mjs`

Notes

- Archived tasks block all mutations except `unarchive`
- All mutating tools require `expected_last_seq` to guard against races
- IDs are ULIDs for stable sorting and readability
- Task content is stored in `.wind-task/<id>/content.md` and exposed via `tasks://content/{id}`
