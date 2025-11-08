[English](README.md) | [中文](README.zh.md)

MCP 任务服务器

最小化的 MCP 服务器，供 LLM 代理管理基于文件的简单任务。任务生命周期为 TODO → ACTIVE → DONE，另有 ARCHIVED 作为锁定状态（单独的看板列）。每个任务都有追加式事件日志，提供完整的历史和上下文。

![Wind Task Board](docs/assets/task_board.png)

特性

- 状态：`TODO`、`ACTIVE`、`DONE`；通过 `archived_at` 标记为 `ARCHIVED`（阻止后续修改）
- 每个任务一个追加式 `events.jsonl`；`task.json` 保存当前视图
- 使用 `expected_last_seq` 的乐观并发控制
- 看板与索引资源；任务与时间线资源模板
- 无标签、无负责人、无验证流程

项目结构

- `src/types.ts` — 任务、事件、视图类型
- `src/id.ts` — 极简 ULID 生成器（时间可排序 ID）
- `src/store.ts` — 基于文件的存储与操作
- `src/index.ts` — MCP 服务器（stdio 传输）
- `.wind-task/` — 数据目录（按项目；见“项目”一节）

快速开始

- 前置要求：Node 18+（在 Node 22 上测试）
- 安装：`npm install`
- 启动服务器（stdio）：`npm run dev`
- 构建并运行：`npm run build && npm start`
 - 启动 TUI（只读看板和时间线）：`npm run tui`
  - 或通过 npx 运行：`npx wind-task-tui@latest`
  - 服务器通过 npx：`npx wind-task@latest`

配置准备

- 配置文件位置：`~/.wind-task/config.json`（用户级配置）
- 最小示例（推荐：映射到项目根目录；存储位于该目录下的 `.wind-task`）：

  {
    "projects": { "projA": "/abs/path/to/projA" }
  }

- 规则
  - `base_dir` 建议使用绝对路径。
  - `~/` 会展开为家目录；相对路径会被规范化为绝对路径。
  - 服务器会在目录不存在时创建 `base_dir`，并在其下存放任务数据。
- 验证
  - 通过 MCP 宿主读取 `config://projects`，或直接查看 `~/.wind-task/config.json`。
- 常见错误
  - 工具调用缺少 `project` 字段。
  - 资源 URI 未带 `?project=NAME`。
  - 未知的项目键（请确认已在配置中存在）。

- 详见“项目（多仓库）”。

MCP 接口

项目（多仓库）

- 在 `~/.wind-task/config.json` 配置项目映射：

  {
    "projects": {
      "projA": "/abs/path/to/projA/.wind-task",
      "projB": "/abs/path/to/projB/.wind-task"
    }
  }

- 每次工具调用必须包含 `project` 字段。
- 每次资源读取必须在 URI 上携带 `?project=NAME`（例如 `tasks://board?project=projA`）。
- 不存在默认项目；缺失或未知项目会报错，并列出已知项目键。

- 资源（Resources）
  - `tasks://index?project={project}` — 任务简表（JSON）
  - `tasks://board?project={project}` — 看板列（JSON）
  - `tasks://task/{id}?project={project}` — 完整 `task.json`（JSON）
  - `tasks://timeline/{id}?project={project}` — 渲染后的时间线（JSON）
  - `tasks://content/{id}?project={project}` — 任务长文本内容（text/markdown）
  - `config://projects` — 当前项目映射（只读 JSON）

- 工具（Tools）
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

MCP 宿主集成

<details>
<summary>Claude Code CLI（HTTP）</summary>

- 通过 CLI 添加 HTTP MCP 服务器：
  claude mcp add --transport http wind-task http://localhost:3000/mcp
- 说明：本仓库默认使用 stdio。如需 HTTP，请为服务器提供 Streamable HTTP 包装。

</details>

<details>
<summary>Claude Desktop（settings JSON，stdio）</summary>

- 编辑配置文件（因平台而异）：
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- 在 `mcpServers` 下添加：
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
<summary>Claude Code（VS Code）settings JSON（stdio）</summary>

- 在设置（JSON）中添加：
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
<summary>VS Code（Copilot MCP）CLI</summary>

- 将 MCP 服务器添加到用户配置：
  code --add-mcp "{\"name\":\"wind-task\",\"command\":\"node\",\"args\":[\"/absolute/path/to/this/repo/dist/index.js\"]}"

</details>

<details>
<summary>Codex CLI</summary>

- 编辑 `~/.codex/config.toml`：
  [mcp_servers.wind-task]
  type = "stdio"
  command = "node"
  args = ["/absolute/path/to/this/repo/dist/index.js"]
- 验证：
  codex mcp list
  codex mcp get wind-task --json

</details>

<details>
<summary>Cursor（HTTP deeplink）</summary>

- 通过 deeplink 添加：
  cursor://anysphere.cursor-deeplink/mcp/install?name=wind-task&config=eyJ1cmwiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAvbWNwIn0%3D
- `config` 为 `{ "url": "http://localhost:3000/mcp" }` 的 base64url。
- 本仓库为 stdio，如需在 Cursor 使用，请先提供 HTTP 端点（Streamable HTTP）。

</details>

- 说明
  - 读取能力以资源形式暴露（使用 `resources/read`），必须带上 `?project=NAME`。
  - 修改能力以工具形式暴露（使用 `tools/call`），必须带上 `project`。
  - 项目通过 `~/.wind-task/config.json` 映射到绝对路径。

数据目录

- 默认基目录：`.wind-task/`（按项目；由配置指向）
- 单任务目录结构：
  - `.wind-task/<id>/task.json`
  - `.wind-task/<id>/events.jsonl`

终端 TUI（开发者可视化）

- 启动：

  - CWD 模式（推荐）：`cd /path/to/repo && npm run tui` 或 `npx wind-task-tui@latest`
  - 使用配置覆盖：`wind-task-tui --project projA`（读取 `~/.wind-task/config.json`）

- 控制：
  - 列模式：`←/→` 切换列，`Enter` 进入列
  - 任务模式：`↑/↓` 移动选择，`←/→` 切换列（保持行），`Enter` 打开内容，`t` 打开时间线，`Esc` 返回
  - 时间线浮层：`Esc` 关闭
  - 通用：`F2` 切换语言（English/中文），`r` 刷新，`q`/`Ctrl+C` 退出

默认情况下，TUI 从 `<cwd>/.wind-task` 读取；使用 `--project` 时，从配置的项目存储中读取（解析为 `<root>/.wind-task`）。TUI 为只读（不提供修改）。

冒烟测试（开发者用途）

- 仓库中有一个辅助脚本 `scripts/mcp-smoke.mjs`，主要用于开发调试，可能依赖环境变量。推荐用户通过 MCP 宿主对正在运行的服务器调用工具，而非直接运行该脚本。

备注

- 归档任务会阻止除 `unarchive` 外的所有修改
- 所有修改类工具都需要 `expected_last_seq` 来防止竞争
- ID 使用 ULID，便于稳定排序和阅读
- 任务内容保存在 `.wind-task/<id>/content.md`，并通过 `tasks://content/{id}` 暴露

CLI 使用说明

- `args` 建议使用绝对路径。
- 服务器忽略 cwd；它通过 `~/.wind-task/config.json` 解析项目存储位置。
