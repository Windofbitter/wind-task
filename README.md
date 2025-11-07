MCP Task Server

Minimal MCP server for LLM agents to manage simple tasks backed by files. Lifecycle is TODO → ACTIVE → DONE, with ARCHIVED as a lock (separate board column). Append-only event logs per task provide full history and context.

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

Run (development)

1) Install deps (requires network):

   npm install

2) Start with tsx (stdio transport):

   npm run dev

Or build and run:

   npm run build && npm start

Data Directory

- Default base dir: `.wind-task/`
- Per-task folder structure:
  - `.wind-task/<id>/task.json`
  - `.wind-task/<id>/events.jsonl`

Terminal TUI (developer visualization)

- Start the TUI:

  npm run tui

- Controls:
  - `Tab` — focus next column
  - `Enter` — open timeline for selected task (last 100 events)
  - `r` — reload board
  - `q` or `Ctrl+C` — quit

The TUI reads from `.wind-task/` and is read-only (no mutations).

Notes

- Archived tasks block all mutations except `unarchive`
- All mutating tools require `expected_last_seq` to guard against races
- IDs are ULIDs for stable sorting and readability
