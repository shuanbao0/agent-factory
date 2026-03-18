# Autopilot 系统架构分析：单 Session 困局与 Chat + Worker 方案

## 设计原则

**每个任务必须使用独立的干净上下文。** 如果一个任务复杂到无法在单个上下文中完成，就必须拆分为可以独立完成的子任务。

```
原则 1: 一个任务 = 一个独立上下文（干净 session，自包含 prompt）
原则 2: 复杂任务 → 拆分为子任务 → 每个子任务可在一个上下文中独立完成
原则 3: 子任务间传结果摘要（记忆），不传过程（session 原始对话）
```

这不是优化建议，而是**核心设计约束**。违反它会导致上下文污染和状态感知失败。

---

## 核心问题：单 Session 架构

当前每个 Agent 只有一个 `agent:{id}:main` session，**任务执行和系统通信共用同一个通道**。这个设计同时违反了上述三个原则：

```
agent:{id}:main（唯一 session）
  ├── 接收 chief 指令      ← 需要及时响应
  ├── 执行任务（20+ 分钟） ← 长时间阻塞
  ├── 响应状态查询          ← 被任务执行阻塞，无法回复
  └── 累积所有任务的对话    ← 上下文无限膨胀，多任务混合
```

**同一个架构缺陷的两面：**

| 维度 | 表现 | 违反的原则 |
|------|------|-----------|
| 状态感知 | 系统只能靠 idle 时间猜测 agent 是否在忙 | session 内消息串行，无法在任务执行期间查询 |
| 上下文管理 | 多任务的对话混在同一 session 中 | 任务没有独立上下文，对话无限累积 |
| 任务粒度 | 复杂任务塞进单个 session，上下文超限后 compact 丢失信息 | 没有拆分为可独立完成的子任务 |

---

## 现状分析

### 状态感知：盲猜导致竞态

系统依赖 idle 时间判断 agent 状态：

```
idleMins >= 18 → 猜测 agent 已完成 → 自动转 review
idleMins >= 30 → 猜测 agent 已消失 → 自动转 failed
```

Agent 可能正在忙碌（LLM 推理、文件读写），只是还没回消息。系统无法区分"在忙"和"卡死"。

**竞态场景：**

```
T+0min    任务开始                              status = in_progress
T+20min   Cycle: agent 空闲 20m（其实还在忙）
          ├─ 系统猜测已完成 → in_progress → review
          └─ 质量门启动 → 失败 → review → rework
T+30min   Cycle: agent 空闲 30m
          └─ rework → failed  ← Agent 完全没有 rework 的机会
```

**为什么不能主动查询？** OpenClaw 的 session 内消息是**串行排队**的。如果 agent 正在处理任务（消息 A），发送状态查询（消息 B）会排在 A 后面等待。等 A 处理完，agent 已经空闲了，查询毫无意义。

### 上下文管理：多任务共享 + 复杂任务不拆分

所有任务的对话累积在同一个 session 中：

```
Task A 的对话（10K tokens）: 需求分析
+ Task B 的对话（8K tokens）: 竞品调研
+ Task C 的对话（12K tokens）: 撰写方案文档
= 30K tokens 的混合上下文
```

- **上下文污染** — Task A 的分析思路干扰 Task C 的方案撰写
- **Token 浪费** — 每次 LLM 调用携带所有历史任务的对话
- **Compact 无差别** — 压缩时可能丢弃当前任务的关键上下文，保留无关任务的
- **不可预测** — 相同任务在不同上下文积累状态下产出不同

同时，复杂任务没有拆分机制。当一个任务（如"完成一整套系统设计方案"）塞进单个 session：
- 上下文超限 → compact → 丢失前面阶段的细节 → 后续阶段质量崩塌
- 没有独立的子任务质量门 → 整体质量无法逐步验证
- 任务粒度太大 → 一旦失败只能整体 rework，浪费已完成的工作

### 两面问题的交叉放大

```
场景：Agent 正在执行第5个子任务（session 已累积 4 个子任务的对话 = 40K tokens）

1. Session 过大 → compact 压缩 → 当前任务的指令被压缩丢失
2. Agent 因 compact 后上下文混乱而卡住 → idle 时间超过 18 分钟
3. 系统猜测 agent 已完成 → review → 质量门失败（因为产出不完整）
4. rework → 但 session 里还带着 5 个任务的对话残留 + compact 的损坏上下文
5. rework 又超时 → failed

状态感知失败 + 上下文污染 = 复合故障
```

---

## 方案：Chat + Worker 双 Session（利用 OpenClaw 原生能力）

### 关键发现

OpenClaw 已内置 **`sessions_spawn` 子 Agent 机制**：
- 不同 sessionKey 路由到**不同 command lane**，消息处理完全并行
- 子 session 用 `mode="run"` 一次性执行，完成后自动销毁
- 完成后通过 **auto-announce** 主动推送结果给父 session
- 父 session 不阻塞，始终可响应

### 架构设计

```
┌─ Chat Session（父，持久，轻量）─────────────────────────────┐
│ Session Key: agent:{id}:main                                  │
│ Command Lane: session:agent:{id}:main                         │
│                                                                │
│ 职责：                                                         │
│   - 接收 chief 指令                                            │
│   - 响应系统状态查询（秒级回复，不被 worker 阻塞）             │
│   - 调用 sessions_spawn 委托实际工作                           │
│   - 接收 auto-announce 完成通知                                │
│                                                                │
│ 上下文：只有调度对话（极轻量，永远不需要 compact）              │
│                                                                │
│  收到任务 → sessions_spawn({                                   │
│    task: "完整自包含的任务 prompt...",                          │
│    mode: "run",                                                │
│    agentId: "{self}",                                          │
│    runTimeoutSeconds: 1200                                     │
│  })                                                            │
│  → 立刻返回 { childSessionKey, runId }                         │
│  → Chat session 继续响应 ← 关键！                              │
│                                                                │
│  系统查询 "你在忙吗？"                                         │
│  → 立刻回复: "working, SUBAGENT: run-456"  ← 不被 worker 阻塞 │
│                                                                │
│  子 Agent 完成 → auto-announce 推送:                           │
│  "[Subagent completed] Result: ..."                            │
│  → 汇报 completed                                             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
         ↓ spawn (非阻塞)                 ↑ auto-announce (推送)
┌─ Worker Session（子，临时，独立）──────────────────────────────┐
│ Session Key: agent:{id}:subagent:{uuid}                        │
│ Command Lane: session:agent:{id}:subagent:{uuid}（独立！）     │
│                                                                │
│ 特性：                                                         │
│   - 干净上下文（新建 session，无历史对话）← 解决上下文污染     │
│   - 独立 lane（不阻塞 chat session）← 解决状态感知             │
│   - mode="run"，完成后自动销毁 ← 无需手动 clear/compact        │
│   - 上下文 = spawn 时传入的 task prompt（完全自包含）           │
│                                                                │
│ 执行：LLM 推理 + 工具调用 + 文件读写（可能 20+ 分钟）         │
│ 完成：输出结果 → auto-announce → session 自动销毁              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**一个架构改动同时解决所有问题：**
- Chat session 不被阻塞 → 可以实时查询状态 → **解决状态感知**
- Worker session 每次新建 → 天然干净上下文 → **解决上下文污染**
- 每个任务独立 worker → 自包含 prompt → **保证独立上下文**
- 复杂任务拆分为子任务 → 每个子任务一个 worker → **保证任务粒度匹配上下文容量**

### OpenClaw sessions_spawn 机制

**Spawn（非阻塞）：**

```javascript
sessions_spawn({
  task: "完整的任务描述...",    // 传给子 agent 的 prompt
  mode: "run",                  // 一次性执行，完成后删除子 session
  agentId: "{agentId}",          // 目标 agent（可以是自己）
  runTimeoutSeconds: 1200,      // 超时 20 分钟
})

// 立刻返回
→ { status: "accepted", childSessionKey: "agent:{agentId}:subagent:abc123", runId: "run-456" }
```

**Auto-Announce（推送）：**

```
子 Agent 完成 → 系统 agent.wait 等待 runId 结束
→ 读取子 Agent 最终输出
→ 构建完成消息: { type: "task_completion", source: "subagent", result: "..." }
→ 推送到父 session（deliver: false，内部消息）
→ 父 session 收到: "[Subagent completed] 任务产出..."
```

**并行保证：** 不同 sessionKey 路由到不同 command lane。Session store 的写锁是共享的，但写操作极快（毫秒级），消息处理本身完全并行。

---

### 任务全生命周期

```
┌─────────────────────────────────────────────────────────────┐
│ 单个任务的完整周期                                           │
│                                                              │
│  Chief 分配任务                                              │
│    ↓                                                         │
│  Chat session 收到指令                                       │
│    ↓                                                         │
│  buildTaskPrompt() → 构建完整自包含 prompt                   │
│    包含: 身份 + 项目背景 + 记忆 + 任务描述 + 质量标准        │
│    ↓                                                         │
│  sessions_spawn({ task: prompt, mode: "run" })               │
│    ↓                                                         │
│  Worker session 执行（独立 lane，干净上下文）                 │
│    ↓ 期间 chat session 可响应状态查询                        │
│    ↓                                                         │
│  Worker 完成 → auto-announce → chat session 收到结果         │
│    ↓                                                         │
│  extractTaskMemory() → 保存到 agents/{id}/memory/tasks/      │
│    ↓                                                         │
│  Worker session 自动销毁（mode="run"）                        │
│    ↓                                                         │
│  Chat session 汇报 completed → 质量门 → pipeline 推进        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Prompt 驱动的上下文

每个 worker session 从零开始，所有上下文必须通过 spawn 的 `task` 参数完整提供。这要求 **prompt 自包含**：

```javascript
function buildTaskPrompt(agentId, task, parentTask, siblingMemories) {
  let prompt = ''

  // ── 1. Agent 身份与记忆 ──
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

  // ── 7. 质量标准（让 agent 知道会被怎样评判） ──
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

**Prompt 自包含的收益：**
- 可预测（相同 prompt → 相同行为，不受历史残留影响）
- 可调试（直接查看 prompt 就知道 agent 看到什么）
- 无 token 浪费（只发送当前任务需要的信息）
- 无需 compact（单任务不会超 token 限制）

### 复杂任务拆分（核心约束）

**如果一个任务无法在单个上下文中独立完成，就必须拆分。** 这是设计约束，不是可选优化。

#### 为什么必须拆分

Worker session 是干净的、独立的。一个 worker 执行完就销毁。如果任务太大（比如"完成整个系统的端到端测试"），单个 worker 的上下文会爆掉或产出质量下降。正确做法是拆成多个可独立完成的子任务。

#### 拆分标准

```
任务可以在一个上下文中独立完成吗？
  ├── 是 → 直接 spawn 一个 worker 执行
  └── 否 → 拆分为子任务，每个子任务满足：
           1. 有清晰的输入和输出
           2. prompt（身份 + 背景 + 记忆 + 描述）不超过上下文的 30%
           3. 执行过程中不需要其他子任务的实时上下文
           4. 可以独立通过质量门
```

#### 拆分示例

```
❌ 错误：一个任务 "完成整个产品的技术方案"
   → 单个 worker 上下文不可能容纳所有模块的设计过程
   → 后面的模块设计会丢失前面模块的关键决策

✓ 正确：拆分为独立子任务
   Task: "完成技术方案" (父任务，不直接执行)
   ├── SubTask 1: "需求分析与架构选型"
   ├── SubTask 2: "模块 A 详细设计"  ← prompt 注入子任务1的记忆摘要
   ├── SubTask 3: "模块 B 详细设计"  ← prompt 注入子任务1+2的记忆摘要
   └── ...
   每个子任务都能在一个干净上下文中独立完成
```

#### 子任务串行执行

每个子任务独立 spawn worker，通过记忆摘要传递上下文：

```
SubTask 1（需求分析）:
  spawn({ task: prompt_1, mode: "run" })
  prompt_1 = 身份 + 项目背景 + "分析需求，确定架构选型..."
  → worker 完成 → extractTaskMemory() → worker 销毁

SubTask 2（模块 A 设计）:
  spawn({ task: prompt_2, mode: "run" })
  prompt_2 = 身份 + 项目背景 + 子任务1记忆摘要 + "设计模块 A 的详细方案..."
  → worker 完成 → extractTaskMemory() → worker 销毁

SubTask 3（模块 B 设计）:
  spawn({ task: prompt_3, mode: "run" })
  prompt_3 = 身份 + 项目背景 + 子任务1+2记忆摘要 + "设计模块 B 的详细方案..."
  → worker 完成 → extractTaskMemory() → worker 销毁
```

**每个 worker 都是干净上下文。子任务2 不需要知道子任务1 是怎么执行的（过程），只需要知道产出了什么（结果摘要）。**

#### 记忆摘要 vs 原始对话

```
❌ 把前序子任务的完整对话塞进下一个子任务的 prompt
   → 上下文迅速膨胀，本质上回到了"多任务共享上下文"的老路

✓ 提取结构化记忆摘要（500字以内），只传递关键信息
   → 子任务1摘要: "选型 PostgreSQL + Redis，核心表结构为..., 关键约束: ..."
   → 精炼、可控、不会污染当前子任务的上下文
```

### 记忆提取与存储

每个 worker 完成后提取结构化记忆：

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

  // 存储: agents/{agentId}/memory/tasks/{taskId}.md
  const memoryPath = path.join(AGENTS_DIR, agentId, 'memory', 'tasks', `${task.id}.md`)
  fs.mkdirSync(path.dirname(memoryPath), { recursive: true })
  fs.writeFileSync(memoryPath, formatTaskMemory(memory))
  return memory
}
```

### 状态查询与任务流转

```javascript
// department-loop.cjs — 替代 idle 猜测

async function checkAgentStatus(agentId, sessionKey) {
  // 直接问 chat session — 不被 worker 阻塞，秒级回复
  const result = await sendToAgent(agentId, sessionKey,
    '[系统查询] 当前任务状态？', 30000)
  return parseStatusResponse(result.text)
}

async function autoTransitionTasks(deptId, config, chiefResponseText) {
  // ... 遍历任务 ...

  if (task.status === 'in_progress' || task.status === 'rework') {
    if (idleMins >= IDLE_CHECK_MINS) {  // 18 分钟触发查询（不是直接转换）

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
        // 不管是 in_progress 还是 rework，worker 在跑就不打扰

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

### Agent 指令配置

`config/base-rules.md` 的 `## AGENTS_RULES` 增加：

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

---

## 改造后的完整时间线

```
T+0min    Chief 分配任务给 agent-A
          Chat session 收到指令 → sessions_spawn({ task: prompt, mode: "run" })
          Worker 子 agent 开始执行（独立 lane）
          Chat session 立刻空闲

T+10min   Cycle #1: 查询 agent-A chat session
          → "STATUS: working, SUBAGENT: run-456"
          → 不干预 ✓

T+20min   Cycle #2: 查询 agent-A chat session
          → "STATUS: working, SUBAGENT: run-456"
          → 不干预 ✓（worker 还在跑）

T+25min   Worker 完成 → auto-announce 推送到 chat session
          → agent-A 收到: "[Subagent completed] 任务产出..."
          → extractTaskMemory() → 保存记忆
          → worker session 自动销毁

T+30min   Cycle #3: 查询 agent-A chat session
          → "STATUS: completed"
          → in_progress → review → 质量门 ✓

T+33min   质量门失败 → rework
          Chief 重新分配 rework 任务
          → sessions_spawn 新的 worker 执行 rework（干净上下文 + rework 记忆注入）

T+40min   Cycle #4: 查询 agent-A chat session
          → "STATUS: working, SUBAGENT: run-789"
          → 不干预 ✓（在 rework 中，不会被盲猜 failed）

T+55min   Worker 完成 rework → auto-announce

T+60min   Cycle #5: 查询
          → "STATUS: completed"
          → rework → review → 质量门通过 → completed ✓
          → pipeline 推进下一阶段
```

**对比当前行为：T+30min rework 就被判定 failed，agent 没有任何 rework 的机会。**

---

## 改造前后对比

| 维度 | 当前（单 session） | Chat + Worker 双 session |
|------|-------------------|--------------------------|
| **状态感知** | idle 时间盲猜 | 直接问 chat session（秒级回复） |
| **中断在忙 agent** | 会（18分钟强制 review） | 不会（worker 在独立 lane） |
| **Rework 竞态** | rework 被 stale 规则覆盖 | 查询到 working 就不干预 |
| **上下文隔离** | 多任务共享 session | 每个任务独立 worker session（干净上下文） |
| **复杂任务** | 整个塞进一个 session，compact 丢信息 | 拆分为子任务，每个 worker 独立完成 |
| **Token 浪费** | 携带所有历史对话 | worker 只有当前任务 prompt |
| **上下文可预测性** | 依赖 session 历史残留 | 完全由 prompt 决定（可复现、可调试） |
| **结果获取** | 被动等 idle | auto-announce 主动推送 |
| **OpenClaw 支持** | — | 原生 sessions_spawn + auto-announce |

---

## 实施计划

### 阶段 1：Chat + Worker 双 Session（核心能力）

- Agent AGENTS.md 增加 sessions_spawn 使用规范
- department-loop 改为 checkAgentStatus 替代 idle 猜测
- 实现 buildTaskPrompt 构建自包含 prompt
- 实现 extractTaskMemory 记忆提取与存储
- 启用 openclaw.json subagents 配置
- 移除 session compact / stale 定时器逻辑

### 阶段 2：子任务拆分 + 串行调度（高级能力）

- Chief 识别复杂任务 → 拆分为子任务列表
- 每个子任务独立 spawn worker
- 前序子任务记忆摘要注入后续子任务 prompt
- 父任务完成后汇总所有子任务记忆

### 改动文件清单

| 文件 | 改动 |
|------|------|
| `scripts/autopilot/department-loop.cjs` | 状态查询 + spawn 调度，移除 idle 猜测 |
| `scripts/autopilot/constants.cjs` | 新增 STATUS_QUERY_TIMEOUT_MS / WORKER_TIMEOUT_SECONDS |
| `core/agent/memory.cjs` | 新增 extractTaskMemory / loadRelevantTaskMemories |
| `config/base-rules.md` | 增加 sessions_spawn 使用规范 |
| `config/openclaw.json` | 启用 subagents 配置 |
| `scripts/autopilot/dept-directive.cjs` | 新增 buildTaskPrompt |

---

## 附录：关键常量

| 常量 | 当前值 | 建议值 | 说明 |
|------|--------|--------|------|
| `IDLE_CHECK_MINS` | 18 | 18 | 触发 chat session 状态查询的阈值 |
| `STATUS_QUERY_TIMEOUT_MS` | (无) | 30000 | Chat session 状态查询超时 |
| `MAX_NO_RESPONSE_COUNT` | (无) | 2 | Chat session 连续无响应 → failed |
| `MAX_TASK_MEMORIES` | (无) | 5 | Prompt 注入记忆条数上限 |
| `MEMORY_MAX_CHARS` | (无) | 3000 | Prompt 注入记忆字符上限 |
| subagents.maxConcurrent | 8 | 1 | 每个 agent 同时 1 个 worker（串行，完成后才 spawn 下一个） |
| subagents.maxSpawnDepth | 3 | 2 | 子 agent 嵌套深度 |

## 附录：OpenClaw 子 Agent 源码

| 文件 | 职责 |
|------|------|
| `openclaw/src/agents/subagent-spawn.ts` | Spawn 入口，创建子 session |
| `openclaw/src/agents/subagent-announce.ts` | Auto-announce，完成推送 |
| `openclaw/src/agents/subagent-registry.ts` | 活跃子 agent 注册表 |
| `openclaw/src/agents/tools/sessions-spawn-tool.ts` | sessions_spawn 工具定义 |
| `openclaw/src/agents/pi-embedded-runner/lanes.ts` | Command lane 路由 |
| `openclaw/src/config/sessions/store.ts` | Session 存储（写锁共享，消息处理并行） |
