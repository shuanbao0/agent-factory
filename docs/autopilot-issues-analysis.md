# Autopilot 系统问题分析：状态感知与上下文管理

## 问题概览

当前 Autopilot 存在两个架构级问题：

1. **盲目定时器问题** — 系统通过 idle 时间猜测 agent 状态，无法感知 agent 是否正在工作，导致正在忙碌的 agent 被错误中断
2. **上下文管理问题** — 多任务共享 session 导致上下文污染，任务间缺乏清晰的上下文边界

---

## 问题一：Agent 状态感知缺失

### 现状：靠猜的定时器

当前系统完全依赖 **idle 时间**（agent 最后一次与 Gateway 通信的间隔）来判断 agent 状态：

```
idleMins >= 18 → 猜测 agent 已完成 → 自动转 review
idleMins >= 30 → 猜测 agent 已消失 → 自动转 failed
```

**核心缺陷：系统不知道 agent 到底在干什么。**

### 竞态时间线（当前行为）

```
T+0min    任务开始                              status = in_progress
T+20min   Cycle: agent 空闲 20m
          ├─ 规则A 触发: in_progress → review
          └─ 质量门异步启动
T+23min   质量门失败 → review → rework
T+30min   Cycle: agent 空闲 30m
          └─ rework → failed  ← Agent 没有 rework 的机会
```

### 根因：单 Session 架构

当前每个 agent 只有一个 `agent:{id}:main` session，任务执行和系统通信共用同一个 session。OpenClaw 的 session 内消息是**串行排队**的 — 如果 agent 正在处理任务（消息 A），发送状态查询（消息 B）会排队等 A 完成，无法实时感知状态。

### 修复方案：Chat Session + Worker 子 Agent（利用 OpenClaw 原生能力）

**OpenClaw 已经内置了 `sessions_spawn` 子 Agent 机制**，完美支持"chat 交流 + worker 干活"的双 session 模式。

#### 核心架构

```
┌─ Chat Session（父，始终响应）──────────────────────────────┐
│ Session Key: agent:{id}:main                                │
│ 职责: 接收指令、汇报状态、响应查询                           │
│                                                              │
│  收到任务 → sessions_spawn({                                 │
│    task: "写第3章：主角初入江湖...",                          │
│    mode: "run",          // 一次性执行，完成后自动清理        │
│    agentId: "{self}",    // 自己的子 agent                    │
│  })                                                          │
│                                                              │
│  立刻返回 { childSessionKey, runId, status: "accepted" }     │
│  父 session 不阻塞 ← 关键！可以继续响应其他消息              │
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │ Cycle 来了，系统问: "你在忙吗？"                    │      │
│  │ 父 session 立刻回复: "在忙，子任务 run-456 执行中"  │      │
│  │ → 系统不干预 ✓                                     │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  子 Agent 完成后，auto-announce 自动推送到父 session:        │
│  "[Subagent completed] Result: 第3章全文..."                 │
│                                                              │
│  父 session 收到完成通知 → 汇报 status=completed             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
         ↓ spawn (非阻塞)               ↑ auto-announce (推送)
┌─ Worker 子 Agent Session（独立 lane，干活）──────────────────┐
│ Session Key: agent:{id}:subagent:{uuid}                      │
│ Command Lane: 独立于父 session，完全并行                      │
│                                                              │
│ 接收: "[Subagent Task] 写第3章：主角初入江湖..."             │
│ 执行: LLM 推理 + 工具调用 + 文件读写（可能 20+ 分钟）       │
│ 完成: 输出结果 → auto-announce 推送给父                      │
│ 清理: mode="run" 自动销毁 session                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### OpenClaw 子 Agent 机制详解

**`sessions_spawn` 工具**（OpenClaw 内置）：

```javascript
// Agent 在 chat session 中调用
sessions_spawn({
  task: "完整的任务描述...",    // 传给子 agent 的 prompt
  mode: "run",                  // 一次性执行，完成后删除子 session
  agentId: "novel-writer",      // 目标 agent（可以是自己）
  runTimeoutSeconds: 1200,      // 超时 20 分钟
})

// 立刻返回（非阻塞）
→ {
    status: "accepted",
    childSessionKey: "agent:novel-writer:subagent:abc123",
    runId: "run-456",
  }
```

**Auto-Announce 推送**（子 Agent 完成后自动触发）：

```
子 Agent 完成
  ↓
系统调用 agent.wait 等待 runId 结束
  ↓
读取子 Agent 最终输出
  ↓
构建完成消息: { type: "task_completion", source: "subagent", result: "..." }
  ↓
推送到父 session（deliver: false，内部消息）
  ↓
父 session 收到: "[Subagent completed] 第3章全文..."
```

**关键特性：**
- 父子 session 在**不同 command lane**，消息处理完全并行
- 父 session **不需要轮询** — auto-announce 是 push 模式
- 子 Agent 可以用 `mode="run"` 一次性执行，完成后自动清理
- 支持 `maxConcurrent`（默认 8）和 `maxSpawnDepth`（默认 3）防护

#### 改造后的 Department Loop

```javascript
// department-loop.cjs — 任务分配改造

async function assignTaskToAgent(agentId, task, sessionKey) {
  // 1. 构建完整的任务 prompt（自包含）
  const taskPrompt = buildTaskPrompt(agentId, task)

  // 2. 通过 chat session 发送指令
  //    Agent 的 AGENTS.md 中已配置：收到任务时调用 sessions_spawn
  const directive = `
## 新任务分配

${taskPrompt}

请使用 sessions_spawn 启动子任务执行。
`
  const result = await sendToAgent(agentId, sessionKey, directive)
  // Agent 调用 sessions_spawn，返回 runId
  // Chat session 保持响应
}

// 状态查询 — 不再需要 idle 猜测
async function checkAgentStatus(agentId, sessionKey) {
  // 直接问 chat session — 它不会被阻塞（子 agent 在独立 lane）
  const result = await sendToAgent(agentId, sessionKey,
    '[系统查询] 当前任务状态？', 30000)  // 30 秒超时

  return parseStatusResponse(result.text)
  // Agent 回复: "子任务 run-456 执行中" 或 "已完成，等待收取结果"
}
```

#### autoTransitionTasks 改造

```javascript
async function autoTransitionTasks(deptId, config, chiefResponseText, options = {}) {
  // ... 遍历任务 ...

  if (task.status === 'in_progress' || task.status === 'rework') {
    if (idleMins >= IDLE_CHECK_MINS) {  // 18 分钟

      // 直接查询 agent（chat session 不被阻塞，能立刻回复）
      const status = await checkAgentStatus(assignee, sessionKey)

      if (!status || status.timeout) {
        // Chat session 都无响应 → agent 真的不可达
        task._noResponseCount = (task._noResponseCount || 0) + 1
        if (task._noResponseCount >= 2) {
          transition(task, assignee, task.status, 'failed',
            `agent 连续 ${task._noResponseCount} 次无响应`)
        }

      } else if (status.subagentRunning) {
        // 子 agent 正在执行 → 不干预
        logger.info('dept-loop',
          `Agent ${assignee} has active subagent, skipping`)

      } else if (status.completed) {
        // 子 agent 已完成 → review
        transition(task, assignee, task.status, 'review',
          `agent 报告任务已完成`)

      } else if (status.idle) {
        // Agent 确认空闲 → review
        transition(task, assignee, task.status, 'review',
          `agent 确认空闲`)
      }
    }
  }
}
```

#### Agent AGENTS.md 配置（教 agent 使用子 agent 模式）

在 `config/base-rules.md` 的 `## AGENTS_RULES` 中增加：

```markdown
## 任务执行规范

当你收到任务分配时：
1. 使用 `sessions_spawn` 启动子任务，将实际工作委托给子 agent
2. 你的 chat session 保持响应，随时可以回答状态查询
3. 子任务完成后，你会收到 auto-announce 完成通知
4. 收到完成通知后，汇报任务完成状态

当你收到 `[系统查询]` 消息时：
- 如果有正在运行的子任务 → 回复 `STATUS: working, SUBAGENT: {runId}`
- 如果子任务已完成 → 回复 `STATUS: completed`
- 如果没有任务 → 回复 `STATUS: idle`
```

#### 改造后的时间线

```
T+0min    Chief 分配任务给 novel-writer
          novel-writer chat session 收到指令
          → sessions_spawn({ task: "写第3章...", mode: "run" })
          → 子 agent 开始执行（独立 lane）
          → chat session 立刻空闲

T+10min   Cycle #1: 查询 novel-writer chat session
          → "STATUS: working, SUBAGENT: run-456"
          → 不干预 ✓

T+20min   Cycle #2: 查询 novel-writer chat session
          → "STATUS: working, SUBAGENT: run-456"
          → 不干预 ✓（子 agent 还在跑）

T+25min   子 agent 完成 → auto-announce 推送到 chat session
          → novel-writer 收到: "[Subagent completed] 第3章全文..."

T+30min   Cycle #3: 查询 novel-writer chat session
          → "STATUS: completed"
          → in_progress → review，触发质量门 ✓

T+33min   质量门失败 → rework
          Chief 重新分配 rework 任务
          → novel-writer sessions_spawn 新的子 agent 执行 rework

T+40min   Cycle #4: 查询 novel-writer chat session
          → "STATUS: working, SUBAGENT: run-789"
          → 不干预 ✓（在 rework 中）

T+55min   子 agent 完成 rework → auto-announce

T+60min   Cycle #5: 查询
          → "STATUS: completed"
          → rework → review → 质量门通过 → completed ✓
```

### 改造前后对比

| 维度 | 当前（盲猜 idle） | 改造后（Chat + Worker 子 Agent） |
|------|-------------------|-------------------------------|
| 状态判定 | idle 时间阈值 | 直接询问 chat session |
| 能否感知在忙 | 不能（猜测） | 能（chat session 立刻回复） |
| 中断在忙 agent | 会（18分钟强制 review） | 不会（子 agent 在独立 lane） |
| Rework 保护 | 无 | 天然保护（查询到 working 就不干预） |
| 任务执行并发 | 无（session 串行） | 有（子 agent 独立 lane） |
| 结果获取 | 被动等 idle | auto-announce 主动推送 |
| OpenClaw 支持 | — | 原生 `sessions_spawn` + `auto-announce` |
| 额外 token | 无 | 每次查询 ~200 tokens（chat session 秒级回复） |

### 配置要求

`config/openclaw.json` 中的 agent 配置需要启用子 agent：

```json
{
  "agents": {
    "defaults": {
      "subagents": {
        "maxConcurrent": 8,
        "maxSpawnDepth": 3,
        "runTimeoutSeconds": 1200,
        "announceTimeoutMs": 90000
      }
    }
  }
}
```

---

## 问题二：上下文管理

### 现状：多任务共享 Session

```
当前模型：
  所有任务 → agent:{id}:main（同一个 session）→ 上下文无限累积

  Task A 的对话（10K tokens）
  + Task B 的对话（8K tokens）
  + Task C 的对话（12K tokens）
  = 30K tokens 的混合上下文 ← LLM 每次调用都要处理全部
```

### 核心问题

1. **上下文污染** — Task A 的写作讨论影响 Task B 的编辑决策
2. **Token 浪费** — 每次 LLM 调用携带所有历史任务的对话
3. **Compact 无差别压缩** — 压缩时可能丢弃当前任务的关键上下文，保留无关任务的

### 设计原则

**所有任务（包括子任务）都应该有独立的干净上下文。** 通过完整清晰的 prompt 描述来保证每个任务的上下文自包含，不依赖 session 中的历史对话。

### 与问题一方案的结合

问题一引入的 Chat + Worker 子 Agent 模式天然解决了上下文隔离：

```
Chat Session（父）: 只做指令调度和状态查询，上下文很轻
Worker Session（子）: mode="run"，每次任务新建，完成后自动销毁
```

**每个任务的 worker 子 session 天然就是干净的上下文** — `sessions_spawn` 创建的子 session 从零开始，不带任何历史对话。

### 理想模型：每个任务独立 Worker Session

```
Agent Chat Session: agent:{id}:main（轻量，只做调度）

  ┌─ Task A ──────────────────────────────────────────────┐
  │  Chat: sessions_spawn({ task: prompt_A, mode: "run" })│
  │  Worker: agent:{id}:subagent:{uuid-1}（干净上下文）   │
  │  完成: auto-announce → 提取记忆 → worker 自动销毁     │
  └────────────────────────────────────────────────────────┘

  ┌─ Task B ──────────────────────────────────────────────┐
  │  Chat: sessions_spawn({ task: prompt_B, mode: "run" })│
  │  Worker: agent:{id}:subagent:{uuid-2}（干净上下文）   │
  │  prompt_B 包含 Task A 的记忆摘要                       │
  │  完成: auto-announce → 提取记忆 → worker 自动销毁     │
  └────────────────────────────────────────────────────────┘

  ┌─ Task C (3 个子任务，串行执行) ───────────────────────┐
  │                                                        │
  │  SubTask C-1:                                          │
  │    sessions_spawn({ task: prompt_C1, mode: "run" })    │
  │    worker 完成 → 提取记忆 → worker 销毁                │
  │                                                        │
  │  SubTask C-2:                                          │
  │    sessions_spawn({ task: prompt_C2, mode: "run" })    │
  │    prompt_C2 包含 C-1 记忆摘要                         │
  │    worker 完成 → 提取记忆 → worker 销毁                │
  │                                                        │
  │  SubTask C-3:                                          │
  │    sessions_spawn({ task: prompt_C3, mode: "run" })    │
  │    prompt_C3 包含 C-1 + C-2 记忆摘要                   │
  │    worker 完成 → 提取记忆 → worker 销毁                │
  │                                                        │
  └────────────────────────────────────────────────────────┘
```

**每个 worker session 都是 `mode="run"`，天然隔离，天然清理。**

### Prompt 驱动的上下文（关键设计）

每个 worker session 从零开始，所有上下文必须通过 spawn 的 `task` 参数完整提供：

```javascript
function buildTaskPrompt(agentId, task, parentTask, siblingMemories) {
  let prompt = ''

  // ── 1. Agent 身份 ──
  const agentMemory = readMemorySummary(agentId)
  if (agentMemory) {
    prompt += `## 你的身份与记忆\n${agentMemory}\n\n`
  }

  // ── 2. 项目背景 ──
  if (task.projectId) {
    const projectContext = readProjectContext(task.projectId)
    prompt += `## 项目背景\n${projectContext}\n\n`
  }

  // ── 3. 父任务概述（如果是子任务） ──
  if (parentTask) {
    prompt += `## 父任务\n`
    prompt += `- 名称: ${parentTask.name}\n`
    prompt += `- 目标: ${parentTask.description}\n`
    prompt += `- 总共 ${parentTask.subtaskCount} 个子任务，当前是第 ${task.subtaskIndex} 个\n\n`
  }

  // ── 4. 前序子任务的记忆摘要 ──
  if (siblingMemories && siblingMemories.length > 0) {
    prompt += `## 已完成的前序子任务\n`
    for (const m of siblingMemories) {
      prompt += `### ${m.taskName}\n${m.summary}\n`
      if (m.keyOutputs) prompt += `产出: ${m.keyOutputs}\n`
      prompt += '\n'
    }
  }

  // ── 5. 相关历史经验 ──
  const relatedMemories = loadRelevantTaskMemories(agentId, task, {
    sameProject: true, sameType: true, reworkFrom: true,
    maxEntries: 3, maxChars: 2000,
  })
  if (relatedMemories.length > 0) {
    prompt += `## 相关历史经验\n`
    for (const m of relatedMemories) {
      prompt += `- ${m.taskName}: ${m.summary}\n`
    }
    prompt += '\n'
  }

  // ── 6. 当前任务 ──
  prompt += `## 当前任务\n`
  prompt += `- ID: ${task.id}\n`
  prompt += `- 名称: ${task.name}\n`
  prompt += `- 类型: ${task.type}\n\n`
  prompt += `### 任务描述\n${task.description}\n\n`

  // ── 7. 质量标准 ──
  const qualityConfig = getQualityConfigForTask(task)
  if (qualityConfig) {
    prompt += `### 质量标准\n`
    if (qualityConfig.minScore) prompt += `- 最低分数: ${qualityConfig.minScore}\n`
    if (qualityConfig.validators) {
      for (const v of qualityConfig.validators) {
        prompt += `- ${v}: ${JSON.stringify(qualityConfig.validatorConfig?.[v] || {})}\n`
      }
    }
    prompt += '\n'
  }

  // ── 8. Rework 信息 ──
  if (task.reworkFromId) {
    const originalMemory = loadTaskMemory(agentId, task.reworkFromId)
    prompt += `## 返工信息\n`
    if (task.validationErrors) {
      prompt += `### 失败原因\n`
      prompt += task.validationErrors.map(e => `- ${e}`).join('\n') + '\n\n'
    }
    if (originalMemory) {
      prompt += `### 原任务摘要\n${originalMemory.summary}\n\n`
    }
    prompt += `请针对以上问题进行修改。\n\n`
  }

  return prompt
}
```

### 记忆提取与存储

每个 worker session 完成后，从 auto-announce 的结果中提取记忆：

```javascript
function extractTaskMemory(agentId, task, workerOutput) {
  const memory = {
    taskId: task.id,
    taskName: task.name,
    taskType: task.type,
    projectId: task.projectId,
    summary: extractSummary(workerOutput, 500),
    keyOutputs: extractKeyOutputs(workerOutput),
    quality: task.quality || null,
    completedAt: task.completedAt,
  }

  // 存储到 agents/{agentId}/memory/tasks/{taskId}.md
  const memoryPath = path.join(AGENTS_DIR, agentId, 'memory', 'tasks', `${task.id}.md`)
  fs.mkdirSync(path.dirname(memoryPath), { recursive: true })
  fs.writeFileSync(memoryPath, formatTaskMemory(memory))
  return memory
}
```

### Session 生命周期（改造后）

```
┌──────────────────────────────────────────────────────────────┐
│ Chat Session: agent:{id}:main（持久，轻量）                   │
│   - 接收 chief 指令                                          │
│   - 响应系统状态查询                                          │
│   - 调用 sessions_spawn 委托任务                              │
│   - 接收 auto-announce 完成通知                               │
│   - 上下文只有调度对话，不含任务工作内容                       │
│                                                              │
│ Worker Session: agent:{id}:subagent:{uuid}（临时，独立）      │
│   - 每个任务创建一个                                          │
│   - mode="run"，完成后自动销毁                                │
│   - 上下文 = spawn 时传入的 task prompt（完全自包含）          │
│   - 不需要 compact（单任务不会超 token 限制）                 │
│   - 不需要手动 clear（自动销毁）                              │
│                                                              │
│ 完整周期:                                                    │
│   Chat 收到任务 → spawn worker (prompt=自包含) → worker 执行  │
│   → worker 完成 → auto-announce → 提取记忆 → worker 销毁     │
│   → Chat 等待下一个任务                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 改造影响评估

| 改动点 | 文件 | 影响 |
|--------|------|------|
| Agent 任务执行改为 spawn 模式 | `config/base-rules.md` | 中 — Agent 指令变更 |
| 状态查询逻辑 | `department-loop.cjs` | 中 — checkAgentStatus 替代 idle 猜测 |
| buildTaskPrompt | `scripts/autopilot/` 新文件 | 大 — 构建完整自包含 prompt |
| 记忆提取 | `core/agent/memory.cjs` | 小 — 新增 extractTaskMemory |
| 记忆存储 | `agents/{id}/memory/tasks/` | 小 — 新目录 |
| 子任务串行调度 | `department-loop.cjs` | 中 — 等待 auto-announce 后发下一个 |
| openclaw.json 配置 | `config/openclaw.json` | 小 — 启用 subagents |
| 移除 session compact 逻辑 | `department-loop.cjs` | 小 — 不再需要 |

### 迁移策略

分 2 阶段实施：

**阶段 1：Chat + Worker 双 Session（核心能力）**
- Agent AGENTS.md 增加 sessions_spawn 使用规范
- department-loop 改为 checkAgentStatus 替代 idle 猜测
- 实现 buildTaskPrompt 构建自包含 prompt
- 实现记忆提取与存储
- 启用 openclaw.json subagents 配置
- 移除 session compact / stale 定时器逻辑

**阶段 2：子任务拆分 + 串行调度（高级能力）**
- Chief 识别复杂任务 → 拆分为子任务列表
- 每个子任务独立 spawn worker
- 前序子任务记忆摘要注入后续子任务 prompt
- 父任务完成后汇总所有子任务记忆

---

## 两个问题的统一解决

Chat + Worker 子 Agent 模式**同时解决了两个问题**：

| 问题 | 当前 | Chat + Worker 模式 |
|------|------|-------------------|
| 状态感知 | 猜 idle 时间 | 直接问 chat session（不被 worker 阻塞） |
| 中断在忙 agent | 会 | 不会（worker 在独立 lane） |
| Rework 竞态 | rework 被 stale 规则覆盖 | 查询到 working 就不干预 |
| 上下文污染 | 多任务共享 session | 每个任务独立 worker session |
| Token 浪费 | 携带所有历史对话 | worker 只有当前任务 prompt |
| Compact 丢失信息 | 压缩时丢当前任务上下文 | 不需要 compact（单任务不超限） |
| 上下文可预测性 | 依赖 session 历史残留 | 完全由 prompt 决定 |
| 结果获取 | 被动等 idle | auto-announce 主动推送 |

**不需要分别解决两个问题 — 一个架构改动同时解决。**

---

## 附录：关键常量参考

| 常量 | 当前值 | 建议值 | 说明 |
|------|--------|--------|------|
| `IDLE_CHECK_MINS` | 18 (原 IDLE_COMPLETE_MINS) | 18 | 触发 chat session 状态查询的阈值 |
| `STATUS_QUERY_TIMEOUT_MS` | (无) | 30000 | Chat session 状态查询超时 |
| `MAX_NO_RESPONSE_COUNT` | (无) | 2 | Chat session 连续无响应次数 → failed |
| `WORKER_TIMEOUT_SECONDS` | (无) | 1200 | Worker 子 agent 执行超时（20分钟） |
| `MAX_TASK_MEMORIES` | (无) | 5 | Prompt 注入记忆条数上限 |
| `MEMORY_MAX_CHARS` | (无) | 3000 | Prompt 注入记忆字符上限 |
| subagents.maxConcurrent | 8 | 1 | 每个 agent 同时执行的子任务数（建议串行=1） |
| subagents.maxSpawnDepth | 3 | 2 | 子 agent 嵌套深度 |

## 附录：关键文件路径

| 文件 | 当前职责 | 需要改动 |
|------|---------|---------|
| `scripts/autopilot/department-loop.cjs` | 部门循环 + autoTransitionTasks | 状态查询 + spawn 调度 |
| `scripts/autopilot/constants.cjs` | 超时常量 | 新增查询 / worker 超时常量 |
| `core/agent/memory.cjs` | 记忆压缩 | 新增 extractTaskMemory |
| `config/base-rules.md` | Agent 全局规则 | 增加 sessions_spawn 使用规范 |
| `config/openclaw.json` | Gateway 配置 | 启用 subagents 配置 |
| `scripts/autopilot/dept-directive.cjs` | Directive 构建 | 新增 buildTaskPrompt |

## 附录：OpenClaw 子 Agent 关键源码

| 文件 | 职责 |
|------|------|
| `openclaw/src/agents/subagent-spawn.ts` | Spawn 入口，创建子 session |
| `openclaw/src/agents/subagent-announce.ts` | Auto-announce，完成推送 |
| `openclaw/src/agents/subagent-registry.ts` | 活跃子 agent 注册表 |
| `openclaw/src/agents/tools/sessions-spawn-tool.ts` | sessions_spawn 工具定义 |
| `openclaw/src/agents/pi-embedded-runner/lanes.ts` | Command lane 路由（不同 session 独立 lane） |
| `openclaw/src/config/sessions/store.ts` | Session 存储（共享写锁，但消息处理并行） |
