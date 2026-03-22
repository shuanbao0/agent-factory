# Agent Factory 优化分析

> 2026-03-20

---

## 核心缺点与优化方向

### 1. 部门循环里多个关键 Promise 没 await — 静默丢数据

**现象**: `department-loop.cjs` 中 `autoTransitionTasks`（line 458）和 `createWorkTask`（line 446）都是 fire-and-forget，错误被吞，失败无日志。

**后果**:
- 任务状态转换和下一轮 cycle 存在读写竞态，可能重复转换或丢转换
- Chief 以为任务分配成功，但 `createWorkTask` 实际失败了 → 任务永远不存在

**优化**: await 这两个调用，rejected 记 warn 日志。改动 ~15 行，风险低。

---

### 2. 质量门三阶段全串行 — 多任务时阻塞严重

**现象**: `quality-orchestrator.cjs:56-129` 中 self-check → peer-review → head-approval 严格串行，每阶段 60s 超时。

**后果**: 最坏 180s/任务，5 个 review 任务 = 15 分钟阻塞部门循环。

**优化**: self-check 通过后，peer-review 和 head-approval 用 `Promise.allSettled` 并行（省 33%）。多个 review 任务也可批量并行。

---

### 3. 启用预算后"先花后查" — 挡不住超支

**现象**: `department-loop.cjs:356` 先 `checkBudget()`（查历史已用量），再 `sendToAgent()`（消费 token），最后 `trackTokenUsage()`（记账）。预算默认不启用，但用户一旦在部门配置中设了 `dailyTokenLimit` 就会触发。

**后果**: 一个 cycle 消费 300K token，检查时 ratio=0.99 放行，花完变成 1.29 → 超支 29%。`budget.dept_blocked` 事件没人监听执行。

**优化**: 加预估预检查（基于历史平均 token/cycle），花完立即二次检查并 block 下一轮。

---

### 4. 新 Agent 无活动记录 → idle=9999 → 任务秒失败

**现象**: `auto-transition.cjs:116` — 无 session 活动记录时 `idleMins` 默认 9999，远超 30 分钟阈值。

**后果**: 新建 agent 或 Gateway 重启后，agent 的 assigned 任务在第一个 cycle 就被 auto-fail。

**优化**: 回退到 `task.updatedAt` 计算 idle 时间，而非固定 9999。改 5 行。

---

### 4. Chief 响应解析靠固定格式 regex — 静默丢失任务分配

**现象**: `auto-transition.cjs:17-62` 依赖 `[任务分配]` / `[任务完成]` 等中文方括号 section marker 和 `^[-*]\s*agentId:` 格式。LLM 输出稍有偏差（用数字列表、全角括号、漏写 marker）就解析失败，且无任何日志。

**后果**: Chief 的任务分配/完成报告被静默丢弃，系统以为没有新任务。

**优化**:
- 短期：解析失败加 warn 日志 + 放宽 regex（支持数字列表、全角括号）
- 长期：用 structured output（tool-use JSON）替代 regex 解析

---

### 5. Agent 状态查询逐个串行 — Gateway 慢时整体阻塞

**现象**: `department-loop.cjs:174-178` 用 for 循环逐个 `await queryAgentStatus()`，每个 30s 超时。

**后果**: 5 个 agent 全超时 = 150s 阻塞，期间其他部门也被间接卡住（共享 WebSocket）。

**优化**: 改为 `Promise.allSettled` 并行 + 总超时上限 45s。

---

### 6. 空响应重试原地修改 listener — 有竞态风险

**现象**: `gateway-pool.cjs:241-281` 空响应后 reset session 并重试，但直接修改现有 listener 的 `runId`，与 `_handleFrame` 的事件路由并发执行。

**后果**: 旧 delta 事件可能混入重试响应，或 reset 响应不到导致 Promise 永悬。

**优化**: 重试时创建全新 listener entry（新 key），不原地修改。改动较大（~50 行），建议充分测试后再上。

---

## 速查表

| # | 缺点 | 文件:行 | 改动量 | 优先级 |
|---|------|---------|--------|--------|
| 1 | Promise 没 await | department-loop.cjs:446,458 | ~15 行 | 高 |
| 2 | 质量门全串行 | quality-orchestrator.cjs:56 | ~30 行 | 高 |
| 3 | 预算先花后查（启用时） | budget.cjs:54, dept-loop:356 | ~30 行 | 中 |
| 4 | idle=9999 误杀 | auto-transition.cjs:116 | ~5 行 | 高（易修） |
| 5 | regex 解析脆弱 | auto-transition.cjs:17-62 | ~15 行 | 中 |
| 6 | 状态查询串行 | department-loop.cjs:174 | ~20 行 | 中 |
| 7 | 重试竞态 | gateway-pool.cjs:241 | ~50 行 | 中（复杂） |
