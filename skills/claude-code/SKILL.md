---
name: claude-code
description: "指导 Agent 使用 Claude Code CLI 执行编码任务。通过 exec + process 工具启动 claude-cli，支持 TTY、后台执行、进度监控和完成检测。"
version: 1.0.0
author: Agent Factory
keywords: [claude-code, coding-agent, ai-agent, automation, exec-tool, process-tool]
license: GPL-3.0
---

# Claude Code Skill

## 概述

Claude Code 是 Anthropic 的官方 CLI 编程工具。本 skill 指导 OpenClaw Agent 通过 `exec` 和 `process` 工具执行 Claude Code 编码任务，实现全自动的代码编写、分析、重构和测试。

**适用场景：**
- 功能实现（编码 + 测试）
- 代码分析和重构
- Bug 调查和修复
- 测试编写和执行

## 前置条件

- `claude` CLI 已安装（`which claude` 可找到）
- 目标项目是 git 仓库
- Agent 有 `exec` 和 `process` 工具权限

## 快速流程（三步）

```
1. 准备 → 生成 PROMPT.md（手动编写或用 prepare-prompt.mjs 脚本）
2. 执行 → exec 工具启动 claude CLI（pty:true + background:true）
3. 监控 → process 工具轮询状态，完成后收集产出
```

---

## Agent 工具调用模式

### 步骤 1：准备任务指令

**方式 A — 脚本自动生成（推荐，可集成任务标准）：**

```bash
node skills/claude-code/scripts/prepare-prompt.mjs \
  --task <taskId> \
  --workdir <项目目录>
```

脚本会从任务系统拉取任务信息和相关标准，生成 `<workdir>/PROMPT.md`。

**方式 B — 手动编写：**

Agent 自行在目标目录创建 PROMPT.md，内容包含任务要求。

**方式 C — 直接传入（简单任务）：**

直接将指令字符串传给 claude 命令，无需 PROMPT.md。

### 步骤 2：使用 exec 工具启动 Claude Code

```
exec 工具参数:
  command: "claude --model claude-sonnet-4-6 \"$(cat PROMPT.md)\""
  workdir: <项目目录>
  background: true
  pty: true
  timeout: 3600
  yieldMs: 60000
```

**参数说明：**
- `pty: true` — **必须**。Claude Code 是交互式 CLI，需要 TTY 支持，否则会挂起
- `background: true` — 后台运行，允许 Agent 继续监控
- `timeout: 3600` — 1 小时超时（可按任务复杂度调整）
- `yieldMs: 60000` — 每 60 秒让出控制权给 Agent

**简单任务可直接传入指令（方式 C）：**

```
exec 工具参数:
  command: "claude --model claude-sonnet-4-6 \"实现 XXX 功能，写入 src/xxx.swift\""
  workdir: <项目目录>
  background: true
  pty: true
  timeout: 1800
```

**记录返回的 sessionId**，后续监控需要。

### 步骤 3：使用 process 工具监控

**轮询状态（每 30-60 秒一次）：**

```
process 工具参数:
  action: "poll"
  sessionId: <步骤 2 返回的 sessionId>
```

返回值包含 `running` / `exited` 状态和 `exitCode`。

**查看最近日志：**

```
process 工具参数:
  action: "log"
  sessionId: <sessionId>
  offset: -30
```

查看 Claude Code 最近 30 行输出，了解执行进度。

**终止（如果需要）：**

```
process 工具参数:
  action: "kill"
  sessionId: <sessionId>
```

### 步骤 4：完成检测

当 `process poll` 返回 `exited` 状态：

- `exitCode: 0` → 成功完成
- `exitCode: 非0` → 执行失败，查看日志分析原因

完成后：
1. 检查产出文件是否存在（读取目标目录）
2. 如有关联任务，通过任务 API 更新状态
3. 向主管汇报完成情况

---

## Claude Code 常用参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--model <model>` | 指定模型 | `--model claude-sonnet-4-6` |
| `--dangerously-skip-permissions` | 跳过权限确认（自动模式） | 用于无人值守场景 |
| `--allowedTools <tools>` | 限制可用工具 | `--allowedTools "Read,Write,Bash"` |
| `--max-turns <n>` | 限制最大轮次 | `--max-turns 20` |
| `-p <prompt>` | 直接传入 prompt（非交互） | `-p "分析这段代码"` |

**推荐组合（自动化执行）：**

```bash
claude --model claude-sonnet-4-6 --dangerously-skip-permissions "$(cat PROMPT.md)"
```

---

## prepare-prompt.mjs 脚本

### 用法

```bash
# 从任务系统生成（推荐）
node skills/claude-code/scripts/prepare-prompt.mjs \
  --task <taskId> \
  --workdir /path/to/project

# 直接指定目标
node skills/claude-code/scripts/prepare-prompt.mjs \
  --goal "实现用户登录功能" \
  --workdir /path/to/project

# 指定部门（加载部门标准）
node skills/claude-code/scripts/prepare-prompt.mjs \
  --goal "实现 SwiftUI 列表视图" \
  --dept apple-dev \
  --workdir /path/to/project
```

### 输出

生成 `<workdir>/PROMPT.md`，内容自动包含：
- 任务目标和要求
- 任务类型标准（来自 config/task-standards.md）
- 部门执行标准（来自 config/dept-standards.md）
- 项目标准（来自项目 STANDARDS.md，如有）
- 产出路径和完成条件

---

## 与任务系统集成

执行 Claude Code 前后，Agent 应通过任务 API 更新状态：

```bash
# 开始执行 → 更新任务状态为 in_progress
curl -X PUT -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress","progress":10}' \
  "http://127.0.0.1:3100/api/agent-tasks/<taskId>"

# 完成后 → 更新进度和产出路径
curl -X PUT -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"progress":100,"output":"projects/apple-dev/myapp/src/Feature.swift"}' \
  "http://127.0.0.1:3100/api/agent-tasks/<taskId>"
```

---

## 安全和限制

### 工作目录隔离
- Claude Code 的 workdir 应限制在项目目录或 workspaces/ 内
- 不要以 Agent Factory 根目录作为 workdir

### 超时控制
- 简单任务：30 分钟（`timeout: 1800`）
- 复杂功能：1 小时（`timeout: 3600`）
- 如果超时，process 工具会自动终止

### 权限
- 使用 `--dangerously-skip-permissions` 时，Claude Code 可执行任意 shell 命令
- 建议对敏感项目使用 `--allowedTools` 限制工具范围

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Claude Code 挂起 | 缺少 TTY | 确保 exec 工具使用 `pty: true` |
| Session 无法启动 | claude 未安装 | 检查 `which claude` |
| 权限确认阻塞 | 未跳过权限 | 添加 `--dangerously-skip-permissions` |
| 超时终止 | 任务过大 | 拆分为更小的子任务，或增大 timeout |
| 产出在错误位置 | workdir 设置错误 | 检查 exec 的 workdir 参数 |
| exitCode 非 0 | 执行失败 | 用 process log 查看错误详情 |

---

## 完整示例

**Agent 执行一个 iOS 编码任务的完整流程：**

```
1. 收到任务 [Task: task-abc] "实现记账页面的 SwiftUI 视图"

2. 准备 PROMPT.md:
   exec: node skills/claude-code/scripts/prepare-prompt.mjs --task task-abc --workdir /projects/apple-dev/zhiji

3. 启动 Claude Code:
   exec:
     command: "claude --model claude-sonnet-4-6 --dangerously-skip-permissions \"$(cat PROMPT.md)\""
     workdir: /projects/apple-dev/zhiji
     background: true
     pty: true
     timeout: 3600
     yieldMs: 60000
   → 返回 sessionId: "sess-xyz"

4. 每 60 秒监控:
   process: action="poll", sessionId="sess-xyz"
   → { status: "running" }

   process: action="log", sessionId="sess-xyz", offset=-20
   → 查看最近进度

5. 完成检测:
   process: action="poll", sessionId="sess-xyz"
   → { status: "exited", exitCode: 0 }

6. 验证产出:
   读取 /projects/apple-dev/zhiji/src/Presentation/Views/RecordView.swift
   确认文件存在且内容合理

7. 更新任务:
   curl PUT /api/agent-tasks/task-abc → { progress: 100, output: "src/..." }

8. 向主管汇报完成
```
