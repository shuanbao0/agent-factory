# E2E LLM 集成测试分析报告

> 日期: 2026-03-19
> 测试环境: MiniMax-M2.5-Lightning via Gateway WebSocket (ws://127.0.0.1:19100)
> 运行次数: 3 次完整运行

---

## 1. 测试总览

| 维度 | 数据 |
|------|------|
| 测试文件 | 4 个 + 2 个 helpers |
| 测试用例 | 11 个 |
| 实际 API 调用 | 9-12 次/次完整运行 |
| 运行耗时 | ~45s（并行），~100s（串行） |
| 通过率 | 11/11（3 次连续运行） |
| 代码行数 | 828 行 |
| API 成本 | $0（MiniMax 免费） |

### 文件结构

```
tests/e2e/
├── _helpers/
│   ├── env-loader.cjs              # .env 加载 + Gateway 检测 + 跳过判断
│   └── cleanup.cjs                 # JSONL 截断 + 测试文件清理
├── gateway-connection.test.cjs     # 测试1: Gateway 连接与基本通信 (4 tests)
├── task-state-flow.test.cjs        # 测试2: 任务状态流转全链路 (3 tests)
├── quality-gate-live.test.cjs      # 测试3: 真实 LLM 质量门评分 (3 tests)
└── project-execution.test.cjs      # 测试4: 项目执行流程 (1 test)
```

### 运行方式

```bash
# 前置条件: Gateway 运行 + .env 含 MINIMAX_API_KEY
npm run gateway

# 运行全部 E2E
npm run test:e2e

# 运行单个文件
TEST_LLM=1 node --test tests/e2e/gateway-connection.test.cjs

# npm test 不触发 E2E（安全隔离）
npm test  # 仅跑 887 个 mock 测试
```

---

## 2. 各测试文件逐项分析

### 2.1 gateway-connection.test.cjs — 基础通信层

**验证链路**: env-loader → gateway-client → GatewayConnectionPool → WebSocket → OpenClaw → MiniMax API

| 用例 | 结果 | 覆盖内容 |
|------|------|----------|
| 发送消息给已注册 Agent | PASS | WebSocket 全链路：连接→认证→chat.send→delta→final |
| 响应包含 usage 数据 | PASS (降级) | MiniMax 不返回 usage，测试退化为可选检查 |
| 未注册 Agent 处理 | PASS (降级) | OpenClaw 自动创建 Agent，改为验证不崩溃 |
| gateway-chat.js 子进程 | PASS | 独立 Node 子进程 SSE 协议通信 |

**发现的问题:**

- **usage 字段缺失**: MiniMax provider 不在 `final` 事件的 payload 中返回 `usage` 对象。测试中 `if (result.usage)` 分支在 3 次运行中从未走到。这意味着 **MiniMax 模型下的 token 计费链路未被验证**。
- **Gateway 自动创建 Agent**: OpenClaw 对未注册的 agentId 不返回错误，而是自动创建一个空 workspace Agent。原计划验证"发送到不存在的 Agent 返回错误"的意图失效。
- **`process.exit(0)` 跳过方式粗暴**: `before()` 中检测 Gateway 未运行时直接 `process.exit(0)` 终止整个进程，不是 `node:test` 推荐的跳过方式。

### 2.2 task-state-flow.test.cjs — 任务状态流转

**验证链路**: state-machine.transition() + gateway-client.sendToAgent() + auto-transition.parseTaskAssignments()

| 用例 | 结果 | 覆盖内容 |
|------|------|----------|
| 完整流转 pending→...→completed | PASS | 4 次状态转换 + 真实 LLM 产出 |
| 返工路径 review→rework→...→completed | PASS | 返工状态机路径正确 |
| parseTaskAssignments 解析 LLM 响应 | PASS | 解析不崩溃，格式兼容 |

**发现的问题:**

- **返工测试没有 LLM 调用**: 返工路径是纯状态机测试，`reworkCount` 是手动赋值的。真正的返工应该是质量门打回后 Agent 重新执行并提交改进版产出。
- **`parseTaskAssignments` 只验证"不崩溃"**: 对解析结果只检查 `Array.isArray` 和字段存在性，不验证 agentId/summary 值的正确性。LLM 返回无关内容也能通过。该函数的核心正则：
  ```
  /^[-*]\s*(\S+?)[:\uff1a]\s*(.+?)(?:\s*[\(\uff08].*[\)\uff09])?\s*$/
  ```
  其中全角冒号 `：`、星号 `*` 分隔符、括号后缀剥离等逻辑均未被真实验证。
- **`normalizeTask` 声明未使用**: 第 38 行绑定后从未调用，是死代码。
- **任务不写入持久化层**: 任务只在内存中流转，与生产环境不一致（生产通过 `task-bridge.cjs` HTTP API 同步）。

### 2.3 quality-gate-live.test.cjs — 质量门评分

**验证链路**: QualityOrchestrator.process() → _requestSelfCheck/_requestPeerReview/_requestHeadApproval → sendToAgent → LLM → 正则解析

这是本套 E2E 测试最核心的测试文件。

| 用例 | 结果 | 覆盖内容 |
|------|------|----------|
| self-check 评分 | PASS | Agent 产出自检，返回 SCORE/PASSED 格式 |
| 三阶段质量门 | PASS (降级) | self-check 失败导致后续阶段跳过 |
| 评分后状态转换 | PASS | passed→completed 或 failed→rework |

**3 次运行中 self-check 结果完全一致:**

| 运行 | score | PASSED | peer review | head approval |
|------|-------|--------|-------------|---------------|
| #1 | 75 | false | 未执行 | 未执行 |
| #2 | 75 | false | 未执行 | 未执行 |
| #3 | 75 | false | 未执行 | 未执行 |

**发现的问题:**

#### [严重] peer review 和 head approval 零覆盖

self-check 每次都返回 score=75 + `PASSED: false`。代码优先信任 LLM 的显式 `PASSED` 字段而非 score 阈值（score >= 60 本应通过）。`QualityOrchestrator.process()` 在 self-check 失败后直接 `return { passed: false }`，导致：

- `_requestPeerReview()` 的 prompt 模板和 SCORE/PASSED/COMMENTS 解析 — 未被验证
- `_requestHeadApproval()` 的 APPROVED/REJECTED 解析 — 未被验证
- `selectReviewer()` 的最空闲策略 — 未被验证

三阶段测试实质退化为"验证 self-check 失败时的短路行为是否正确"。

#### [严重] DI 配置与生产环境不一致

```
生产环境 (department-loop.cjs:34):
  new QualityOrchestrator({ sendFn: sendToAgent })
  → loadDeptConfig 默认 () => null

E2E 测试:
  new QualityOrchestrator({
    sendFn: sendToAgent,
    readAgentActivity: () => ({ ... }),        // 注入固定数据
    loadDeptConfig: () => ({ id, head, ... }), // 注入完整配置
    readTaskOutput: () => SAMPLE_OUTPUT,       // 注入固定文本
  })
```

生产环境 `loadDeptConfig` 返回 `null` → `process()` 第 47-49 行：

```javascript
if (!config) {
  return { passed: true }  // 直接通过，跳过所有质量门！
}
```

**这意味着生产环境的质量门可能被完全短路**。E2E 测试因为注入了完整配置走了不同的代码路径，掩盖了这个生产 bug。

#### [中] sample output 是静态预置文本

SAMPLE_OUTPUT 是 600+ 字符的预置中文小说片段，不是由 Agent 真实产出的内容。生产中 `readTaskOutput` 从文件系统读取 Agent 写入的文件。

### 2.4 project-execution.test.cjs — 项目执行流程

**验证链路**: project-service.createProject() + transition() + sendToAgent() + projectMetaRepo.readMeta()

| 用例 | 结果 | 覆盖内容 |
|------|------|----------|
| 项目创建→任务分配→Agent 执行→完成 | PASS | 全链路，含真实 LLM 调用 |

**发现的问题:**

- **任务未写入 `.project-meta.json`**: 创建了项目和任务对象，但任务没有通过 `taskRepo` 写入项目元数据，与生产环境不一致。
- **缺少阶段推进验证**: 项目配了 `phases: ['draft']` 但没有验证任务完成后阶段是否推进。
- **只有 1 个测试用例**: 异常路径缺失（创建失败、部门不存在、并发任务等）。

### 2.5 _helpers/ — 共享工具

| 问题 | 说明 |
|------|------|
| `cleanupTestTasks` JSON 格式假设错误 | 期望 `tasks.json` 是裸数组，实际格式为 `{"tasks":[]}`。清理逻辑永远不会生效（当前测试未调用此函数，未暴露） |
| JSONL truncate 策略有竞争风险 | 如果测试和 Autopilot 同时运行，truncate 可能截断生产数据。风险极低（需要 `TEST_LLM=1`） |

---

## 3. 覆盖率矩阵

| 被测模块 | 正向路径 | 异常路径 | 与生产一致 | 真实 LLM |
|----------|:--------:|:--------:|:----------:|:--------:|
| Gateway WebSocket 连接 | ✅ | ⚠️ 降级 | ✅ | ✅ |
| 状态机 transition | ✅ | ❌ | ✅ | N/A |
| sendToAgent | ✅ | ❌ | ✅ | ✅ |
| gateway-chat.js 子进程 | ✅ | ❌ | ✅ | ✅ |
| self-check 自检 | ✅ | ❌ | ❌ DI 差异 | ✅ |
| peer review 同行评审 | ❌ 未执行 | ❌ | ❌ | ❌ |
| head approval 主管审批 | ❌ 未执行 | ❌ | ❌ | ❌ |
| selectReviewer 审查者选择 | ❌ 未执行 | ❌ | ❌ | N/A |
| parseTaskAssignments | ⚠️ 只验证不崩溃 | ❌ | ✅ | ✅ |
| createProject | ✅ | ❌ | ✅ | N/A |
| 任务持久化 (TaskRepo) | ❌ 纯内存 | ❌ | ❌ | N/A |
| 成本追踪 (CostTracker) | ❌ 快照恢复 | ❌ | ❌ | N/A |
| Token 计费 (usage) | ❌ provider 不返回 | ❌ | ❌ | ❌ |
| 阶段推进 (sync) | ❌ | ❌ | ❌ | N/A |

**有效覆盖率估算**: ~35%（以"与生产一致的正向路径 + 真实 LLM"为标准）

---

## 4. 发现的生产 Bug

### [P0] QualityOrchestrator 在生产中被短路

**位置**: `core/autopilot/department-loop.cjs:34`

```javascript
_qualityGate = new QualityOrchestrator({ sendFn: sendToAgent })
```

只注入了 `sendFn`。`QualityOrchestrator` 构造函数中：

```javascript
this._loadDeptConfig = loadDeptConfig || (() => null)
```

`process()` 方法第一步：

```javascript
const config = this._loadDeptConfig(deptId)
if (!config) {
  return { passed: true }  // 所有任务直接通过质量门
}
```

**影响**: 生产环境的 Autopilot 部门循环中，所有进入 review 状态的任务都会无条件通过质量门，self-check / peer review / head approval 三个阶段全部被跳过。

**修复方案**: `department-loop.cjs` 中注入 `loadDeptConfig`:

```javascript
const { deptConfigRepo } = require('../repo/dept-config.cjs')
_qualityGate = new QualityOrchestrator({
  sendFn: sendToAgent,
  loadDeptConfig: (deptId) => deptConfigRepo.read(deptId),
  readAgentActivity: () => readAgentActivity(),  // 已有的部门循环内函数
})
```

### [P1] self-check score >= 60 但 PASSED=false 导致死循环

**位置**: `core/task/quality-orchestrator.cjs:192-196`

```javascript
const score = parseInt(result.text.match(/SCORE:\s*(\d+)/)?.[1] || '50')
const explicitPassed = result.text.match(/PASSED:\s*(true|false)/i)
const passed = explicitPassed
  ? explicitPassed[1].toLowerCase() === 'true'
  : score >= 60
```

LLM 返回 `SCORE: 75` + `PASSED: false` 时，代码优先信任 `PASSED: false`，自检失败。在生产 Autopilot 循环中，任务会被反复打回 rework，Agent 重新执行，但如果 LLM 一直返回高分 + PASSED=false，任务永远无法完成。

**建议**: 增加仲裁逻辑，当 score >= 阈值但 PASSED=false 时做二次确认或强制通过。

---

## 5. 改进建议

### P0 — 阻塞性

| # | 改进 | 说明 |
|---|------|------|
| 1 | 修复生产 `loadDeptConfig` 未注入 | 这是被测试暴露的生产 bug，不是测试问题 |
| 2 | 拆分三阶段质量门测试 | mock self-check 为 passed，单独验证 peer review + head approval 的真实 LLM 交互 |

### P1 — 测试可靠性

| # | 改进 | 说明 |
|---|------|------|
| 3 | 替换 `process.exit(0)` 为 `test.skip()` | 避免粗暴终止进程 |
| 4 | 修复 `cleanupTestTasks` JSON 格式 | `{"tasks":[]}` vs `[]` |
| 5 | 增加连接池隔离 | 避免并行运行时 `closePool()` 互相干扰 |
| 6 | E2E 质量门测试使用生产一致的 DI | 不注入 `readAgentActivity`/`loadDeptConfig`，或用与生产完全相同的配置 |

### P2 — 覆盖率提升

| # | 改进 | 说明 |
|---|------|------|
| 7 | `parseTaskAssignments` 正确性验证 | 用固定输入验证已知输出（全角冒号、星号分隔等） |
| 8 | 任务持久化测试 | 写入 tasks.json / .project-meta.json 后读取验证 |
| 9 | 成本追踪验证 | 调用后检查 JSONL 是否新增记录 |
| 10 | 阶段推进测试 | 任务完成后验证 `syncProjects()` 推进项目阶段 |
| 11 | 返工测试加入 LLM | Agent 真实重新执行任务，而非纯状态机跳转 |

---

## 6. 总结

### 测试的价值

1. **基础通信链路验证**: 确认 Gateway → WebSocket → MiniMax API → 响应解析全链路可用
2. **状态机正确性**: 确认 7 种状态的合法转换路径无误
3. **质量门结构验证**: 确认 self-check 能产出可解析的 SCORE/PASSED 格式
4. **冒烟测试**: 作为发布前的快速回归验证有意义

### 测试的局限

1. **质量门——最核心目标——只覆盖了 1/3 阶段**: peer review 和 head approval 从未被真实 LLM 执行
2. **DI 配置与生产不一致**: 测试通过不能代表生产环境的质量门工作正常
3. **暴露了生产 bug**: 生产环境 `loadDeptConfig` 返回 null → 质量门被完全跳过
4. **非确定性处理过度宽容**: "断言结构不断言值"策略走得太远，部分断言等于无效

### 定性评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 基础设施（helpers、跳过、清理） | B | 机制完整但有小 bug（JSON 格式、process.exit） |
| 通信层测试 | A- | 真实 LLM 调用，链路验证充分 |
| 状态机测试 | B+ | 正向路径完整，缺异常路径和持久化 |
| 质量门测试 | D | 核心功能只覆盖 1/3，DI 与生产不一致 |
| 项目执行测试 | C+ | 基本链路通过，缺持久化和阶段推进 |
| **综合** | **C+** | 作为冒烟测试合格，作为集成测试不充分 |
