# 质量门 Session 架构

## 一、系统 Session 类型

每个 Agent 在运行时涉及三类 Session：

| 类型 | Session Key 模式 | 生命周期 | 用途 |
|------|-----------------|---------|------|
| Chat | `agent:{id}:main` / `agent:{id}:dept-autopilot` | **持久** | 接收指令、状态查询、协调分配 |
| Worker | subagent 内部管理 | **临时**，任务完成即销毁 | 实际执行任务（写代码/写小说） |
| 质量门 | `agent:{id}:{stage}:{taskId}` | **临时**，审查完即销毁 | self-check / peer-review / head-approval |

## 二、完整任务流程（以 Novel 部门 writing 任务为例）

```
╔═══════════════════════════════════════════════════════════════╗
║                    部门循环（每 10 分钟）                      ║
╚═══════════════════════════════════════════════════════════════╝

Step 1: Chief 协调
──────────────────
  dept-loop → sendToAgent(novel-chief, "agent:novel-chief:dept-autopilot", directive)
                                        ───────────────────────────────────
                                        Chat Session（持久，保持上下文连续性）

  novel-chief 回复:
    [任务分配]
    - novel-writer: 撰写第三章第一节
    - worldbuilder: 补充天玄大陆东部设定


Step 2: Chief → Agent 派活（peer-send）
───────────────────────────────────────
  novel-chief 执行 peer-send:
    → novel-writer 的 Chat Session (agent:novel-writer:main)
    → worldbuilder 的 Chat Session (agent:worldbuilder:main)

  Chat Session 收到指令后启动 Worker Session (subagent)


Step 3: Agent 执行任务（Worker Session）
────────────────────────────────────────
  novel-writer                      worldbuilder
  ┌──────────────────┐             ┌──────────────────┐
  │ Chat Session     │             │ Chat Session     │
  │ (main, 持久)     │             │ (main, 持久)     │
  │  ↓ 启动 subagent │             │  ↓ 启动 subagent │
  │ Worker Session   │             │ Worker Session   │
  │ (临时, 隔离)     │             │ (临时, 隔离)     │
  │  → 写第三章      │             │  → 写东部设定     │
  │  → 产出到        │             │  → 产出到         │
  │    workspaces/   │             │    workspaces/    │
  │  → 完成后销毁    │             │  → 完成后销毁     │
  └──────────────────┘             └──────────────────┘

  任务状态: pending → assigned → in_progress


Step 4: 下一轮循环 — Dual-Session 状态查询
──────────────────────────────────────────
  dept-loop 查询每个 agent 的 Chat Session:
    queryAgentStatus(novel-writer, "agent:novel-writer:main")

    → Worker 还在跑?  STATUS: working   → 不干扰
    → Worker 完成了?  STATUS: completed  → 任务进入 review
    → Worker 空闲?    STATUS: idle       → 任务进入 review

  任务状态: in_progress → review


Step 5: 质量门触发
─────────────────
  触发条件: task.status === 'review' && agent 空闲 >= 18 分钟
  代码位置: department-loop.cjs autoTransitionTasks()
```

## 三、质量门三阶段详细流程

```
触发: task 处于 review 状态 + assignee 空闲 >= 18min
代码: department-loop.cjs:204 → qualityGate.process(deptId, task)

  ┌─ 阶段 1: Self-Check ────────────────────────────────────────┐
  │                                                              │
  │  Session: agent:novel-writer:quality-check:{taskId}          │
  │  执行者: 任务的 assignee（novel-writer）                      │
  │                                                              │
  │  硬校验（不调 LLM）:                                         │
  │    1. task.output 是否存在？                                  │
  │    2. readTaskOutput() 内容 >= 500 字符？                     │
  │    3. 无未渲染模板变量 ${...}？                               │
  │    → 任一不满足: score=0, passed=false, 短路返回              │
  │                                                              │
  │  LLM 评分:                                                   │
  │    发送产出内容（前 5000 字符）给 assignee                    │
  │    要求回复: SCORE: <0-100> / PASSED: <true/false>           │
  │    通过条件: score >= minPassingScore（writing=70）           │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
                         │
                    passed=true?
                    ┌────┴────┐
                   yes        no → return {passed: false}
                    │               仅 1 个 session 待清理
                    ▼
  ┌─ 阶段 2: Peer Review ───────────────────────────────────────┐
  │                                                              │
  │  选人: selectReviewer(deptId, task, config)                  │
  │    1. 从 config.agents 中排除 assignee 和 head              │
  │    2. 优先 preferredReviewers（writing → reader-analyst,     │
  │       style-editor, continuity-mgr）                         │
  │    3. 在候选池中选最空闲的（idleMins 最大）                   │
  │    4. 无候选人 → 跳过 peer review，直接进 head approval      │
  │                                                              │
  │  Session: agent:reader-analyst:peer-review:{taskId}          │
  │  执行者: 选中的 reviewer                                     │
  │                                                              │
  │  发送产出内容给 reviewer，要求:                               │
  │    SCORE / PASSED / COMMENTS                                 │
  │  通过条件: score >= minPassingScore                          │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
                         │
                    passed=true?
                    ┌────┴────┐
                   yes        no → return {passed: false}
                    │               2 个 session 待清理
                    ▼
  ┌─ 阶段 3: Head Approval ─────────────────────────────────────┐
  │                                                              │
  │  Session: agent:novel-chief:approval:{taskId}                │
  │  执行者: 部门 head（novel-chief）                             │
  │                                                              │
  │  发送: 自检分数 + 评审分数 + 评审意见                         │
  │  要求回复: APPROVED 或 REJECTED + 原因                       │
  │  通过条件: 回复包含 "APPROVED"                                │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
                         │
                    ┌────┴────┐
                APPROVED    REJECTED
                    │           │
                    ▼           ▼
           review → completed   review → rework
                                   │
                                   ▼ (agent 重新修改)
                            rework → in_progress → review
                            （下一轮循环再走质量门）
                            （reworkCount >= 3 → failed）

  finally: killSession() 销毁所有已创建的临时 session
```

## 四、Session Key 一览

### 持久 Session（保持上下文连续性）

| 用途 | Session Key | 使用者 |
|------|-------------|--------|
| CEO 协调 | `agent:ceo:autopilot` | orchestrator.cjs |
| Chief 部门循环 | `agent:{head}:dept-autopilot` | department-loop.cjs |
| Agent 主会话 | `agent:{id}:main` | peer-send / 状态查询 |

### 临时 Session（用完即销毁）

| 用途 | Session Key | 创建时机 | 销毁时机 |
|------|-------------|---------|---------|
| Worker 执行 | subagent 内部 | Chat Session 启动 subagent | 任务完成 |
| Self-Check | `agent:{assignee}:quality-check:{taskId}` | 质量门阶段 1 | process() finally |
| Peer Review | `agent:{reviewer}:peer-review:{taskId}` | 质量门阶段 2 | process() finally |
| Head Approval | `agent:{head}:approval:{taskId}` | 质量门阶段 3 | process() finally |

## 五、质量门触发条件

质量门不是每次循环都跑，需要同时满足：

1. **任务状态 = review** — agent 已提交产出
2. **assignee 空闲 >= 18 分钟**（`IDLE_COMPLETE_MINS`）— 确认 agent 不再修改
3. **部门循环正在执行** — 由 `autoTransitionTasks()` 在循环中调用
4. **预算未超限** — `checkBudget()` 在循环开始时检查

## 六、关键代码位置

| 功能 | 文件 | 行号 |
|------|------|------|
| 质量门触发 | `core/autopilot/department-loop.cjs` | `autoTransitionTasks()` ~200 |
| 质量门编排 | `core/task/quality-orchestrator.cjs` | `process()` |
| Session 销毁 | `core/task/quality-orchestrator.cjs` | `_cleanupSessions()` |
| Reviewer 选择 | `core/task/quality-orchestrator.cjs` | `selectReviewer()` |
| 任务策略 | `core/task/strategy.cjs` | `getStrategy()` — minPassingScore, preferredReviewers |
| Dual-Session 查询 | `core/autopilot/gateway-client.cjs` | `queryAgentStatus()` |
| DI 注入 killSession | `core/autopilot/department-loop.cjs` | `getQualityGate()` ~34 |
| DI 注入 killSession | `core/autopilot/orchestrator.cjs` | ~368 |
