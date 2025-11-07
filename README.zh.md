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
- `.wind-task/` — 数据目录（首次运行时创建）

快速开始

- 前置要求：Node 18+（在 Node 22 上测试）
- 安装：`npm install`
- 启动服务器（stdio）：`npm run dev`
- 构建并运行：`npm run build && npm start`
- 启动 TUI（只读看板和时间线）：`npm run tui`

MCP 接口

- 资源（Resources）
  - `tasks://index` — 任务简表（JSON）
  - `tasks://board` — 看板列：`TODO`、`ACTIVE`、`DONE`、`ARCHIVED`（JSON）
  - `tasks://task/{id}` — 完整 `task.json`（JSON）
  - `tasks://timeline/{id}` — `events.jsonl` 渲染后的 JSON 数组（JSON）
  - `tasks://content/{id}` — 任务长文本内容（text/markdown）

- 工具（Tools）
  - `create_task(title, summary?, actor)`
  - `retitle(id, title, expected_last_seq, actor)`
  - `set_state(id, state, expected_last_seq, actor)`
  - `append_log(id, message, expected_last_seq, actor)`
  - `set_summary(id, summary, expected_last_seq, actor)`
  - `set_content(id, content, expected_last_seq, actor, format?)`
  - `archive(id, reason?, expected_last_seq, actor)`
  - `unarchive(id, expected_last_seq, actor)`

与 LLM 宿主配合使用

- Claude Desktop
  - 编辑配置文件（因平台而异）：
    - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
    - Linux: `~/.config/Claude/claude_desktop_config.json`
    - Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`
  - 在 `mcpServers` 下添加：
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
  - 重启 Claude。让它列出 MCP 资源；应能看到 `tasks://board`。

- Claude for VS Code（Claude Code）
  - 在设置（JSON）中添加：
    "anthropic.mcpServers": {
      "mcp-task-server": {
        "command": "node",
        "args": ["dist/index.js"],
        "cwd": "/absolute/path/to/this/repo",
        "env": {},
        "transport": "stdio"
      }
    }

- 说明
  - 读取能力以资源形式暴露（使用 `resources/read`）。
  - 修改能力以工具形式暴露（使用 `tools/call`）。
  - 服务器从其 `cwd` 下的 `.wind-task/` 读取数据；保持 `cwd` 指向仓库根目录。

数据目录

- 默认基目录：`.wind-task/`
- 单任务目录结构：
  - `.wind-task/<id>/task.json`
  - `.wind-task/<id>/events.jsonl`

终端 TUI（开发者可视化）

- 启动：

  npm run tui

- 控制：
  - 列模式：`←/→` 切换列，`Enter` 进入列
  - 任务模式：`↑/↓` 移动选择，`←/→` 切换列（保持行），`Enter` 打开内容，`t` 打开时间线，`Esc` 返回
  - 时间线浮层：`Esc` 关闭
  - 通用：`F2` 切换语言（English/中文），`r` 刷新，`q`/`Ctrl+C` 退出

TUI 从 `.wind-task/` 读取，且是只读（不提供修改）。

冒烟测试（可选）

- 运行一个小客户端，创建任务、追加日志、变更状态并读取时间线：
  - `timeout 5 node scripts/mcp-smoke.mjs`

备注

- 归档任务会阻止除 `unarchive` 外的所有修改
- 所有修改类工具都需要 `expected_last_seq` 来防止竞争
- ID 使用 ULID，便于稳定排序和阅读
- 任务内容保存在 `.wind-task/<id>/content.md`，并通过 `tasks://content/{id}` 暴露

Codex CLI（方法一：编辑 ~/.codex/config.toml）

- 编辑或创建 `~/.codex/config.toml`，在 `[mcp_servers]` 下添加条目：

  [mcp_servers.mcp-task-server]
  type = "stdio"
  command = "node"
  args = ["/absolute/path/to/this/repo/dist/index.js"]
  cwd = "/absolute/path/to/this/repo"  # 确保 `.wind-task/` 相对仓库根目录

- 验证注册与详情：

  codex mcp list
  codex mcp get mcp-task-server --json

- 说明
  - `args` 与 `cwd` 建议使用绝对路径。
  - 本服务器在 `cwd` 目录下读写 `.wind-task/`，请将 `cwd` 设为仓库根目录。
  - 若仓库位置变更，请同步更新 `~/.codex/config.toml` 中的路径。
