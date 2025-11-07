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
- `tasks/` — data directory (created on first run)

Quick Start

- Prereqs: Node 18+ (tested with Node 22)
- Install: `npm install`
- Start server (stdio): `npm run dev`
- Build and run: `npm run build && npm start`
- TUI (read‑only board and timeline): `npm run tui`

MCP Surface

- Resources
  - `tasks://index` — compact list of tasks (JSON)
  - `tasks://board` — board with `TODO`, `ACTIVE`, `DONE`, `ARCHIVED` columns (JSON)
  - `tasks://task/{id}` — full `task.json` (JSON)
  - `tasks://timeline/{id}` — `events.jsonl` rendered as JSON array (JSON)

- Tools
  - `create_task(title, summary?, actor)`
  - `retitle(id, title, expected_last_seq, actor)`
  - `set_state(id, state, expected_last_seq, actor)` — accepts legacy `IN_DEV`/`FINISHED`
  - `append_log(id, message, expected_last_seq, actor)`
  - `set_summary(id, summary, expected_last_seq, actor)`
  - `archive(id, reason?, expected_last_seq, actor)`
  - `unarchive(id, expected_last_seq, actor)`

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
  - Reads are exposed as resources (use `resources/read`).
  - Mutations are tools (use `tools/call`).
  - The server reads `.wind-task/` relative to its `cwd`. Keep `cwd` set to the repo root.

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
  - Task mode: `↑/↓` move selection, `←/→` switch columns (preserve row), `Enter` opens timeline, `Esc` back
  - Timeline overlay: `Esc` closes overlay
  - Common: `r` reload, `q`/`Ctrl+C` quit

The TUI reads from `.wind-task/` and is read-only (no mutations).

Smoke Test (optional)

- Run a small client that creates a task, appends a log, moves state, and reads the timeline:
  - `timeout 5 node scripts/mcp-smoke.mjs`

Notes

- Archived tasks block all mutations except `unarchive`
- All mutating tools require `expected_last_seq` to guard against races
- IDs are ULIDs for stable sorting and readability
