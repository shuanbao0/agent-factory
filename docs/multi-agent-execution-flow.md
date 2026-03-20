# Agent Factory 多 Agent 执行流程详解

## 目录

- [架构总览](#架构总览)
- [一、启动阶段](#一启动阶段)
- [二、CEO 协调周期](#二ceo-协调周期30-分钟)
- [三、部门执行周期](#三部门执行周期10-分钟部门)
- [四、质量门三阶段评审](#四质量门三阶段评审)
- [五、Worker 任务执行](#五worker-任务执行)
- [六、通信基础设施](#六通信基础设施)
- [七、预算与成本追踪](#七预算与成本追踪)
- [八、记忆管理系统](#八记忆管理系统)
- [九、容错与韧性设计](#九容错与韧性设计)
- [十、关键时间参数](#十关键时间参数)
- [附录：状态机与数据流](#附录状态机与数据流)

---

## 架构总览

Agent Factory 的多 Agent 协作采用**两层调度架构**：

```
┌──────────────────────────────────────────────────────────────────┐
│                    CEO 协调层 (30min 周期)                        │
│        全局策略 → 资源分配 → 项目阶段推进 → 触发部门循环            │
└────────────────────────────┬─────────────────────────────────────┘
                             │ 触发
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  部门A 执行层  │    │  部门B 执行层  │    │  部门C 执行层  │
│  (10min 周期)  │    │  (10min 周期)  │    │  (10min 周期)  │
│  Chief→分发    │    │  Chief→分发    │    │  Chief→分发    │
│  →Worker执行   │    │  →Worker执行   │    │  →Worker执行   │
│  →质量门评审   │    │  →质量门评审   │    │  →质量门评审   │
└──────────────┘    └──────────────┘    └──────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ▼
              ┌─────────────────────────────┐
              │   OpenClaw Gateway (19100)   │
              │   WebSocket · LLM 路由引擎   │
              └──────────┬──────────────────┘
                         ▼
              Anthropic / MiniMax / OpenAI / DeepSeek
```

**核心角色分工：**

| 角色 | 职责 | 周期 |
|------|------|------|
| CEO Agent | 全局战略、跨部门协调、项目阶段推进 | 30min |
| Department Chief | 部门任务分发、团队调度、进展汇报 | 10min |
| Worker Agent | 具体任务执行、产出交付 | 事件驱动 |
| Quality Reviewer | 同行评审（由其他 Agent 兼任） | 按需 |

---

## 一、启动阶段

### 1.1 进程启动

```
agent-factory start
  → bin/agent-factory.mjs
    → spawn scripts/autopilot.cjs (detached 后台进程)
      → orchestrator.startAll()
```

### 1.2 初始化序列

`orchestrator.startAll()` 按顺序完成 5 个阶段的初始化：

```
startAll()
  │
  ├─ Phase 1: 清理 + 事件系统
  │   ├─ killExistingAutopilot()           // 终止孤儿进程（PID 追踪）
  │   ├─ eventBus = new EventBus({ persist: true })
  │   │   └─ 启用 JSONL 审计 → config/autopilot-events.jsonl
  │   └─ registerAll(eventBus)
  │       └─ 注册 Reactors: cost-alert（成本告警）、cycle-monitor（周期追踪）
  │
  ├─ Phase 2: 调度器 + 质量门
  │   ├─ QualityOrchestrator = new QualityOrchestrator({
  │   │     sendFn: sendToAgent,            // DI: WebSocket 通信
  │   │     readAgentActivity,              // DI: Agent 活跃度
  │   │     loadDeptConfig                  // DI: 部门配置
  │   │   })
  │   └─ Scheduler 事件监听:
  │       ├─ task.status_changed → if to='review': scheduleQualityGate()
  │       └─ quality.gate_completed → scheduleDeptCycle()
  │
  ├─ Phase 3: 自适应定时器
  │   └─ AdaptiveTimer: getDeptActivityLevel() 动态调节下次周期间隔（±20%）
  │
  ├─ Phase 4: 信号监听
  │   └─ SignalWatcher: SIGINT/SIGTERM → 优雅关闭（断连、状态持久化）
  │
  └─ Phase 5: 状态持久化
      └─ 写入 config/autopilot-state.json:
          { pid: <process.pid>, status: 'running', mode: 'all', cycleCount: 0 }
```

### 1.3 启动后的持续调度

初始化完成后进入主循环，调度器同时管理：
- **CEO 定时循环**：每 30min 执行一次 `runCeoCycleForAll()`
- **部门定时循环**：每 10min/部门 执行一次 `runDepartmentCycle(deptId)`
- **事件驱动调度**：任务状态变化即时触发质量门或部门循环（30s 防抖）

---

## 二、CEO 协调周期（30 分钟）

### 2.1 流程概览

```
runCeoCycleForAll('coordination')
  │
  ├─ Step 1: 构建记忆上下文
  ├─ Step 2: 构建 CEO 指令
  ├─ Step 3: 发送到 CEO Agent（WebSocket）
  ├─ Step 4: 解析响应 → 同步项目 → 压缩记忆
  ├─ Step 5: 全局任务扫描（清理停滞任务）
  └─ Step 6: 触发各部门循环
```

### 2.2 Step 1 — 构建记忆上下文

```javascript
buildMemoryContext('ceo', 'coordination')
// 读取 agents/ceo/memory/ 目录:
// → SUMMARY.md          (≤2000 字符)
// → decisions/*.md      (最近 7 天, ≤3000 字符)
// → lessons/what-worked.md (仅 strategy 周期)
// 返回: { summary, recentDecisions, lessonsLearned, departmentStatus }
```

### 2.3 Step 2 — 构建 CEO 指令

CEO 指令（Directive）是一段精心组装的 Prompt，包含所有 CEO 做决策所需的上下文：

```
[Autopilot Cycle #N]

你是 CEO，这是公司第 N 轮自主运营循环。

## 公司使命
[config/mission.md 内容]

## 你的记忆摘要
[agents/ceo/memory/SUMMARY.md — 上轮决策概要]

## 近期重要决策
[memory/decisions/YYYY-MM-DD.md — 最近7天的决策记录]

## 各部门最新状态
[各部门 Chief 上轮响应中的状态汇报]

## 📊 部门报告
[readAllDepartmentReports() — 结构化部门报告]

## 🚨 需要CEO决策的升级事项
[来自各部门 Chief 的升级事项]

## 📊 项目实时数据（系统数据，非记忆）
### [项目名称]
- 状态: [status]
- 进度: [completed]/[total] 任务完成
- ⚡ 进行中: [Agent 列表 + idle 时间]
- 🔲 待办: [待分配任务]

## 📋 独立任务
[用户通过 Dashboard 手动创建的任务]

## 👥 团队活动状态
[Agent idle 时间 + Token 用量，按活跃度排序]

## 本轮任务
1. 读取上方实时数据，找到阻塞点
2. 立即行动：通过 subagent 调用团队成员
3. 更新 MEMORY.md + config/mission.md
```

### 2.4 Step 3 — WebSocket 通信

```
sendToCeo(directive)
  └─ GatewayConnectionPool.sendToAgent('ceo', 'agent:ceo:autopilot', directive, 300s)
      ├─ 确保 WebSocket 已连接 (_ensureConnected)
      ├─ 发送 JSON 帧: { type: 'req', method: 'chat.send', params: { sessionKey, message } }
      ├─ 流式接收: delta → delta → ... → final
      └─ 空响应自动重试: session reset + 注入记忆上下文 → 重试一次
```

### 2.5 Step 4 — 响应处理

```
if result.ok:
  ├─ syncProjects(result.text)
  │   └─ 解析 CEO 响应中的阶段推进信号: "【项目: proj-1, 阶段推进】"
  │      → 更新 project.currentPhase
  │
  ├─ compressMemory('ceo', result.text)
  │   └─ 提取关键决策 → 写入 agents/ceo/memory/decisions/YYYY-MM-DD.md
  │   └─ 最多保留 5 条
  │
  ├─ trackTokenUsage → eventBus.fire('cost.tracked')
  │
  └─ completeCycleTask('ceo', taskId, result)
      └─ 标记本轮 cycle 任务为 completed
```

### 2.6 Step 5 — 全局任务扫描

在触发部门循环前，先清理全局停滞任务：

```
sweepStaleTasks()
  └─ 遍历所有项目 + 独立任务:
      ├─ assigned + idle ≥ 30min     → failed     (分配后无动作)
      ├─ in_progress + idle ≥ 30min
      │   + progress < 50%           → failed     (停滞且进度不足)
      ├─ in_progress + idle ≥ 18min  → review     (推定完成)
      └─ review + idle ≥ 18min       → completed  (自动批准)

每次状态变更 → eventBus.fire('task.status_changed')
  → Scheduler 可能立即触发质量门
```

---

## 三、部门执行周期（10 分钟/部门）

部门执行周期是**任务实际分发和执行**的核心，流程最为复杂。

### 3.1 完整流程图

```
runDepartmentCycle(deptId)
  │
  ├─ 1. 并发守卫 ──── state.status === 'cycling' ? → 跳过
  │
  ├─ 2. 预算检查
  │     checkBudget(deptId)
  │     ├─ ratio ≥ 1.0 → ❌ 阻断, emit budget.dept_blocked
  │     ├─ ratio ≥ 0.8 → ⚠️ 告警, emit budget.dept_warning
  │     └─ ratio < 0.8 → ✅ 放行
  │
  ├─ 3. 预算预扣
  │     estimateTokensPerCycle() → reserveBudget()
  │     → projected = tokensUsedToday + estimated
  │     → 超限则阻断
  │
  ├─ 4. 双Session状态查询 (可选)
  │     对每个有进行中任务的 Agent:
  │     sendToAgent(agent, 'agent:X:status', "当前任务状态？", 30s)
  │     → 🔵工作中 | ✅已完成 | 🟢空闲 | ⚠️无响应
  │
  ├─ 5. 预发送自动转换
  │     autoTransitionTasks(deptId, { idleOnly: true, statusQueryResults })
  │     ├─ assigned + 活跃(<5min idle) → in_progress
  │     ├─ assigned + idle ≥ 30min     → failed
  │     ├─ in_progress + working       → 不干预
  │     ├─ in_progress + completed/idle → review
  │     └─ in_progress + 多次无响应     → failed
  │
  ├─ 6. Session 健康检查
  │     ensureSessionHealth(head, sessionKey, deptId)
  │     ├─ inputTokens > 80k → killSession (硬重置)
  │     └─ inputTokens > 50k → compactSession (压缩上下文)
  │     └─ 冷却期 120s 防止频繁重置
  │
  ├─ 7. 构建部门指令
  │     buildDepartmentDirective(deptId, config, state, transitions, statusResults)
  │     → [详见 3.2]
  │
  ├─ 8. 发送给 Chief
  │     sendToAgent(chief, 'agent:chief:dept-autopilot', directive, 300s)
  │
  ├─ 9. 解析 Chief 响应
  │     ├─ parseTaskAssignments()  → 提取 [任务分配]
  │     │   → createWorkTask(agentId, summary, deptId)
  │     │   → 立即标记 in_progress
  │     │   → 跳过 working 状态的 Agent
  │     │
  │     └─ parseTaskCompletions() → 提取 [任务完成]
  │         → in_progress/rework → review
  │     注: assignment 可含 [project: xxx]，指定任务所属项目
  │
  ├─ 10. 后发送自动转换 + 质量门
  │      收集 review 任务 → Promise.allSettled(并行质量门)
  │
  ├─ 11. 成本核算
  │      trackTokenUsage(deptId, usage)
  │      reconcileBudget(deptId, reserved, actual) // 预扣修正
  │
  └─ 12. 记忆压缩
         compressMemoryByRole(chief, response, 'leader')
```

### 3.2 部门指令结构

Chief 接收的指令包含所有调度决策所需的上下文：

```
[Department Loop: {deptId} Cycle #{cycleNum}]

你是 {chief-agent-id}，{dept-name} 部门主管。

## 你的记忆
[buildMemoryContext(chief, 'department').summary]

## 部门使命
### 通用准则
[base mission]
### 本部门使命
[config/departments/{deptId}/mission.md]

## CEO 指令
[readCeoDirectives(deptId) — CEO 对本部门的特别指示]

## 部门项目
[buildDeptProjects(deptId) — 列出部门下所有项目:
  - novel/chapter-1 — 状态: in-progress, 任务: 2进行/5总
  - novel/chapter-2 — 状态: planning, 任务: 0进行/2总]

## 部门预算
今日已用: {tokensUsedToday} / {dailyTokenLimit} tokens

## ⚡ 本轮任务自动变化（系统检测）
[系统自动转换的任务列表:
  - "task-1: idle 22min → in_progress → review (等待质量门)"
  - "task-2: idle 35min → in_progress → failed ⚠️"]

## 团队状态
[buildTeamStatus() — 使用双Session结果或idle时间降级:
  - 🔵 agent-1: 工作中 (worker session 活跃)
  - ✅ agent-2: 已完成 (报告任务完成)
  - 🟢 agent-3: 空闲 (可分配任务)
  - ⚠️ agent-4: 无响应 (状态查询超时)]

## 部门任务
[buildDeptTasks(deptId) — 按状态分组:
  - 🔴 进行中: 3 个任务 (含 Agent + idle 时间)
  - 🟡 待确认: 1 个任务 (review 中)
  - 🔲 待办:  2 个任务 (pending, 可分配)
  - ✅ 已完成: 5 个任务]

## 部门 KPI
[目标指标: 成功率、平均延迟、产出质量]

## 行动要求
### ⛔ 分配决策原则（按优先级）
1. 审视全局 — 待办 vs 进行中 vs 完成
2. 判断可分配性 — 🔵工作中→不分配, 有进行中→不分配
3. 匹配任务 — 优先 pending, 匹配 Agent 职责

### ⚠️ 执行分配
peer-send 命令: node skills/peer-status/scripts/peer-send.mjs --from {chief} --to <agent-id> --message "..."

### 📋 任务追踪
API 创建: curl -X POST http://127.0.0.1:3100/api/agent-tasks -d '{"agent":...}'

## 输出格式要求
[任务分配]
- <agent-id>: <summary> [project: <项目ID>]

[任务完成]
- <task-id>: <status>

[进展汇报]
- <key progress>

[阻塞项]
- <if any>
```

### 3.3 Fallback Dispatch（降级分发）

当 Chief 连续 3 次产生无效响应（< 50 字符）时触发降级机制：

```
fallbackDispatch(deptId, config)
  ├─ 筛选空闲 Worker:
  │   ├─ 无 in_progress 任务
  │   ├─ idle ≥ 5min 或无活动记录
  │   └─ 排除 Chief 自身
  │
  ├─ 对每个空闲 Agent:
  │   ├─ 有 pending 任务 → 直接 peer-send 分发
  │   └─ 无任务 → 创建空闲派发任务 → peer-send
  │
  └─ Session 重置（清理 Chief 膨胀的上下文）
```

---

## 四、质量门三阶段评审

### 4.1 触发时机

任务状态变为 `review` 时，Scheduler 监听到 `task.status_changed` 事件，延迟 5s 后触发质量门。

**设计要点：** 质量门的三个阶段**不是内联阻塞**的——每个阶段在不同的 Autopilot 周期中执行，避免单次周期耗时过长。

### 4.2 三阶段流程

```
qualityGate.process(deptId, task)
  │
  ├─ 阶段 1: 自检 (Self-Check) ─── 由任务负责人执行
  │   │
  │   ├─ 硬校验（不经 LLM）:
  │   │   ├─ task.output 文件是否存在
  │   │   ├─ 内容 ≥ 500 字符
  │   │   └─ 无未渲染模板 ${...}
  │   │
  │   ├─ LLM 自检:
  │   │   sendFn(assignee, 'agent:{id}:quality-check:{taskId}',
  │   │     "请对你的产出评分 0-100。格式: SCORE: <n>, PASSED: <bool>, ISSUES: ...",
  │   │     60s timeout)
  │   │
  │   └─ 判定: score ≥ strategy.minPassingScore → 通过
  │      不通过 → 返回 { passed: false, reason: "Self-check failed" }
  │
  ├─ 阶段 2: 同行评审 (Peer Review) ─── 由其他 Agent 执行
  │   │
  │   ├─ 选择评审人:
  │   │   selectReviewer(deptId, task, config)
  │   │   优先级: preferredReviewers → tag 匹配 → 最空闲的 Agent
  │   │   排除: 任务负责人 + Chief
  │   │
  │   ├─ LLM 评审:
  │   │   sendFn(reviewer, 'agent:{id}:peer-review:{taskId}',
  │   │     "Review this task output. SCORE: <n>, PASSED: <bool>, COMMENTS: ...",
  │   │     60s timeout)
  │   │
  │   └─ 判定: score ≥ threshold → 通过
  │      不通过 → 返回 { passed: false, reason: peerComments }
  │
  └─ 阶段 3: 主管审批 (Head Approval) ─── 由 Chief 执行
      │
      ├─ LLM 审批:
      │   sendFn(head, 'agent:{id}:approval:{taskId}',
      │     "包含: 自检分数={selfScore}, 评审分数={peerScore}, 评审意见={comments}
      │      作为主管，请回复 APPROVED 或 REJECTED",
      │     60s timeout)
      │
      └─ 判定:
         ├─ "APPROVED" → review → completed ✅
         ├─ "REJECTED" + reworkCount < 3 → review → rework
         │   └─ peer-send 反馈给负责人
         └─ "REJECTED" + reworkCount ≥ 3 → review → failed ❌

清理: 所有临时 Session (quality-check / peer-review / approval) fire-and-forget killSession
```

### 4.3 返工循环

```
rework 流程:
  1. 质量门判定 REJECTED → task.status = 'rework', reworkCount++
  2. 负责人收到反馈 (peer-send): 评审意见 + 上次自检分数
  3. Chief 下轮周期通过 peer-send 发送返工指令（含评审反馈）
  4. Agent 在 :main 收到 → spawn worker 子会话修改产出
  5. Agent 调用 API 标记 completed → 系统自动转换为 review → 重新进入质量门
  6. 最多 3 次返工，之后强制 failed
```

---

## 五、Worker 任务执行（双 Session 架构）

### 5.1 核心机制：Agent 自主 Spawn Worker

Worker Session **不是由 Autopilot 系统创建的**，而是 Agent 自己遵循 `base-rules.md` 中的「任务执行协议」，在 `:main` session 中通过 `sessions_spawn` 创建子会话执行任务。

```
base-rules.md 第 478-488 行：

### 任务执行协议（Worker Session）

当你收到包含 [Task: task-xxx] 的工作指令时：
1. 使用 sessions_spawn 创建子会话执行（mode: "run", agentId: 你自己的ID）
2. 主会话保持响应，可回答系统状态查询
3. 收到 auto-announce 完成通知后，汇报完成

当你收到 [系统查询] 消息时立刻回复当前状态：
- STATUS: working, SUBAGENT: {runId} — 正在执行任务
- STATUS: completed — 任务已完成
- STATUS: idle — 当前空闲
```

### 5.2 完整任务执行流程

```
Chief peer-send --to agent-id --message "[Task: task-xxx] 具体指令..."
  │
  ▼
Agent :main session 收到任务指令
  │
  ├─ 1. 查询/确认任务: curl GET /api/agent-tasks?agent=MY_ID
  ├─ 2. 更新状态为进行中: curl PUT status=in_progress
  ├─ 3. sessions_spawn(mode: "run", agentId: 自己的ID)
  │     └─ Gateway 创建隔离的 worker 子会话
  │        ├─ 子会话继承 Agent 的 AGENTS.md / SOUL.md（身份 + 规则）
  │        ├─ 子会话无历史对话上下文（干净执行环境）
  │        └─ 子会话执行任务 → 产出写入 workspaces/{agentId}/
  │
  ├─ 4. :main session 保持响应
  │     └─ 收到 [系统查询] → 回复 "STATUS: working, SUBAGENT: {runId}"
  │
  ├─ 5. Worker 子会话完成 → auto-announce 通知 :main
  │
  ├─ 6. Agent 在 :main 中:
  │     ├─ 更新任务状态: curl PUT status=completed, output=产出路径
  │     └─ 附带自检评分: quality.selfCheck.score
  │
  └─ 7. Worker 子会话自然终结（Gateway mode:"run" 内置生命周期）
```

### 5.3 Chat Session vs Worker Session

| 维度 | Chat Session (`:main`) | Worker Session (`sessions_spawn`) |
|------|----------------------|----------------------------------|
| **创建者** | Gateway 自动（Agent 注册时） | Agent 自己（遵循 base-rules） |
| **生命周期** | 持久 — 跨多个周期存在 | 临时 — 任务完成即终结 |
| **上下文** | 累积对话历史 + 记忆 | 干净环境，仅继承 Agent 身份定义 |
| **用途** | 接收指令、响应状态查询、汇报完成 | 实际执行任务、写入产出 |
| **销毁方式** | 被动 — Token 超阈值时 compact/kill | 自动 — Gateway `mode:"run"` 结束即回收 |
| **系统可查询** | 是 — `queryAgentStatus` 查 `:main` | 否 — 外部无法直接查询 worker 子会话 |

### 5.4 为什么 Dual-Session 状态查询发到 `:main`

```
queryAgentStatus(agentId, `agent:${agentId}:main`, 30s)
  → 发送: "[系统查询] 当前任务状态？"
  → Agent :main 遵循 base-rules 立即回复:
     "STATUS: working, SUBAGENT: abc123"  ← worker 子会话正在执行
     "STATUS: completed"                  ← 任务已完成
     "STATUS: idle"                       ← 当前空闲
```

`:main` 始终保持响应能力，而 worker 子会话在 Gateway 内部运行、外部无法直接查询。这就是双 Session 设计的核心价值——**Chat 负责通信，Worker 负责执行，互不阻塞**。

### 5.5 任务上下文增强（`buildTaskContext`）

系统在创建任务时自动通过 `buildTaskContext()` 将补充上下文写入任务的 `description` 字段，确保 Worker 获得 Chief peer-send 消息之外的结构化信息：

```
department-loop.cjs createWorkTask 时:
  Chief 响应 → parseTaskAssignments → 提取 { agentId, summary }
  → buildTaskContext(agentId, summary, { deptId, deptConfig, taskType })
  → 生成 enriched description:
     ├─ Chief 原始 summary
     ├─ 质量标准（strategy.minPassingScore + reviewCriteria）
     ├─ 项目背景（部门使命摘要，≤500 字符）
     ├─ 返工反馈（如有：评审意见 + 上次自检分数）
     └─ 相关任务记忆（最近 5 个类似任务经验）
  → createWorkTask(agentId, summary, deptId, { description })
```

Agent 查询任务 API（base-rules 要求）时自动获得完整 description，传给 worker 子会话执行。

**设计要点：**
- `buildTaskContext` 只输出**补充上下文**（质量标准、记忆、返工反馈），不含 Agent 身份和执行要求（已在 AGENTS.md / base-rules 中）
- 容错设计：`buildTaskContext` 任何环节失败都 catch 静默跳过，降级为仅使用 Chief 原始 summary
- 完整版 `buildTaskPrompt()` 保留作为直接发送给 worker session 的自包含 prompt（当前未使用）

### 5.6 双目录隔离

| 目录 | 用途 | 内容 |
|------|------|------|
| `agents/{id}/` | 核心定义（只读语义） | AGENTS.md, SOUL.md, memory/, skills/ |
| `workspaces/{id}/` | 产出空间（读写） | 文档、代码、分析报告等一切产出 |

---

## 六、通信基础设施

### 6.1 WebSocket 连接池

```
┌─────────────────────────────────────────────────────────┐
│            GatewayConnectionPool                         │
│                                                          │
│  ┌─ 连接管理 ──────────────────────────────────────────┐ │
│  │  · 单连接复用（所有 Agent 共享一个 WebSocket）        │ │
│  │  · 惰性连接：首次请求时建立                          │ │
│  │  · 心跳保活：每 30s ping                             │ │
│  │  · Idle 超时：5min 无请求自动断开                    │ │
│  │  · 自动重连：指数退避 1s → 2s → 4s → ... → 30s max  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ 帧协议 ────────────────────────────────────────────┐ │
│  │  请求/响应 (操作):                                    │ │
│  │    → { type:"req", id:"uuid", method:"chat.send" }  │ │
│  │    ← { type:"res", id:"uuid", ok:true, payload }    │ │
│  │                                                       │ │
│  │  流式聊天 (Agent 消息):                               │ │
│  │    ← { type:"event", event:"chat",                   │ │
│  │         payload: { sessionKey, state:"delta|final",  │ │
│  │                    message: { content }, usage } }    │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ 空响应重试 ────────────────────────────────────────┐ │
│  │  Agent 返回空 → session reset → 注入记忆上下文       │ │
│  │  → 重试一次 → 仍然空则返回错误                       │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 6.2 重试与断路器

```
┌─ 指数退避重试 ──────────────────────────────┐
│  最多 3 次，总时限 60s                       │
│  delay = 1s × 2^attempt (1s, 2s, 4s, 8s)   │
│                                              │
│  可重试错误:                                 │
│  · 429 (Rate Limit)                         │
│  · 5xx (Server Error)                       │
│  · 529 (Overloaded)                         │
│  · ECONNRESET, ETIMEDOUT, ENOTFOUND        │
└──────────────────────────────────────────────┘

┌─ 三态断路器 ────────────────────────────────┐
│                                              │
│  CLOSED ──5次连续失败──→ OPEN               │
│    ↑                        │                │
│    │ 成功                 60s 超时           │
│    │                        ↓                │
│    └──── 探测成功 ←── HALF_OPEN             │
│                    ↘                         │
│                  探测失败 → OPEN             │
└──────────────────────────────────────────────┘
```

### 6.3 Task Bridge（Dashboard 同步）

Autopilot 通过 HTTP fire-and-forget 将任务状态同步到 Dashboard：

```
┌─ TaskBridge ───────────────────────────────────────────┐
│                                                         │
│  Autopilot  ──HTTP──→  Dashboard API (localhost:3100)  │
│             5s 超时, 失败静默忽略                        │
│                                                         │
│  接口:                                                  │
│  · createCycleTask(agentId, type, cycleNum)            │
│  · completeCycleTask(agentId, taskId, result)          │
│  · createWorkTask(assignee, taskName, deptId)          │
│  · updateTaskStatus(agentId, taskId, status, extras)   │
│  · findActiveTaskForAgent(assignee, deptId)            │
│                                                         │
│  设计原则: fire-and-forget, 绝不阻塞 Autopilot 主流程  │
└─────────────────────────────────────────────────────────┘
```

### 6.4 Session 生命周期管理

Agent Factory 中存在三类不同生命周期的 Session：

**持久 Session（系统管理，被动清理）：**

| 操作 | 触发条件 | 效果 |
|------|----------|------|
| `compactSession` | inputTokens > 50k | 压缩上下文，保留关键信息 |
| `killSession` | inputTokens > 80k | 硬重置，清空所有上下文 |
| 重置冷却 | 120s | 防止频繁重置循环 |
| 过期清理 | 14 天未活跃 | 自动销毁（:main session 除外） |

**Worker 子会话（Agent 自主创建，Gateway 自动回收）：**

| 操作 | 触发条件 | 效果 |
|------|----------|------|
| `sessions_spawn` | Agent 收到 `[Task: task-xxx]` 指令 | 创建隔离的 worker 子会话 |
| 自动终结 | `mode: "run"` 执行完成 | Gateway 内置生命周期回收，无需外部 kill |

**质量门临时 Session（系统创建，主动销毁）：**

| 操作 | 触发条件 | 效果 |
|------|----------|------|
| `sendFn()` 创建 | 质量门阶段触发 | 创建 quality-check/peer-review/approval session |
| `killSession` | `finally` 块 fire-and-forget | 评审完成后立即销毁 |

### 6.5 Session Key 命名规范

| Session Key | 类型 | 用途 | 生命周期 |
|-------------|------|------|----------|
| `agent:{id}:main` | 持久 | Agent 主 session（接收指令 + 状态查询 + 汇报） | 跨周期，被动清理 |
| `agent:{id}:dept-autopilot` | 持久 | 部门 Chief 自动循环 session | 跨周期，被动清理 |
| `agent:ceo:autopilot` | 持久 | CEO 协调循环 session | 跨周期，被动清理 |
| *Gateway 内部子会话* | 临时 | Worker 任务执行（Agent 通过 `sessions_spawn` 创建） | 任务完成自动终结 |
| `agent:{id}:quality-check:{taskId}` | 临时 | 质量门自检 | 评审后 killSession |
| `agent:{id}:peer-review:{taskId}` | 临时 | 质量门同行评审 | 评审后 killSession |
| `agent:{id}:approval:{taskId}` | 临时 | 质量门主管审批 | 评审后 killSession |

---

## 七、预算与成本追踪

### 7.1 预算控制流程

```
部门周期开始前:
  │
  ├─ 1. checkBudget(deptId)
  │     ├─ 读取 config.budget.dailyTokenLimit
  │     ├─ 读取 state.tokensUsedToday
  │     ├─ 检查日期重置（新的一天自动归零）
  │     └─ ratio = tokensUsedToday / dailyTokenLimit
  │        ├─ ≥ 1.0 → BLOCKED (emit budget.dept_blocked, 跳过周期)
  │        ├─ ≥ 0.8 → WARNING (emit budget.dept_warning, 继续)
  │        └─ < 0.8 → ALLOWED
  │
  ├─ 2. reserveBudget(deptId, estimated)
  │     ├─ estimated = 历史平均 (tokensUsedToday / cycleCount) 或默认 5000
  │     ├─ projected = tokensUsedToday + estimated
  │     └─ 超限则阻断; 否则预扣: state.tokensUsedToday = projected
  │
  ├─ 3. [执行周期...]
  │
  └─ 4. reconcileBudget(deptId, reserved, actual)
        └─ 修正: state.tokensUsedToday = (projected - reserved) + actual
```

### 7.2 成本追踪

每次 Agent 调用完成后：

```
trackCost({ model, usage, source, agentId })
  ├─ calculateCost(model, usage)
  │   └─ PRICING[model] × (inputTokens + outputTokens) → USD
  │
  └─ 追加到 config/autopilot-costs.jsonl (append-only):
      {
        "ts": "2026-03-20T10:30:00Z",
        "date": "2026-03-20",
        "model": "minimax/MiniMax-M2.5",
        "inputTokens": 12345,
        "outputTokens": 6789,
        "cost": 0.0234,
        "source": "dept:novel",
        "agentId": "novel-writer-1"
      }
```

### 7.3 成本告警 Reactor

```
CostAlertReactor 监听 cost.tracked 事件:
  ├─ 单次调用成本 > 阈值 → 告警
  ├─ 部门日预算 > 80% → 警告
  └─ 部门日预算 > 100% → 阻断通知
```

---

## 八、记忆管理系统

### 8.1 角色化记忆结构

| 角色 | 目录 | 文件 | 用途 |
|------|------|------|------|
| **CEO** | `agents/ceo/memory/` | SUMMARY.md | 战略概要 |
| | | decisions/YYYY-MM-DD.md | 每日决策记录 |
| | | lessons/what-worked.md | 成功/失败经验 |
| **Chief** | `agents/{chief}/memory/` | SUMMARY.md | 战术概要 |
| | | decisions/YYYY-MM-DD.md | 部门决策 |
| **Worker** | `agents/{worker}/memory/` | SUMMARY.md | 工作概要 |
| | | work-output/YYYY-MM-DD.md | 每日产出 |
| | | domains/knowledge.md | 领域知识积累 |
| | | tasks/{taskId}.md | 单任务执行记录 |

### 8.2 记忆读取

```javascript
buildMemoryContext(agentId, cycleType) {
  result = {}

  // 始终读取: SUMMARY.md (≤2000 字符)
  result.summary = readAgentFile(agentId, 'memory/SUMMARY.md')
  if (!result.summary)
    result.summary = extractSummary(readAgentFile(agentId, 'MEMORY.md'))

  // coordination/strategy: 近期决策 (最近 7 天, ≤3000 字符)
  if (cycleType in ['coordination', 'strategy'])
    result.recentDecisions = aggregateFiles('memory/decisions/*.md', lastNDays=7)

  // strategy: 经验教训 (≤2000 字符)
  if (cycleType === 'strategy')
    result.lessonsLearned = readAgentFile('memory/lessons/what-worked.md')

  return result
}
```

### 8.3 记忆写入（压缩）

每轮周期完成后自动压缩：

| 函数 | 触发角色 | 行为 |
|------|----------|------|
| `extractDecisionEntry()` | CEO/Chief/Worker | 提取决策摘要 → `decisions/YYYY-MM-DD.md` |
| `buildSummaryFromResponse()` | 全部 | 从响应前 10 行构建 SUMMARY.md |
| `extractWorkOutput()` | Worker | 提取完成项 → `work-output/YYYY-MM-DD.md` |
| `updateDomainKnowledge()` | Worker | 提取学习关键词 → `domains/knowledge.md` (≤3000 字符) |
| `updateLessons()` | CEO/Chief | 提取成败经验 → `lessons/what-worked.md` (≤5000 字符) |
| `extractTaskMemory()` | Worker | 创建 `tasks/{taskId}.md`，未来类似任务可参考 |

---

## 九、容错与韧性设计

### 9.1 隔离层级

```
┌─ Level 1: EventBus 隔离 ─────────────────────────────┐
│  监听器异常被 catch → console.error → 不影响主流程     │
│  fire-and-forget 语义: emit 不等待监听器完成           │
└───────────────────────────────────────────────────────┘

┌─ Level 2: TaskBridge 隔离 ────────────────────────────┐
│  HTTP 调用 5s 超时 → 失败静默忽略                      │
│  Dashboard 不可用不影响 Autopilot 运行                 │
└───────────────────────────────────────────────────────┘

┌─ Level 3: 部门间隔离 ────────────────────────────────┐
│  部门 A 异常不影响部门 B                               │
│  每个部门独立预算、独立状态、独立周期                    │
└───────────────────────────────────────────────────────┘

┌─ Level 4: Session 隔离 ──────────────────────────────┐
│  Agent :main 与 worker 子会话分离（双 Session 架构）   │
│  Worker 子会话由 Agent 自主 spawn，Gateway 自动回收    │
│  质量门 session 用后即销（fire-and-forget killSession）│
└───────────────────────────────────────────────────────┘
```

### 9.2 故障恢复策略

| 故障场景 | 恢复策略 |
|----------|----------|
| WebSocket 断连 | 指数退避自动重连（1s → 30s max） |
| Agent 空响应 | Session reset + 注入记忆 → 重试一次 |
| Agent 空响应（重试后） | 返回 error，周期正常结束 |
| LLM API 429/5xx | 指数退避重试（3 次，60s 总限） |
| Agent 响应超时 | 返回 `{ok: false}`，不阻塞 |
| 断路器 OPEN | 拒绝所有请求直到 60s 重置 |
| TaskBridge 失败 | 静默忽略，5s 超时 |
| 预算超限 | 跳过本轮部门周期 |
| 双 Session 状态查询超时 | 降级为 idle 时间判断 |
| Chief 连续 3 次无效响应 | Fallback dispatch（绕过 Chief 直接分发） |
| 质量门连续 3 次异常 | 标记任务 failed |
| Session 上下文膨胀 | 50k compact / 80k kill |
| 孤儿进程 | 启动时自动清理（PID 追踪） |

### 9.3 并发控制

| 机制 | 说明 |
|------|------|
| `state.status === 'cycling'` | 防止同一部门并发执行 |
| `ceoCycleLock` | 防止 CEO 周期并发 |
| Scheduler 防抖 (30s) | 防止事件驱动频繁触发 |
| Session 重置冷却 (120s) | 防止重置-重试循环 |

---

## 十、关键时间参数

| 参数 | 值 | 来源 | 说明 |
|------|------|------|------|
| CEO 协调周期 | 30min (1800s) | constants.cjs | 全局策略 + 资源分配 |
| CEO 战略周期 | 24h (86400s) | constants.cjs | 每日规划 + 政策调整 |
| 部门默认周期 | 10min (600s) | dept config | 可配置，自适应 ±20% |
| Agent 调用超时 | 5min (300s) | constants.cjs | 单次 LLM 交互上限 |
| 状态查询超时 | 30s | constants.cjs | 双 Session 状态查询 |
| Session 压缩超时 | 30s | constants.cjs | compactSession 操作 |
| Idle → review | 18min | auto-transition | 推定完成（可配置） |
| Idle → failed | 30min | auto-transition | 停滞清理（可配置） |
| 质量门超时 | 60s/阶段 | quality-orchestrator | 自检/评审/审批各 60s |
| 质量门触发延迟 | 5s | scheduler | task→review 后 5s 触发 |
| 调度防抖 | 30s | scheduler | 防止事件驱动抖动 |
| Session 压缩阈值 | 50k tokens | dept-loop | compactSession |
| Session 重置阈值 | 80k tokens | dept-loop | killSession |
| Session 重置冷却 | 120s | dept-loop | 防频繁重置 |
| 健康检查频率 | 每 3 个周期 | dept-loop | Session 检查 + 记忆保存 |
| 过期 Session 清理 | 14 天 | dept-loop | 自动销毁不活跃 Session |
| TaskBridge 超时 | 5s | task-bridge | fire-and-forget HTTP |
| 断路器重置 | 60s | retry.cjs | OPEN → HALF_OPEN |
| 心跳间隔 | 30s | gateway-pool | WebSocket keepalive |
| 连接 Idle 超时 | 5min | gateway-pool | 自动断开 |

---

## 附录：状态机与数据流

### A. 任务状态机

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
                    ▼                                              │
  pending ──→ assigned ──→ in_progress ──→ review ──→ completed   │
                              │              │                     │
                              │              ├──→ failed           │
                              │              │                     │
                              ▼              └──→ rework ──────────┘
                           failed                (max 3 次)
```

**状态转换触发者：**

| 转换 | 触发者 | 方式 |
|------|--------|------|
| pending → assigned | Chief Agent | [任务分配] 段 |
| assigned → in_progress | 自动转换 | idle < 5min |
| assigned → failed | 自动转换 | idle ≥ 30min |
| in_progress → review | Chief/自动 | [任务完成] 或 idle ≥ 18min |
| in_progress → failed | 自动转换 | idle ≥ 30min + progress < 50% |
| review → completed | 质量门 | HEAD APPROVED |
| review → rework | 质量门 | HEAD REJECTED (reworkCount < 3) |
| review → failed | 质量门 | HEAD REJECTED (reworkCount ≥ 3) |
| rework → in_progress | 自动转换 | Agent 开始修改 |
| rework → review | 自动转换 | idle ≥ 18min |

### B. 完整数据流

```
┌─ UI 交互 ─────────────────────────────────────────────────────┐
│                                                                │
│  React 组件 → Zustand Store → fetch /api/* → Services          │
│       ↑                                          │             │
│       │ SSE/轮询                                  ▼             │
│       └──────────────────── core-bridge → core/ → 文件 I/O     │
└────────────────────────────────────────────────────────────────┘

┌─ Autopilot 自动循环 ──────────────────────────────────────────┐
│                                                                │
│  orchestrator → gateway-client → WebSocket → Gateway → LLM    │
│       │                ↑                                       │
│       ▼                │                                       │
│  core/repo         core/observe                                │
│  (状态持久化)       (EventBus + CostTracker + Budget)           │
│       │                │                                       │
│       ▼                ▼                                       │
│  JSON 文件          JSONL 审计日志                               │
└────────────────────────────────────────────────────────────────┘

┌─ Agent 任务执行（双 Session 架构）───────────────────────────┐
│                                                                │
│  Chief peer-send [Task: xxx] → Agent :main session             │
│       │                                                        │
│       ├─ :main: sessions_spawn(mode:"run") → worker 子会话    │
│       │           └─ 隔离执行 → 产出写 workspaces/             │
│       │           └─ 完成 → auto-announce → :main              │
│       │                                                        │
│       ├─ :main: 响应 [系统查询] → STATUS: working/idle         │
│       │                                                        │
│       └─ :main: 调用 API 更新任务状态 → TaskBridge → 文件 I/O │
└────────────────────────────────────────────────────────────────┘

┌─ 事件驱动调度 ────────────────────────────────────────────────┐
│                                                                │
│  eventBus.fire('task.status_changed')                          │
│       │                                                        │
│       ├─ to='review' → Scheduler → 5s delay → 质量门          │
│       ├─ to='completed' → Scheduler → 30s debounce → 部门周期 │
│       └─ to='failed' → Scheduler → 30s debounce → 部门周期   │
│                                                                │
│  eventBus.fire('cost.tracked')                                 │
│       └─ CostAlertReactor → 阈值告警                           │
└────────────────────────────────────────────────────────────────┘
```

### C. 关键文件 I/O 一览

| 文件 | 读/写 | 模块 | 缓存 |
|------|-------|------|------|
| `config/autopilot-state.json` | R/W | AutopilotState | 实时 |
| `config/departments/{id}/config.json` | R | DeptConfigRepository | 30s |
| `config/departments/{id}/state.json` | R/W | DeptStateRepository | 30s |
| `config/tasks.json` | R/W | TaskRepository | 实时 |
| `projects/{dept}/{slug}/.project-meta.json` | R/W | TaskRepository | 实时 |
| `config/autopilot-costs.jsonl` | Append | CostTracker | — |
| `config/autopilot-events.jsonl` | Append | EventBus | — |
| `config/budget.json` | R/W | Budget | 实时 |
| `agents/{id}/memory/` | R/W | MemoryManager | 实时 |
| `config/mission.md` | R | Directive builder | 实时 |

---

*本文档基于 Agent Factory v0.4.49 代码分析生成。*
