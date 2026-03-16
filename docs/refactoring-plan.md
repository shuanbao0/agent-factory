# Agent Factory 重构计划

> 基于 5 份分析报告的综合重构路线图
> 日期: 2026-03-15 (更新: 2026-03-16)
> 原则: 设计模式优先 → 修复 bug → 重构架构 → 演进系统
>
> ⚠️ 工作量校正：原始预估偏乐观（30-42 天），实际所需约 80-100+ 天。
> 对一人项目建议：Phase 0.1 + 0.2 + Phase 1 是必须做的（~3 周），
> Phase 2.3 (Tool Use) 是最高 ROI 的架构变更（~2-3 周），
> Phase 3-4 可作为长期演进方向，不急于实施。

## 进度追踪

| Phase | 状态 | 完成日期 | 备注 |
|-------|------|---------|------|
| **Phase 0.1** Repository Pattern | ✅ 已完成 | 2026-03-15 | `shared/` 目录，5 个 Repository + BaseRepository + 测试 |
| **Phase 0.2** State Machine | ✅ 已完成 | 2026-03-15 | `shared/task-state-machine.cjs`，已迁移 3 处调用方 |
| **Phase 0.3** Connection Pool | ✅ 已完成 | 2026-03-15 | `shared/gateway-pool.cjs`，gateway.cjs 从 300→37 行 |
| **Phase 0.4** Facade Pattern | ✅ 已完成 | 2026-03-15 | AgentService + TaskService + Validators + TS Bridge |
| Phase 1.1 安全漏洞 | ✅ 已完成 | 2026-03-15 | Fix 2.1 shell injection, Fix 2.2 path traversal |
| Phase 1.2 逻辑 Bug | ✅ 已完成 | 2026-03-15 | Fix 2.3 parseTaskAssignments, Fix 2.4 sync.cjs, Fix 2.5 kpi.cjs, Fix 2.6 task-storage.ts |
| Phase 1.3 竞态条件 | ✅ 已完成 | 2026-03-15 | `shared/dept-config-repository.cjs` + task-storage.ts 原子写入 + agents/route.ts Repository.update() |
| Phase 2.1 Builder Pattern | ✅ 已完成 | 2026-03-15 | `shared/directive-builder.cjs`，20+ 链式方法，dept-directive.cjs + directive.cjs 重构 |
| Phase 2.2 Strategy Pattern | ✅ 已完成 | 2026-03-15 | `shared/task-strategy.cjs`，9 内置策略 + dept 覆盖，替换 department-loop + quality-gate 硬编码阈值 |
| Phase 2.3 Tool Use API | ✅ 已完成 | 2026-03-15 | 方案 A：直接调 Anthropic API，绕过 OpenClaw Gateway，chief+CEO 结构化决策 |
| Phase 2.4 Template Method | ⏸ 延后 | | ~50 行重复，有意分离（不同运行时），不值得单独 PR |
| Phase 3.1 异步质量门 | ✅ 已完成 | 2026-03-15 | `shared/quality-gate-machine.cjs`，跨循环非阻塞，15min→30s |
| Phase 3.3 可观测性（成本追踪） | ✅ 已完成 | 2026-03-15 | `shared/cost-tracker.cjs` + `/api/costs` + silent catch 改为结构化日志 |
| Bug 修复 (4 个) | ✅ 已完成 | 2026-03-15 | sweepStaleTasks Strategy、memory dedup、gateErrorCounts 跨轮次、动态部门发现 |
| **PR 10: 提交 & 稳定化** | ✅ 已完成 | 2026-03-16 | 34 新文件 + 10 修改文件全部提交，144 测试通过 |
| **PR 11: 质量门 Tool-Use + 测试补全** | ✅ 已完成 | 2026-03-16 | `review-tools.cjs` + quality-gate tool-use 改造 + `agent-service.test.cjs` + `task-service.test.cjs` |
| **PR 12: 成本 Dashboard** | ✅ 已完成 | 2026-03-16 | `/costs` 页面 + Sidebar + i18n (中英文) |
| **PR 13: SSE 内存泄漏修复** | ✅ 已完成 | 2026-03-16 | store.ts EventSource 连接清理 + beforeunload 监听 |
| **PR 14: 事件发射层** | ✅ 已完成 | 2026-03-16 | `event-bus.cjs` + cycle/ceo/cost 事件发射，零行为变更 |
| Phase 3.2 Auth 中间件 | ⏸ 延后 | | 单用户本地系统，不紧急 |
| Phase 4.1 完整 Event Bus + Reactor | 🔲 未开始 | | 发射层已就绪，待验证后扩展 Reactor |
| Phase 4.2 LLM-as-Advisor | 🔲 未开始 | | 依赖 tool-use 在生产环境稳定运行的数据 |
| Phase 4.3 Worker Tool Use | 🔲 未开始 | | 依赖 4.2 |

### Phase 0 实施详情

**新建文件 (40 个, 含 PR 10-14 新增):**
- `shared/base-repository.cjs` — 通用 JSON 文件仓库基类（原子写入 + TTL 缓存）
- `shared/config-repository.cjs` — openclaw.json 统一访问（getConfig/addAgent/removeAgent/getGatewayConfig）
- `shared/dept-state-repository.cjs` — 部门状态 load/save
- `shared/dept-config-repository.cjs` — 部门 config.json 原子读写（Phase 1.3 新增）
- `shared/project-meta-repository.cjs` — 项目元数据 CRUD + readAll 扫描
- `shared/agent-meta-repository.cjs` — Agent agent.json CRUD
- `shared/task-state-machine.cjs` — 统一状态转换（7 状态，转换表，guard）
- `shared/task-strategy.cjs` — 类型感知任务策略（8 内置 + fallback + dept 覆盖）
- `shared/gateway-pool.cjs` — WebSocket 连接池（重连、心跳、idle 超时、请求多路复用）
- `shared/directive-builder.cjs` — 链式 Directive 构建器（20+ section 方法）（Phase 2.1 新增）
- `shared/quality-gate-machine.cjs` — 质量门阶段状态机（5 阶段跨循环）（Phase 3.1 新增）
- `shared/anthropic-client.cjs` — Anthropic SDK 薄封装，sendWithTools()（Phase 2.3 新增）
- `shared/chief-tools.cjs` — Chief 5 tools + CEO 4 tools JSON Schema 定义 + 验证（Phase 2.3 新增）
- `shared/chief-decision-engine.cjs` — 决策引擎：makeChiefDecision + makeCeoDecision（Phase 2.3 新增）
- `shared/cost-tracker.cjs` — Token→USD 换算 + JSONL 每日聚合（Phase 3.3 新增）
- `shared/agent-service.cjs` — Agent 删除 + workspace 归档
- `shared/task-service.cjs` — 任务转换 facade
- `shared/validators.cjs` — 输入校验（agentId、status、path）
- `ui/src/lib/shared-bridge.ts` — TypeScript 桥接层（createRequire）
- `ui/src/app/api/costs/route.ts` — 成本查询 API（Phase 3.3 新增）
- `shared/review-tools.cjs` — 质量门 review tool 定义（3 组 tools）（PR 11 新增）
- `shared/event-bus.cjs` — 事件总线（EventEmitter 薄封装 + JSONL 持久化）（PR 14 新增）
- `ui/src/app/costs/page.tsx` — 成本监控 Dashboard 页面（PR 12 新增）
- 20 个测试文件，共 177 个测试用例

**修改文件 (10+5 个):**
- `package.json` — 添加 `"test"` script + `@anthropic-ai/sdk` 依赖
- `scripts/autopilot/gateway.cjs` — **300→37 行**，委托到 GatewayConnectionPool + sendDirectToAnthropic
- `scripts/autopilot/readers.cjs` — loadDeptState/saveDeptState/readAgentMeta 委托到 Repository
- `scripts/autopilot/department-loop.cjs` — tool-use 决策引擎 + fallback + gateErrorCounts 跨轮次修复 + 成本追踪
- `scripts/autopilot/index.cjs` — CEO tool-use + sweepStaleTasks Strategy 修复 + 动态部门发现
- `scripts/autopilot/memory.cjs` — 知识去重改为条目级比较（短行 bug 修复）
- `ui/src/app/api/agents/route.ts` — config helpers → ConfigRepository，DELETE → AgentService，silent catch → 结构化日志
- `ui/src/app/api/agent-tasks/route.ts` — 内联 VALID_TRANSITIONS → canTransition()

---

## 依赖关系总览

```
Phase 0 (地基层 — 设计模式) ✅
  │
  ├── ✅ 0.1 Repository Pattern ──────┐
  │     统一数据访问，消除 30+ 处      │
  │     裸读写和竞态条件               │
  │                                   │
  ├── ✅ 0.2 State Machine ──────┐    │
  │     统一任务状态转换，消除    │    │
  │     5 处不一致逻辑            │    │
  │                               │    │
  ├── ✅ 0.3 Connection Pool      │    │
  │     WebSocket 连接复用        │    │
  │                               │    │
  └── ✅ 0.4 Facade Pattern       │    │
        API 路由 → Service 层     │    │
                                  │    │
Phase 1 (止血层 — 紧急修复)  ◄────┘    │
  │   依赖 0.1 + 0.2                  │
  │                                   │
  ├── ✅ 1.1 安全漏洞 ◄───────────────┘
  │     依赖 0.4 (Facade 提供统一校验入口)
  │
  ├── ✅ 1.2 逻辑 Bug
  │     依赖 0.2 (State Machine 消除转换不一致)
  │
  └── ✅ 1.3 竞态条件
        依赖 0.1 (Repository 提供原子写入)
        dept-config-repository + task-storage 原子写入 + agents/route atomic update

Phase 2 (重塑层 — Autopilot 重构) ◄── Phase 1
  │
  ├── ✅ 2.1 Builder Pattern (Prompt 构建)
  │     directive-builder.cjs，dept-directive + directive 重构
  │
  ├── ✅ 2.2 Strategy Pattern (任务策略)
  │     依赖 0.2
  │
  ├── ✅ 2.3 Tool Use API (方案 A: 直接调 Anthropic API)
  │     绕过 OpenClaw Gateway，chief+CEO 结构化决策
  │     5 chief tools + 4 CEO tools，regex 降级为 fallback
  │
  └── ⏸ 2.4 Template Method (Base-Rules 统一) — 延后
        ~50 行重复，有意分离（不同运行时）

Phase 3 (加固层 — 质量 & 安全) ◄── Phase 2
  │
  ├── ✅ 3.1 异步质量门
  │     quality-gate-machine.cjs，跨循环非阻塞
  │     不依赖 2.3（文本 prompt 可独立异步化）
  │
  ├── ⏸ 3.2 认证 & 鉴权中间件 — 延后
  │     单用户本地系统，不紧急
  │
  └── ✅ 3.3 可观测性 (成本追踪 + 错误处理)
        cost-tracker.cjs + /api/costs + silent catch → 结构化日志

Phase 4 (演进层 — 架构升级) ◄── Phase 3
  │
  ├── 🔲 4.1 Observer/Event Bus (替代 Polling)
  │     依赖 0.1 + 0.2
  │
  ├── 🔲 4.2 LLM-as-Advisor (方向盘在代码手里)
  │     依赖 2.3 ✅ + 4.1
  │
  └── 🔲 4.3 Worker Tool Use
        依赖 4.2
```

---

## Phase 0: 地基层 — 设计模式注入 ✅ 已完成 (2026-03-15)

> 优先级: **最高** | 预估: 5-7 天 | **实际: 1 天**
> 核心思想: 不改业务逻辑，只建抽象层。所有后续 Phase 都依赖这层地基。

### 0.1 Repository Pattern — 统一数据访问层 ✅

```
0.1 Repository Pattern ✅
├── 0.1.1 设计 Repository 接口 ✅
│   ├── ✅ 定义 IRepository<T> 接口: read(), update(mutator), flush(), invalidate()
│   ├── ✅ 设计缓存策略: 请求级缓存 vs TTL 缓存 vs 永久缓存
│   └── ✅ 设计并发控制: 乐观锁(版本号) vs 原子写入(rename)
│
├── 0.1.2 实现核心 Repository ✅
│   ├── 0.1.2.1 ConfigRepository (openclaw.json) ✅
│   │   ├── ✅ 原子写入: writeFileSync(tmp) + renameSync(tmp, target)
│   │   ├── ✅ 读缓存: 进程内缓存 + invalidate() 机制
│   │   ├── ✅ 写合并: update(mutator) 模式，读-改-写在锁内完成
│   │   └── 受影响文件: 30+ API routes + gateway.cjs + start.mjs
│   │
│   ├── 0.1.2.2 TaskRepository (agent-tasks via HTTP API) ✅
│   │   ├── ✅ 统一 task CRUD: create, read, update, list, query
│   │   ├── ✅ 封装 task-bridge.cjs 的 HTTP 调用
│   │   ├── ✅ 添加重试 + 超时 + 错误分类
│   │   └── 受影响文件: department-loop.cjs, quality-gate.cjs, index.cjs
│   │
│   ├── 0.1.2.3 ProjectMetaRepository (.project-meta.json) ✅
│   │   ├── ✅ 与 ConfigRepository 相同的原子写入模式
│   │   └── 受影响文件: 28 处直接读写
│   │
│   ├── 0.1.2.4 DeptStateRepository (departments/*/state.json) ✅
│   │   ├── ✅ 每个部门独立状态文件，读写隔离
│   │   └── 受影响文件: readers.cjs:saveDeptState, department-loop.cjs
│   │
│   └── 0.1.2.5 AgentMetaRepository (agents/*/agent.json) ✅
│       ├── ✅ Agent 元数据读取 + 缓存
│       └── 受影响文件: readers.cjs:readAgentMeta, 多处 API routes
│
├── 0.1.3 迁移现有代码到 Repository ✅
│   ├── ✅ 0.1.3.1 迁移 autopilot 模块 (readers.cjs → Repository 调用)
│   ├── ✅ 0.1.3.2 迁移 API routes (逐文件替换裸 readFileSync/writeFileSync)
│   ├── 0.1.3.3 迁移 scripts (start.mjs, inject-base-rules.mjs 等) — 部分完成
│   └── ✅ 0.1.3.4 验证: grep 确认无残留的裸 readFileSync(OPENCLAW_CONFIG)
│
└── 0.1.4 测试 ✅
    ├── ✅ 单元测试: 并发 update + flush 不丢数据
    ├── ✅ 单元测试: cache invalidate 后重新读取
    └── ✅ 集成测试: 多个 API route 同时写 openclaw.json 不冲突
```

**为什么最优先**: 30+ 处裸文件读写是当前所有竞态条件的根因。不统一这层，后续任何修复都可能引入新的竞态。

**深层思考**: Repository 不仅是代码整洁的问题。当前 `openclaw.json` 在 autopilot 循环中每 10 分钟被读 6+ 次、写 2+ 次，同时 Dashboard API 也在读写。没有锁 → 写覆盖 → 配置丢失。这是数据损坏级别的问题。

---

### 0.2 State Machine — 统一任务生命周期 ✅

```
0.2 State Machine ✅
├── 0.2.1 定义状态图 ✅
│   ├── ✅ 状态枚举: pending, assigned, in_progress, review, completed, failed, rework
│   ├── ✅ 合法转换表:
│   │   ├── pending → assigned (chief 分配)
│   │   ├── assigned → in_progress (agent 开始工作)
│   │   ├── in_progress → review (agent 提交 / idle 自动转换)
│   │   ├── review → completed (chief 确认 / quality gate 通过)
│   │   ├── review → rework (chief 退回 / quality gate 不通过)
│   │   ├── rework → in_progress (agent 重新开始)
│   │   ├── in_progress → failed (超时 / 异常)
│   │   ├── assigned → failed (超时未开始)
│   │   └── * → pending (管理员重置)
│   ├── ✅ 非法转换: pending → completed (跳级), completed → in_progress (回退) 等
│   └── ✅ 每个转换附带: 触发条件、所需参数、副作用列表
│
├── 0.2.2 实现 TaskStateMachine 类 ✅
│   ├── ✅ transition(taskId, from, to, context): boolean
│   │   ├── ✅ 校验: from 是否是当前状态
│   │   ├── ✅ 校验: from → to 是否在合法转换表中
│   │   ├── ✅ 执行: 通过 TaskRepository 更新状态
│   │   ├── ✅ 记录: 转换历史 (who, when, why)
│   │   └── ✅ 返回: 成功/失败 + 原因
│   │
│   ├── ✅ canTransition(from, to): boolean (纯查询，无副作用)
│   │
│   ├── ✅ getValidTransitions(currentStatus): string[] (当前状态可去的所有地方)
│   │
│   └── onTransition(callback) — 钩子，为 Phase 4 Event Bus 预留
│
├── 0.2.3 消除散落的状态转换逻辑 ✅
│   ├── ✅ 0.2.3.1 department-loop.cjs:autoTransitionTasks()
│   │   ├── ✅ 改为: canTransition() guard + doTransition helper
│   │   └── ✅ idle-based 阈值动态化 (Phase 2.2 Strategy Pattern 完成)
│   │
│   ├── ✅ 0.2.3.2 index.cjs:sweepStaleTasks()
│   │   └── ✅ 添加 canTransition guard
│   │
│   ├── ✅ 0.2.3.3 quality-gate.cjs:processQualityGate()
│   │   └── ✅ 状态转换由 department-loop 的 doTransition 统一处理
│   │
│   ├── ✅ 0.2.3.4 ui/src/lib/task-storage.ts
│   │   └── ✅ API 层使用 canTransition() 校验转换合法性
│   │
│   └── ✅ 0.2.3.5 ui/src/app/api/agent-tasks/route.ts
│       └── ✅ 内联 VALID_TRANSITIONS → canTransition()
│
└── 0.2.4 测试 ✅
    ├── ✅ 状态转换矩阵测试: 所有合法转换通过，所有非法转换拒绝
    ├── ✅ transition() 成功/失败测试
    └── ✅ 历史记录测试: 每次转换留审计记录
```

**深层思考**: 状态机不只是代码整洁的问题。当前 5 处独立转换逻辑互相矛盾 — `autoTransitionTasks` 认为 8 分钟 idle 就该转 review，但 `quality-gate` 可能把任务退回 rework，然后 `sweepStaleTasks` 30 分钟后又把它标 failed。三个模块互不知情。统一状态机 + 转换钩子是唯一能解决这个问题的方式。

**更深的思考**: 动态超时阈值不应该硬编码。应该让任务创建时带上 `expectedDurationMins` 字段，由创建者（chief 或代码）设定。状态机根据这个字段决定何时触发 idle 检测。这把"任务该多久完成"的决策权交回给了任务的创建者，而不是全局常量。

---

### 0.3 Connection Pool — WebSocket 连接复用 ✅

```
0.3 Connection Pool ✅
├── 0.3.1 设计 GatewayPool 类 ✅
│   ├── ✅ 单连接复用 (一个 ws 实例，多个请求复用)
│   ├── ✅ 自动重连 (连接断开后延迟重连)
│   ├── ✅ 心跳保活 (定时 ping，检测死连接)
│   └── ✅ 优雅关闭 (drain pending requests, then close)
│
├── 0.3.2 实现请求多路复用 ✅
│   ├── ✅ 每个请求带唯一 requestId
│   ├── ✅ 响应按 requestId 路由到对应 Promise
│   ├── ✅ 超时独立管理 (每个请求独立 timer)
│   └── ✅ 流式响应: chat.delta 按 sessionKey 路由
│
├── 0.3.3 统一 sendToAgent + sendSessionCommand + sendToCeo ✅
│   ├── ✅ 改为: pool.request(method, params, timeout)
│   ├── ✅ sendToAgent → pool.sendToAgent()
│   ├── ✅ sendSessionCommand → pool.sendCommand()
│   └── ✅ gateway.cjs 从 300→37 行
│
├── 0.3.4 修复 sendToAgent 和 sendSessionCommand 的行为不一致 ✅
│   ├── ✅ 统一为: 全部 reject on timeout，调用方决定是否降级
│   └── runId && 逻辑核实后非 Bug，保留原样
│
└── 0.3.5 测试 ✅
    ├── ✅ 连接复用: 连接 + handshake 测试
    ├── ✅ sendCommand 返回响应测试
    ├── ✅ 超时隔离: request A 超时不影响 request B
    └── ✅ sendToAgent 完整 chat 流程测试
```

**深层思考**: 连接池不只是性能优化。当前每次 `sendToAgent` 新建连接的模式导致了一个隐蔽的 bug — `quality-gate` 串行 3 次调用，每次都新建连接，如果第 2 次连接在 Gateway 侧触发了 session 重置（因为短时间内重复 connect），第 3 次调用拿到的上下文可能是空的。这解释了为什么 peer-review 评分异常低。

---

### 0.4 Facade Pattern — API Service 层 ✅

```
0.4 Facade Pattern ✅
├── 0.4.1 设计 Service 层架构 ✅
│   ├── ✅ AgentService: deleteAgent + workspace 归档
│   ├── ✅ TaskService: 封装 TaskStateMachine
│   ├── ✅ Validators: validateAgentId, validateTaskStatus, sanitizePath
│   └── ✅ shared-bridge.ts: TypeScript 桥接层
│
├── 0.4.2 实现 AgentService ✅
│   ├── ✅ AgentService.deleteAgent(): 删除 + workspace 归档
│   └── ✅ API route /api/agents DELETE → AgentService
│
├── 0.4.3 实现输入校验中间件 ✅
│   ├── ✅ validateAgentId(id): /^[a-z0-9-]+$/ + 长度限制
│   ├── ✅ validatePath(path): 禁止 .. 遍历 (sanitizePath)
│   └── ✅ validateTaskStatus: 校验合法状态
│
├── 0.4.4 迁移 API routes (部分完成)
│   ├── ✅ 第 1 批: /api/agents/* → ConfigRepository + AgentService
│   ├── ✅ 第 3 批: /api/agent-tasks/* → canTransition()
│   └── 其余路由待后续迁移
│
└── 0.4.5 测试 ✅
    └── ✅ validators.test.cjs: 6 个测试用例
```

**深层思考**: Facade 不是简单地把代码搬到另一个文件。关键是 **事务边界** — `AgentService.create()` 里的 5 个步骤，任何一步失败都应该回滚前面的步骤。当前代码没有事务概念，创建 Agent 半途失败会留下不一致状态（比如 agent.json 创建了但 openclaw.json 没更新，Agent 存在但 Gateway 不认识它）。Service 层是引入补偿事务（saga pattern）的最佳位置。

---

## Phase 1: 止血层 — 紧急修复

> 优先级: **高** | 预估: 3-4 天
> 前置依赖: Phase 0.1 (Repository) + Phase 0.2 (State Machine)
> 原则: 基于新抽象层修 bug，不在旧代码上打补丁

### 1.1 安全漏洞修复 ✅

```
1.1 安全漏洞 ✅
├── 1.1.1 [CRITICAL] 命令注入 ✅
│   ├── ✅ gateway/update/route.ts — exec → spawn + 参数数组
│   ├── ✅ skills/install-bin/route.ts — brew install 参数转义
│   ├── ✅ platform/update/route.ts — 同上
│   └── ✅ 统一使用 validators.cjs 校验
│
├── 1.1.2 [CRITICAL] 路径遍历 ✅
│   ├── ✅ agents/[id]/workspace/route.ts — sanitizePath() 校验
│   ├── ✅ 所有文件操作路由添加 jail 检查
│   └── ✅ 实现 sanitizePath(base, userInput) 工具函数
│
├── 1.1.3 [CRITICAL] .env 注入 ✅
│   ├── ✅ env/route.ts — 禁止写入带换行或引号的值
│   ├── ✅ 验证 key 格式: /^[A-Z_][A-Z0-9_]*$/
│   └── ✅ 值过滤: 去除 \n \r 和 shell 特殊字符
│
└── 1.1.4 [HIGH] gateway-client.ts shell 注入 ✅
    ├── ✅ gwCall() 改为 spawn + 参数数组
    └── ✅ 受影响的所有 API route 已更新
```

### 1.2 逻辑 Bug 修复 ✅

```
1.2 逻辑 Bug ✅
├── 1.2.1 [CRITICAL] parseTaskAssignments 格式污染 ✅
│   ├── ✅ agentId.replace(/\*+/g, '') strip Markdown bold
│   ├── ✅ 中文全角冒号、多余空格处理
│   └── ✅ validateAgentId() 合法性校验
│
├── ~~1.2.2 [CRITICAL] runId/sessionKey 过滤器 bug~~ （核实后：非 Bug）
│   └── 此项从修复列表中移除
│
├── 1.2.3 [CRITICAL] sync.cjs 文本匹配自动推进 ✅
│   ├── ✅ 去掉正则匹配 phase 推进逻辑
│   └── ✅ 改为只有明确的 API 调用才能推进阶段
│
├── 1.2.4 [HIGH] IDLE_COMPLETE_MINS 阈值过短 ✅ (由 Phase 2.2 Strategy Pattern 解决)
│   ├── ✅ shared/task-strategy.cjs: 按任务类型差异化阈值
│   ├── ✅ writing=60min, coding=20min, analysis=30min, _fallback=8min
│   └── ✅ department-loop.cjs 已集成 getStrategy()
│
├── 1.2.5 [HIGH] kpi.cjs 指标重复 ✅
│   ├── ✅ chapters_per_day 只计算 type='chapter' 的任务
│   └── ✅ 添加 type 过滤
│
├── ~~1.2.6 [HIGH] delta 覆盖 bug~~ （核实后：非 Bug）
│   └── 此项从修复列表中移除
│
└── 1.2.7 [MEDIUM] store.ts agent 变更检测不完整 ✅
    └── ✅ task-storage.ts 使用 canTransition() 校验
```

### 1.3 竞态条件修复 ✅

```
1.3 竞态条件 ✅
├── 1.3.1 openclaw.json 并发写入 ✅ (由 0.1.2.1 ConfigRepository 解决)
│   └── ✅ 验证: 并发 API 请求不再丢失写入
│
├── 1.3.2 task-storage.ts read-mutate-write 无原子性 ✅
│   ├── ✅ 新增 atomicWriteJson(): tmp+rename 原子写入
│   ├── ✅ writeStandaloneTasks/writeProjectMeta 改用原子写入
│   ├── ✅ updateProjectTask 改为单次 read-mutate-atomicWrite（消除 readProjectMeta+writeProjectMeta 双步）
│   ├── ✅ deleteProjectTask 同上
│   └── ✅ updateTaskInPlace 避免 standalone 路径的双次读取
│
├── 1.3.3 agents/route.ts syncAutopilotDeptAgents 竞态 ✅
│   ├── ✅ 原: readFileSync → JSON.parse → 修改 → writeFileSync（并发 agent 创建丢数据）
│   ├── ✅ 改为: BaseRepository.update() 原子 read-mutate-write
│   └── ✅ ensureProjectForDepartment 的 assignedAgents 更新同样改为原子操作
│
├── 1.3.4 readers.cjs loadDeptConfig 裸 readFileSync ✅
│   ├── ✅ 新建 shared/dept-config-repository.cjs (extends BaseRepository, 30s TTL 缓存)
│   ├── ✅ loadDeptConfig() 委托到 DeptConfigRepository.load()
│   └── ✅ 6 个测试用例
│
├── 1.3.5 SSE 内存泄漏 ✅ (PR 13, 2026-03-16)
│   ├── ✅ store.ts — 新建 EventSource 前先 close 旧连接
│   └── ✅ beforeunload 监听，页面关闭/导航时清理连接
│
└── 1.3.6 start.mjs 端口清理竞态 (遗留)
    ├── start.mjs:89 — kill port → spawn 之间有时间窗口
    └── 不紧急: 手动重启场景，非 autopilot 关键路径
```

---

## Phase 2: 重塑层 — Autopilot 重构

> 优先级: **核心** | 预估: 7-10 天
> 前置依赖: Phase 0 全部 + Phase 1 全部
> 目标: 把 autopilot 从 "prompt + regex" 改为 "code orchestration + tool_use"

### 2.1 Builder Pattern — Prompt 构建 ✅

```
2.1 Builder Pattern ✅
├── 2.1.1 设计 DirectiveBuilder 类 ✅
│   ├── ✅ 链式调用: new DirectiveBuilder()
│   │   .withHeader() / .withRole() / .withCeoRole()
│   │   .withMemory() / .withDeptMemory()
│   │   .withMission() / .withFullMission()
│   │   .withCeoDirectives() / .withBudget()
│   │   .withTransitions() — 自动生成 review/failed 高亮
│   │   .withTeamStatus() / .withTasks() / .withKpis()
│   │   .withDeptReports() / .withEscalations()
│   │   .withProjectData() / .withStandaloneTasks() / .withAgentActivity()
│   │   .withSection() / .withActionRequirements()
│   │   .build()
│   │
│   ├── ✅ 20+ 链式方法，每个独立可测试
│   ├── ✅ build() 返回最终 prompt 字符串，自动去除多余空行
│   └── ✅ withSection() 支持任意自定义段
│
├── 2.1.2 重构 dept-directive.cjs ✅
│   ├── ✅ buildDepartmentDirective() → DirectiveBuilder 链式调用 (316→~200 行)
│   ├── ✅ 行动要求提取为独立函数 buildActionRequirements()
│   ├── ✅ 保留行动要求（2.3 Tool Use 延后，当前仍需文本指令）
│   └── ✅ helper 函数不变: buildTeamStatus, buildDeptTasks, buildKpiStatus
│
├── 2.1.3 重构 directive.cjs (CEO directive) ✅
│   ├── ✅ buildCoordinationDirective() → DirectiveBuilder 链式调用
│   ├── ✅ buildStrategyDirective() → DirectiveBuilder 链式调用
│   ├── ✅ 格式化 helpers 提取: formatProjectData, formatStandaloneTasks, formatAgentActivity
│   ├── ✅ CEO action text 提取为常量 CEO_COORDINATION_ACTIONS
│   └── ✅ 231→~160 行
│
├── 2.1.4 测试 ✅
│   └── ✅ 18 个测试: section 独立测试、组合测试、空值跳过、格式验证
│
└── 2.1.5 Prompt 版本管理 (延后)
    └── 等 2.3 Tool Use 完成后再引入版本管理
```

**深层思考**: Builder 不只是代码整洁。当前 `buildDepartmentDirective` 把 **上下文信息** 和 **行动指令** 混在同一个 prompt 里，导致 prompt 膨胀到 300+ 行，token 成本高且 LLM 容易忽略关键信息（注意力稀释问题）。Builder 让我们可以精确控制每个 section 的 token 预算，甚至根据上下文动态裁剪（比如没有 review 任务时，跳过确认完成的指令段）。未来切换到 tool_use 时，Builder 可以在不改 section 结构的前提下替换 action 部分。

---

### 2.2 Strategy Pattern — 任务类型策略

```
2.2 Strategy Pattern ✅
├── 2.2.1 定义 TaskStrategy 接口 ✅
│   ├── shared/task-strategy.cjs: BUILTIN_STRATEGIES 对象 + getStrategy() 工厂函数
│   │     idleThresholdMins, staleThresholdMins, minPassingScore,
│   │     preferredReviewers, reviewCriteria
│   └── ui/src/lib/shared-bridge.ts: TaskStrategy 接口 + TS 导出
│
├── 2.2.2 实现具体 Strategy ✅
│   ├── writing:       idle=60, stale=120, score=70, reviewers=[reader-analyst, style-editor, continuity-mgr]
│   ├── editing:       idle=30, stale=60,  score=75, reviewers=[reader-analyst, continuity-mgr]
│   ├── worldbuilding: idle=45, stale=90,  score=65, reviewers=[worldbuilder, continuity-mgr]
│   ├── character:     idle=40, stale=80,  score=65, reviewers=[character-designer, continuity-mgr]
│   ├── plotting:      idle=40, stale=80,  score=65, reviewers=[plot-architect, pacing-designer]
│   ├── coding:        idle=20, stale=45,  score=80, reviewers=[]
│   ├── analysis:      idle=30, stale=60,  score=65, reviewers=[]
│   ├── research:      idle=30, stale=60,  score=65, reviewers=[]
│   ├── _fallback:     idle=8,  stale=30,  score=60, reviewers=[] (= legacy 硬编码值)
│   └── getStrategy(taskType, deptConfig): 支持部门级浅合并覆盖
│
├── 2.2.3 集成到 department-loop.cjs ✅
│   ├── autoTransitionTasks: strategy.idleThresholdMins 替代 IDLE_COMPLETE_MINS
│   ├── autoTransitionTasks: strategy.staleThresholdMins 替代 STALE_TASK_MINS
│   └── constants.cjs: 原常量标记为 legacy，保留兼容
│
└── 2.2.4 集成到 Quality Gate ✅
    ├── selectReviewer: 删除 REVIEWER_MAP，改用 strategy.preferredReviewers
    ├── requestSelfCheck: score >= (task._minPassingScore || 60) 替代硬编码 60
    ├── requestPeerReview: 同上
    └── processQualityGate: 注入 strategy.minPassingScore 到 task._minPassingScore
```

**深层思考**: Strategy 解决的核心问题是 — 当前系统对所有任务一视同仁。写一章 5000 字的小说和做一个 5 分钟的信息查询，用同样的 8 分钟 idle 阈值、同样的评审标准、同样的评审人选择逻辑。这是一夜运行中 "novel-writer 产出偏少" 的根因之一：writer 正在写长文，8 分钟没有新 activity 就被系统判定完成，然后被 chief 分配新任务，写到一半的章节就废了。

---

### 2.3 Tool Use API — 替代 Prompt-as-API（最关键任务）✅

```
2.3 Tool Use API ✅ (方案 A 实施完成)
├── 2.3.1 设计 Chief Tool 集 ✅
│   ├── assign_task ✅
│   │   ├── 参数: { agentId, taskSummary, priority? }
│   │   ├── 执行: createWorkTask() + peer-send 通知
│   │   └── 验证: agentId 必须属于部门
│   │
│   ├── complete_task ✅
│   │   ├── 参数: { taskId, reason? }
│   │   ├── 执行: updateTaskStatus(→review)
│   │   └── 前置: 校验 task 确实在 in_progress/rework 状态
│   │
│   ├── send_rework ✅
│   │   ├── 参数: { taskId, agentId, feedback }
│   │   ├── 执行: peer-send 发送返工反馈
│   │   └── feedback 作为返工原因通知 agent
│   │
│   ├── report_progress ✅
│   │   ├── 参数: { summary, blockers? }
│   │   ├── 执行: 记录日志（信息性）
│   │   └── blockers 可用于未来自动升级
│   │
│   └── no_action ✅
│       ├── 参数: { reason }
│       ├── 执行: 仅记录日志，不触发 fallbackDispatch
│       └── 关键: 消除了 "空闲 agent 必须有事做" 的暴力规则
│
├── 2.3.2 实现 Tool Executor ✅
│   ├── shared/chief-decision-engine.cjs — makeChiefDecision() + makeCeoDecision()
│   ├── department-loop.cjs:executeChiefDecisions() — 路由到对应 handler
│   ├── 执行 handler（调用 createWorkTask/updateTaskStatus/peer-send）
│   └── 收集执行结果，构建兼容的 result.text
│
├── 2.3.3 方案 A: 直接调 Anthropic API ✅
│   ├── shared/anthropic-client.cjs — 薄封装 @anthropic-ai/sdk
│   ├── gateway.cjs:sendDirectToAnthropic() — 便捷入口
│   ├── Chief/CEO 不需要 Gateway（不执行 bash、不需要 skills）
│   └── 降级策略: API 调用失败时 fallback 到旧的 Gateway + regex 解析
│
├── 2.3.4 改造 department-loop.cjs 核心循环 ✅
│   ├── 新流程:
│   │   buildDirective → makeChiefDecision(tool-use) → executeChiefDecisions()
│   │   失败时 fallback: sendToAgent → parseTaskAssignments (regex)
│   │
│   ├── 具体变化:
│   │   ├── ✅ 主路径使用 tool-use 结构化决策
│   │   ├── ✅ parseTaskAssignments/parseTaskCompletions 保留为 fallback
│   │   ├── ✅ fallbackDispatch 保留（tool-use 路径中 no_action 替代其触发条件）
│   │   ├── ✅ autoTransitionTasks 保持不变（idle-based 兜底仍需要）
│   │   └── ✅ 决策可审计（tool_use 参数记录在日志中）
│   │
│   └── 结果:
│       ├── tool-use 路径: 结构化 JSON，零 regex
│       ├── fallback 路径: 保留旧逻辑，API 故障时无缝降级
│       └── 成本追踪: 每次调用自动记录 token 使用
│
├── 2.3.5 CEO 循环也改造为 tool_use ✅
│   ├── CEO tools (4 个):
│   │   ├── issue_directive — 向部门发指令
│   │   ├── update_priority — 调整部门优先级
│   │   ├── escalate_issue — 标记需人工介入
│   │   └── no_action — 无需干预
│   └── 同样: 方案 A + Gateway fallback
│
└── 2.3.6 测试 ✅
    ├── ✅ shared/anthropic-client.test.cjs — 4 tests (mock API)
    ├── ✅ shared/chief-tools.test.cjs — 18 tests (schema + validation)
    ├── ✅ shared/chief-decision-engine.test.cjs — 7 tests (mock engine)
    └── 共 29 个新测试
```

**实施说明 (2026-03-15):**
- 选择方案 A（直接调 Anthropic API）是正确决策 — chief/CEO 只做决策，不需要 Gateway 的 bash/skills/session 功能
- 保留旧的 regex 解析作为 fallback 确保了零风险迁移
- `no_action` tool 成功消除了 fallbackDispatch 的误触发场景
- 成本追踪集成在 tool-use 调用链中，每次决策自动记账

**深层思考**: Tool Use 是这整个重构计划的 **转折点**。它把 LLM 从"写自然语言然后脚本猜意图"变成"调用明确定义的函数"。但更深层的变化是 **控制反转** — 当前架构中，LLM 是驱动者（它执行 bash 命令、发 peer-send），脚本是清理者（regex 解析、补建任务、fallback dispatch）。改为 tool_use 后，代码成为驱动者（它决定何时调 LLM、执行什么 tool），LLM 成为建议者。这就是架构分析中说的"方向盘从 LLM 手里交到代码手里"。

**再深一层**: `no_action` tool 看起来无关紧要，实际上是整个设计中最重要的单个改变。当前系统之所以有 fallbackDispatch（强制给空闲 agent 派活），是因为 chief 的自然语言响应中没有"我决定不分配"的明确表达 — regex 解析只能提取"分配了什么"，无法区分"没提到某个 agent 是因为决定不分配"和"忘记提了"。`no_action` 让 chief 可以明确表达"当前不需要分配，因为 xxx"，代码就不需要猜了。

---

### 2.4 Template Method — Base-Rules 统一

```
2.4 Template Method
├── 2.4.1 统一 3 份 base-rules 注入实现
│   ├── 当前重复:
│   │   ├── ui/src/lib/base-rules.ts (TypeScript, Dashboard 用)
│   │   ├── scripts/inject-base-rules.mjs (ESM, CLI 用)
│   │   └── scripts/autopilot 内部也有类似逻辑
│   │
│   ├── 统一为: shared/base-rules-injector.mjs
│   │   ├── injectForAgent(agentId, sections)
│   │   ├── injectForAll()
│   │   ├── marker 检测 + 幂等注入
│   │   └── 同时被 Dashboard API + CLI + autopilot 引用
│   │
│   └── Template Method 结构:
│       ├── abstract readSource(): string
│       ├── abstract writeTarget(content): void
│       ├── final inject(): 读 → 检测 marker → 注入 → 写 (模板方法)
│       └── 子类只覆盖 readSource/writeTarget
│
├── 2.4.2 Marker 机制增强
│   ├── 当前 marker 只标记注入区域的开始/结束
│   ├── 增加: marker 内嵌 hash，检测 base-rules.md 是否变更
│   ├── 如果 hash 不匹配 → 自动重新注入
│   └── 避免: 修改了 base-rules.md 但忘记 re-inject 的问题
│
└── 2.4.3 测试
    ├── 幂等性: 多次注入结果相同
    ├── 覆盖: 旧 marker 被新内容替换
    └── 完整性: inject 后 Agent 文件格式仍合法
```

---

## Phase 3: 加固层 — 质量与安全

> 优先级: **中** | 预估: 5-7 天
> 前置依赖: Phase 2 (特别是 2.2 Strategy + 2.3 Tool Use)

### 3.1 Quality Gate 重设计 — 异步质量门 ✅

```
3.1 Quality Gate ✅ (部分完成，核心异步化已实现)
├── 3.1.1 从同步串行改为异步跨循环 ✅
│   ├── ✅ 新建 shared/quality-gate-machine.cjs — 门禁阶段状态机
│   │   ├── 6 个阶段: pending → self_checking → peer_reviewing → head_approving → done/failed
│   │   ├── canAdvance/advanceGate/nextAction API
│   │   ├── 结果存储在 task.qualityGate 和 task.quality (向后兼容)
│   │   └── 21 个测试用例
│   │
│   ├── ✅ 重写 quality-gate.cjs:processQualityGate() 为非阻塞
│   │   ├── 每次调用只推进一个阶段 (单个 sendToAgent 调用)
│   │   ├── 返回 { done, passed?, reason?, stage } 而非旧的 { passed, reason }
│   │   ├── 错误时不推进到 failed — 留在当前阶段下次重试
│   │   └── 无 reviewer 时自动跳过 peer_reviewing → head_approving
│   │
│   ├── ✅ 更新 department-loop.cjs 质量门调用
│   │   ├── gate.done=false: 持久化中间 qualityGate 状态，留在 review
│   │   ├── gate.done=true+passed: 完成转换
│   │   ├── gate.done=true+!passed: rework/failed（保留 reworkCount 逻辑）
│   │   └── 修复旧代码中 transition() → doTransition() 的调用错误
│   │
│   └── ✅ 性能提升: 5 个 review task 的循环时间从 ~15min → ~30s
│
├── 3.1.2 评审人选择已由 Strategy 驱动 ✅ (Phase 2.2)
│   ├── ✅ selectReviewer 使用 strategy.preferredReviewers
│   └── ✅ 领域专家优先 + 最空闲候选人
│
├── 3.1.3 评审 prompt 使用 tool_use ✅ (PR 11, 2026-03-16)
│   ├── ✅ shared/review-tools.cjs — 3 组 review tools (self_check/peer_review/approval)
│   ├── ✅ quality-gate.cjs — 主路径 sendWithTools + fallback Gateway+regex
│   └── ✅ 12 个测试 (schema + parseReviewToolCall)
│
├── 3.1.4 产出摘要不截断 (延后)
│   └── 当前保留 slice(0, 2000) 截断
│
└── 3.1.5 测试 ✅
    ├── ✅ 状态机: 21 个测试覆盖所有阶段转换、结果存储、错误处理
    └── 集成测试: 跨循环流程待手动验证
```

### 3.2 认证 & 鉴权

```
3.2 Auth
├── 3.2.1 API 路由认证中间件
│   ├── 内部调用: Bearer token 验证 (AGENT_FACTORY_TOKEN)
│   ├── Dashboard 调用: session/cookie (可选，单机场景)
│   ├── 外部调用: 全部拒绝 (bind 127.0.0.1)
│   └── 中间件注入到所有 state-changing 路由 (POST/PUT/DELETE)
│
├── 3.2.2 Agent 间通信鉴权
│   ├── peer-send 验证 from 是否合法
│   ├── 防止 agent A 冒充 agent B 发消息
│   └── 基于 agent 的 department 做权限隔离
│
└── 3.2.3 敏感操作审计
    ├── 所有 agent 创建/删除/配置修改记录日志
    ├── 所有任务状态转换记录 (State Machine 已内置)
    └── 日志格式: structured JSON，可对接外部系统
```

### 3.3 可观测性 ✅ (成本追踪 + 错误处理)

```
3.3 Observability ✅ (部分完成)
├── 3.3.1 成本追踪 ✅
│   ├── ✅ shared/cost-tracker.cjs — Token→USD 换算 + JSONL 每日聚合
│   │   ├── 6 模型定价表 (Anthropic opus/sonnet/haiku + MiniMax)
│   │   ├── calculateCost(model, usage) — 精确到 6 位小数
│   │   ├── trackCost({model, usage, source, agentId}) — 追加到 autopilot-costs.jsonl
│   │   ├── queryCosts({date, from, to, source}) — 查询 + 过滤
│   │   └── getDailySummary(days) — 按日期+来源聚合
│   │
│   ├── ✅ ui/src/app/api/costs/route.ts — REST API
│   │   └── GET /api/costs?period=today|7d|30d&source=dept:novel
│   │
│   ├── ✅ ui/src/app/costs/page.tsx — Dashboard 成本监控页面 (PR 12, 2026-03-16)
│   │   └── 汇总卡片 + 每日柱状图 + 来源/模型明细 + 记录表格
│   │
│   ├── ✅ 集成到 department-loop.cjs — tool-use 和 gateway 调用后自动 trackCost
│   ├── ✅ 集成到 index.cjs — CEO 循环同理
│   └── ✅ 11 个测试 (pricing calculations)
│
├── 3.3.2 错误处理改进 ✅
│   ├── ✅ ui/src/app/api/agents/route.ts — 5 个 silent catch {} → console.warn + 上下文
│   │   ├── resolveModelRef: 记录失败的 model ref
│   │   ├── parseSkillMeta: 记录失败的 skill slug
│   │   ├── syncAutopilotDeptAgents: 记录 department + agentId
│   │   ├── ensureProjectForDepartment: 记录 department
│   │   └── buildPeersRolesSection: 记录失败的 peerId
│   └── ✅ agent-tasks/route.ts — 已有结构化错误返回，无需修改
│
├── 3.3.3 决策审计轨迹 ✅ (由 2.3 Tool Use 自动提供)
│   ├── ✅ tool_use 调用参数记录在 logger 中
│   ├── ✅ 每次决策的 input/output tokens 记录在 cost tracker
│   └── 可追溯: 日志中可查到 chief 每次做了什么决策及原因
│
└── 3.3.4 结构化日志 + 指标聚合 (延后)
    ├── logger.cjs 改进、Dashboard 统计面板
    └── 依赖 Dashboard UI 重构，非当前优先
```

---

### PR 10-14 稳定化 & 补全 (2026-03-16)

> 核心原则: 稳定化 → 补缺 → 可视化 → 渐进式基础设施

**PR 10: 提交 & 稳定化** — 将 34 个新文件 + 10 个修改文件全部提交，消除丢失风险。177 测试全通过，TypeScript 编译无错。

**PR 11: 质量门 Tool-Use + 缺失测试**
- `shared/review-tools.cjs` — 3 组 review tools (`submit_self_check`/`submit_peer_review`/`submit_approval`)
- `quality-gate.cjs` — 3 个 review 函数改造为 sendWithTools 主路径 + Gateway+regex 降级
- `shared/agent-service.test.cjs` — 6 个测试（deleteAgent 配置删除、归档、边界情况）
- `shared/task-service.test.cjs` — 5 个测试（合法/非法转换、extras 透传、终态保护）
- `shared/review-tools.test.cjs` — 12 个测试（schema + parseReviewToolCall）

**PR 12: 成本 Dashboard**
- `ui/src/app/costs/page.tsx` — 完整成本监控页面
  - 时间段筛选（今天/7天/30天）
  - 4 汇总卡片（费用/输入Token/输出Token/API调用）
  - Recharts 每日成本柱状图
  - 按来源 & 按模型的费用明细
  - 最近 50 条记录表格 + 空状态
- Sidebar 添加 Costs 导航项（DollarSign 图标）
- 中英文 i18n 完整支持（17 个 key）

**PR 13: SSE 内存泄漏修复**
- `store.ts` — 新建 EventSource 前先关闭旧连接 + `beforeunload` 清理监听（~8 行）

**PR 14: 事件发射层 (Phase 4.1 第一步)**
- `shared/event-bus.cjs` — EventEmitter 薄封装 + 可选 JSONL 持久化
- 5 个发射点：`cycle.start`、`cycle.end`、`ceo.cycle.start`、`ceo.cycle.end`、`cost.tracked`
- 纯增加式，零行为变更，所有 emit 在 try/catch 中
- 8 个测试

**统计：** 144 → 177 测试 (+33), 6 新文件 + 4 新测试文件, ~600 新增行

---

## Phase 4: 演进层 — 架构升级

> 优先级: **远期** | 预估: 10-14 天
> 前置依赖: Phase 0-3 全部
> 目标: 从 polling 演进到事件驱动，LLM 从决策者变为顾问

### 4.1 Observer/Event Bus — 替代 Polling (发射层 ✅ / Reactor 🔲)

```
4.1 Event Bus (发射层已完成 PR 14, 2026-03-16)
├── 4.1.0 发射层 ✅ (Phase 4.1 第一步 — 只发射不订阅)
│   ├── ✅ shared/event-bus.cjs — EventEmitter 薄封装 + JSONL 持久化
│   │   ├── EventBus 类: fire(type, payload) + on/off
│   │   ├── 错误隔离: listener error + persistence error 均 swallow
│   │   ├── 持久化: 可选写入 config/autopilot-events.jsonl
│   │   └── 单例 eventBus 实例 (persist=true)
│   │
│   ├── ✅ 事件发射点 (6 个):
│   │   ├── cycle.start — department-loop.cjs 循环开始
│   │   ├── cycle.end — department-loop.cjs 循环结束
│   │   ├── ceo.cycle.start — index.cjs CEO 循环开始
│   │   ├── ceo.cycle.end — index.cjs CEO 循环结束
│   │   └── cost.tracked — cost-tracker.cjs 成本记录后
│   │
│   └── ✅ 8 个测试 (emit/on/off + 持久化 + 错误隔离 + 目录创建)
│
├── 4.1.1 设计事件体系
│   ├── 任务事件:
│   │   ├── task.created { taskId, agentId, type }
│   │   ├── task.assigned { taskId, agentId, assignedBy }
│   │   ├── task.started { taskId, agentId }
│   │   ├── task.progress { taskId, agentId, percent, summary }
│   │   ├── task.output_ready { taskId, agentId, outputPath }
│   │   ├── task.review_requested { taskId, reviewerId }
│   │   ├── task.review_completed { taskId, passed, score }
│   │   ├── task.completed { taskId }
│   │   ├── task.failed { taskId, reason }
│   │   └── task.rework { taskId, feedback }
│   │
│   ├── Agent 事件:
│   │   ├── agent.active { agentId, sessionKey }
│   │   ├── agent.idle { agentId, idleMins }
│   │   └── agent.error { agentId, error }
│   │
│   ├── 系统事件:
│   │   ├── cycle.start { deptId, cycleCount }
│   │   ├── cycle.end { deptId, results }
│   │   └── budget.exceeded { deptId, used, limit }
│   │
│   └── 每个事件: { type, timestamp, source, payload }
│
├── 4.1.2 实现 EventBus
│   ├── 基于 Node.js EventEmitter (进程内)
│   ├── 事件持久化: 写入 events.jsonl (append-only)
│   ├── 重放能力: 从 events.jsonl 重建状态
│   └── 未来可扩展: Redis pub/sub (多进程)
│
├── 4.1.3 实现 Reactors (事件处理器)
│   ├── IdleReactor:
│   │   ├── on(agent.idle) → 查找该 agent 的 pending 任务 → assign
│   │   ├── 替代: 当前 department-loop 中的 idle 检测逻辑
│   │   └── 优势: 实时响应，不需要等 10 分钟循环
│   │
│   ├── ReviewReactor:
│   │   ├── on(task.output_ready) → 触发 self-check
│   │   ├── on(task.review_requested) → 触发 peer-review
│   │   └── 替代: quality-gate 的串行流程
│   │
│   ├── StaleReactor:
│   │   ├── 定时扫描: 检测超过 expectedDuration 2x 的任务
│   │   ├── emit(task.failed) 或 emit(task.escalated)
│   │   └── 替代: sweepStaleTasks
│   │
│   ├── BudgetReactor:
│   │   ├── on(cycle.end) → 更新 token 计数
│   │   ├── on(budget.exceeded) → 暂停该部门循环
│   │   └── 替代: budget.cjs 的检查逻辑
│   │
│   └── ReportReactor:
│       ├── on(cycle.end) → 生成部门报告
│       └── 替代: generateDepartmentReport
│
├── 4.1.4 State Machine 集成
│   ├── TaskStateMachine.transition() 成功后 → emit 对应事件
│   ├── 事件驱动 reactor → reactor 调用 StateMachine → 产生新事件
│   └── 形成闭环: 事件 → 处理 → 状态变更 → 新事件
│
└── 4.1.5 渐进迁移
    ├── 阶段 1: 在现有 polling 循环中 emit 事件 (双写)
    ├── 阶段 2: 新建 reactor 处理事件，旧逻辑逐步禁用
    ├── 阶段 3: polling 降级为心跳 (30 分钟一次兜底)
    └── 阶段 4: 完全事件驱动，polling 移除
```

**深层思考**: Event Bus 的真正价值不是"实时性"（polling 也可以调短间隔），而是 **解耦因果关系**。当前代码中，`department-loop.cjs` 是一个 700 行的巨函数，把"发 directive"、"解析响应"、"创建任务"、"检测空闲"、"触发质量门"、"生成报告"全部串在一起。任何一步失败，后面全部跳过。Event Bus 让每个关注点变成独立的 reactor，一个 reactor 失败不影响其他 reactor。而且 reactor 可以独立测试 — 给它一个事件，验证它的输出。

---

### 4.2 LLM-as-Advisor — 代码掌握方向盘

```
4.2 LLM-as-Advisor
├── 4.2.1 重构调度决策
│   ├── 当前: chief (LLM) 决定分配 → 代码执行
│   ├── 改为: 代码基于规则做初步决策 → LLM 审核或调整
│   │
│   ├── 具体流程:
│   │   ├── 1. IdleReactor 检测到 agent 空闲
│   │   ├── 2. 代码找到匹配的 pending 任务 (按优先级、类型匹配)
│   │   ├── 3. 如果有明确匹配 → 直接分配 (不需要问 LLM)
│   │   ├── 4. 如果多个候选或需要判断 → 调 LLM advisor
│   │   │   ├── 输入: agent profile + 候选任务列表 + 上下文
│   │   │   ├── tools: [select_task, defer_assignment, create_new_task]
│   │   │   └── LLM 选择一个 tool → 代码执行
│   │   └── 5. LLM 不可用时 → 降级为纯规则分配
│   │
│   └── 优势:
│       ├── 简单场景零 LLM 调用 (省 token)
│       ├── 复杂场景有 LLM 智慧
│       └── LLM 失败时有降级路径 (不卡住)
│
├── 4.2.2 重构质量评审
│   ├── 代码做初筛: 字数、格式、文件是否存在
│   ├── LLM 做深审: 内容质量、逻辑一致性
│   └── 代码做终审: LLM 评分 + 历史比较 → 最终决定
│
├── 4.2.3 CEO 决策降级
│   ├── CEO 循环频率降低: 30 分钟 → 1 小时
│   ├── 日常协调: 代码 + reactor 自动处理
│   ├── CEO LLM: 只在 "需要跨部门判断" 时调用
│   │   ├── 部门间资源争夺
│   │   ├── 优先级调整
│   │   └── 异常升级处理
│   └── 大幅减少 CEO token 消耗
│
└── 4.2.4 Advisor 缓存
    ├── 相似场景缓存 LLM 决策 (embedding 相似度)
    ├── 同一天内重复的分配决策不重新调 LLM
    └── 缓存失效: 上下文变化超过阈值
```

---

### 4.3 Worker Tool Use

```
4.3 Worker Tool Use
├── 4.3.1 定义 Worker Tool 集
│   ├── report_progress { task_id, percent, summary }
│   ├── mark_complete { task_id, output_summary, output_files[] }
│   ├── request_help { message, urgency }
│   ├── read_file { path } (受限于 workspace + projects)
│   ├── write_file { path, content } (受限于 workspace)
│   └── search_workspace { query } (搜索自己和共享空间)
│
├── 4.3.2 Worker 主动汇报替代 Idle 检测
│   ├── 当前: 靠 idle 时间推测 worker 是否完成
│   ├── 改为: worker 通过 report_progress 主动汇报
│   ├── mark_complete 触发 task.output_ready 事件
│   ├── 保留 idle 检测作为 fallback (worker 可能卡住不汇报)
│   └── idle 阈值大幅提高 (因为正常情况下 worker 会主动汇报)
│
├── 4.3.3 实现方式
│   ├── 方案: 扩展 OpenClaw Gateway 的 tool 定义
│   ├── Worker 的 AGENTS.md 中声明可用 tools
│   ├── Gateway 收到 tool_use 调用 → webhook → orchestrator 处理
│   └── 或: 类似 2.3.3 方案 A，worker 直接调 API
│
└── 4.3.4 渐进迁移
    ├── 先在 1-2 个 worker 上试点 (如 novel-writer)
    ├── 验证: 汇报及时性、tool 使用正确性
    └── 推广到全部 worker
```

---

## 执行优先级矩阵

```
紧急度 ↑
  │
  │  Phase 0.2        Phase 1.1
  │  State Machine     安全漏洞
  │
  │  Phase 0.1        Phase 1.2
  │  Repository        逻辑 Bug
  │
  │  Phase 2.3        Phase 0.4
  │  Tool Use API      Facade
  │
  │  Phase 0.3        Phase 2.2
  │  Conn Pool         Strategy
  │
  │  Phase 2.1        Phase 3.1
  │  Builder           Quality Gate
  │
  │  Phase 4.1        Phase 4.2
  │  Event Bus         LLM Advisor
  │
  └──────────────────────────────→ 影响面
     小                          大
```

**建议执行顺序** (每个可以作为一个独立 PR):

```
PR 1:  ✅ 0.1 Repository + 0.2 State Machine + 0.3 Connection Pool + 0.4 Facade (Phase 0 全部完成)
PR 2:  ✅ 1.1 + 1.2 安全 + 逻辑 Bug (6 个修复: shell injection, path traversal, parseTaskAssignments, sync.cjs 正则, kpi.cjs, task-storage.ts)
PR 3:  ✅ 2.2 Strategy Pattern (task-strategy.cjs + 8 测试, department-loop/quality-gate 集成)
PR 4:  ✅ 1.3 竞态条件修复 (dept-config-repository + task-storage 原子写入 + agents/route atomic update, 6 测试)
PR 5:  ✅ 2.1 Builder Pattern (directive-builder.cjs + dept-directive/directive 重构, 18 测试)
PR 6:  ✅ 3.1 异步质量门 (quality-gate-machine.cjs + quality-gate/department-loop 非阻塞重写, 21 测试)
PR 7:  ✅ 2.3 Tool Use 方案 A (anthropic-client + chief-tools + decision-engine + dept-loop/index 改造, 29 测试)
PR 8:  ✅ Bug 修复 4 个 (sweepStaleTasks Strategy + memory dedup + gateErrorCounts + 动态部门发现)
PR 9:  ✅ 3.3 可观测性 (cost-tracker + /api/costs + silent catch→结构化日志, 11 测试)
   ─── 以上 PR 1-9 于 2026-03-15 完成，共 144 个测试，34 个新文件 ───
PR 10: ✅ 提交 & 稳定化 (全部未提交工作 commit, 60 files, 5234+ insertions)
PR 11: ✅ 质量门 Tool-Use + 缺失测试 (review-tools.cjs + agent-service.test + task-service.test, +23 测试)
PR 12: ✅ 成本 Dashboard (/costs 页面 + Sidebar + i18n)
PR 13: ✅ SSE 内存泄漏修复 (store.ts EventSource cleanup, ~8 行)
PR 14: ✅ 事件发射层 (event-bus.cjs + 5 个 emit 点, +8 测试)
   ─── 以上 PR 10-14 于 2026-03-16 完成，总计 177 个测试，40 个新文件 ───
PR 15: 🔲 4.1 完整 Event Bus + Reactor (IdleReactor, ReviewReactor 等)
PR 16: 🔲 4.2 + 4.3 LLM Advisor + Worker Tool Use (终极形态)
```

**路线图调整说明 (2026-03-15):**
- PR 4 原计划为 "2.1 Builder + 2.3 Tool Use"，但发现 OpenClaw 2026.3.8 chat 协议完全不支持 tool_use（gateway-pool.cjs 只处理 text content blocks），故重排
- 1.3 竞态条件提前到 PR 4（高优先，消除数据损坏风险）
- 2.1 Builder 独立为 PR 5（不依赖 Tool Use，独立改善可维护性）
- 3.1 异步质量门提前到 PR 6（最大性能提升，不依赖 Tool Use — 文本 prompt 也可异步化）
- PR 7: 2.3 Tool Use 采用方案 A（直接调 Anthropic API 绕过 OpenClaw），解除了对上游 tool_use 支持的依赖
- PR 8: 4 个已知 Bug 独立修复，在 PR 7 之后以避免 department-loop/index 冲突
- PR 9: 可观测性（成本追踪 + 错误处理），纯增强不改业务逻辑
- 2.4 Template Method 继续延后（~50 行重复，有意分离不同运行时）
- 3.2 Auth 中间件延后（单用户本地系统）

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 | 状态 |
|------|------|------|------|------|
| Phase 2.3 OpenClaw 不支持 tool_use 透传 | 高 | 阻塞核心任务 | 方案 A 绕过 Gateway 直接调 API | ✅ 已解决 |
| Repository 迁移遗漏裸读写 | 中 | 新旧代码并存产生新竞态 | grep 扫描 + CI 检查禁止裸 readFileSync | ✅ 已缓解 |
| State Machine 转换表遗漏合法路径 | 中 | 合法操作被拒绝 | 先宽后严，初期记录 warning 不 reject | ✅ 已稳定 |
| tool_use 增加 token 成本 | 低 | 预算超支 | tool 定义精简 + cost-tracker 追踪 + fallback 降级 | ✅ 已监控 |
| 重构过程中 autopilot 不可用 | 高 | 业务中断 | tool-use 失败自动 fallback 到 Gateway regex 路径 | ✅ 已缓解 |
| 4.x Event Bus 架构升级 | 中 | 改动面大 | 发射层已就绪 (PR 14)，渐进式引入 Reactor | ✅ 发射层就绪 |
| 全部工作未提交丢失 | 高 | 全部工作丢失 | PR 10 提交了全部 60 文件 | ✅ 已解决 |
| 质量门仍用 regex 解析 | 中 | 评审结果不稳定 | PR 11 改为 tool-use + regex fallback | ✅ 已解决 |
| SSE EventSource 内存泄漏 | 低 | 浏览器内存增长 | PR 13 添加连接清理 | ✅ 已解决 |
