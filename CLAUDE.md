# Agent Factory 开发指南

## 项目概述

Agent Factory 是自包含的多 Agent 协作平台，内置 OpenClaw 引擎，提供 Dashboard UI 管理。支持自主 Autopilot 循环、多部门协作、任务质量门、成本追踪与预算管控。

- 版本: 1.0.2
- 仓库: https://github.com/shuanbao0/agent-factory
- 运行时: Node.js >= 22
- 许可: GPL-3.0

## 架构总览

```
Dashboard UI (3100, Next.js 14 + React 18 + Zustand)
  ↓ fetch /api/* (48+ 路由)
API Routes  →  Services (agent-crud / autopilot-api / task-api)
                  ↓
              core-bridge.ts (CJS↔TS 唯一入口)
                  ↓ require()
              core/ (CJS)  repo → task → llm → observe → agent → autopilot → common
                  ↓
              OpenClaw Gateway (19100) — LLM 路由 + Session 持久化 + Token 计数
```

## 设计模式

| 模式 | 应用 |
|---|---|
| Repository | `core/repo/` — JSON I/O + TTL 缓存 + 原子写（tmp+rename） |
| State Machine | `core/task/state-machine.cjs` |
| Strategy | `core/task/strategy.cjs` — 14 种任务类型 |
| Observer/Pub-Sub | `core/observe/event-bus.cjs` — fire-and-forget + JSONL 持久化 |
| Circuit Breaker | `core/llm/retry.cjs` — CLOSED→OPEN→HALF_OPEN |
| Connection Pool | `core/llm/gateway-pool.cjs` — 单 WS 复用 + 惰性连接 + 心跳 |
| Dependency Injection | `core/task/quality-orchestrator.cjs` |
| Facade | `ui/src/lib/*.ts` — 委托 core |
| Marker-based Injection | `ui/src/lib/base-rules.ts` — 幂等 HTML 注释标记 |

## 代码原则

### 简洁与逻辑
1. **最小必要复杂度** — 只写当前需求所需代码，三行相似代码优于过早抽象，不为假设未来设计
2. **不过度工程化** — 不添加未要求的功能、重构、注释、docstring、类型注解
3. **不添加冗余防御** — 只在系统边界（用户输入、外部 API）校验，信任内部代码和框架
4. **删除即删除** — 不留 `_unused`、`// removed`、re-export 兼容 shim
5. **单一职责** — 每个 core/ 子目录一个领域；每个函数一件事
6. **命名即文档** — 只在逻辑不自明处加注释

### 架构与分层
7. **业务逻辑集中在 core/**，UI 层不含业务逻辑
8. **entity/ 是类型单一真相源**（`.ts` + `.cjs` 双格式）
9. **core-bridge.ts 是 UI → core/ 唯一入口**（`createRequire` 绕过 webpack）
10. **新模块通过 barrel `index.cjs` 暴露**

### 可靠性
11. **Fire-and-forget 容错** — EventBus 监听器错误不影响主流程
12. **幂等操作** — 所有迁移、base-rules 注入、skill symlink 同步可重复执行
13. **原子服务操作** — `createAgent()` 一次完成多步，无中间态
14. **惰性依赖加载** — 用 lazy require 防循环依赖
15. **JSONL Append-Only** — 成本和事件日志避免 read-modify-write 竞争

## 项目结构

```
agent-factory/
├── entity/               # 类型 + 常量单一真相源（.ts + .cjs）task/agent/dept/config/autopilot/observe/project/ui
├── core/                 # 核心业务（CJS）
│   ├── repo/             # Repository Pattern 数据访问
│   ├── task/             # State Machine + Strategy + Quality Gate
│   ├── llm/              # Gateway 连接池 + 重试 + 断路器
│   ├── observe/          # Event Bus + Cost + Budget + KPI
│   ├── agent/            # memory.cjs 记忆管理
│   ├── autopilot/        # CEO + 部门循环
│   └── common/           # paths, logger, services, validators
├── ui/                   # Next.js Dashboard
├── data/                 # 运行时数据（gitignored）
│   ├── agents/{id}/      # Agent 定义 + memory/
│   ├── workspaces/{id}/  # Agent 产出空间
│   ├── projects/{dept}/{slug}/  # 1 部门 N 项目
│   ├── departments/{id}/ # config.json + state.json + mission.md
│   ├── config/           # openclaw.json / tasks.json / mission.md / *.jsonl
│   ├── logs/             # YYYY-MM-DD.log（14 天轮转）
│   ├── openclaw-state/   # Gateway 会话状态
│   └── templates/        # 用户自定义模板
├── bin/agent-factory.mjs
├── config/               # 源码配置（git 跟踪）base-rules.md / project-standards.md / task-standards.md / phase-deliverables.md / base-mission.md / openclaw.default.json / models.default.json
├── templates/            # agents/builtin（65 模板）+ departments/builtin（12 部门）
├── skills/               # 共享技能
├── scripts/
│   ├── runtime/          # start.mjs, autopilot
│   ├── migrate/          # migrate-*.mjs（update 自动调用）
│   └── tools/            # inject-*, cleanup-*
└── libs/                 # 本地库（openclaw，不提交）
```

## 各模块要点

### entity/（类型源）
`task/`: STATUSES/TRANSITIONS/TERMINAL/canTransition/Task/TaskQuality/PipelineStep；`agent/`: Agent/AgentMeta/AgentTemplate；`dept/`: DepartmentConfig/Workflow/LoopState；`config/`: OpenClawConfig；`autopilot/`: AutopilotState；`observe/`: Budget/CostEntry；`project/`: ProjectMeta。

### core/repo/
所有持久化通过 Repository，屏蔽 I/O。BaseRepository 提供 TTL 缓存 + 原子写。主要类：ConfigRepository (30s)、TaskRepository (实时)、SessionRepository、DeptConfigRepository (30s)、DeptStateRepository (30s)、MissionRepository、AgentMetaRepository、ProjectMetaRepository。

### core/task/
- `state-machine.cjs` — 状态转换校验 + 历史记录（actor/reason/timestamp）
- `strategy.cjs` — 14 种策略（通用 9 + 创作 5）
- `type-inference.cjs` — 摘要关键词 + Agent role → 任务类型
- `quality-gate.cjs` — 三阶段 FSM：self_checking → peer_reviewing → head_approving → done
- `quality-orchestrator.cjs` — DI 编排，三阶段都注入 task-standards + project-standards
- `auto-transition.cjs` — idle>18min→auto-complete, idle>30min→auto-fail

**状态机：** `pending → assigned → in_progress → review → completed`；分支：`→ rework`、`→ failed`

### core/llm/
`anthropic-client.cjs`（tool-use）、`gateway-pool.cjs`（单 WS + 自动重连 + 心跳）、`retry.cjs`（指数退避 + 断路器）、`directive-builder.cjs`（prompt 组合）。

### core/observe/
`event-bus.cjs`（继承 EventEmitter + JSONL 持久化 + 错误隔离）、`cost-tracker.cjs`（Token→USD + JSONL append）、`budget.cjs`（按部门日 Token 配额）、`kpi.cjs`、`stall-detector.cjs`、`scheduler.cjs`、`adaptive-timer.cjs`、`signal-watcher.cjs`、`reactors/`（cost-alert、cycle-monitor）。

### core/autopilot/
- `orchestrator.cjs` — CEO 协调循环（默认 30min）：buildMemoryContext → sendToCeo → syncProjects → 触发部门循环
- `department-loop.cjs` — 部门执行循环（默认 10min）：buildDirective → sendToAgent(chief) → parseTaskAssignments → autoTransitionTasks → processQualityGate
- `gateway-client.cjs` — sendToAgent / sendToCeo / compactSession / queryAgentStatus
- `directive.cjs` / `dept-directive.cjs` — 指令构建，注入阶段出口条件 + 任务类型摘要
- `task-prompt.cjs` — buildTaskContext / buildTaskPrompt，注入 task-standards 类型专属段落
- `sync.cjs`、`dept-activity.cjs`、`constants.cjs`、`logger.cjs`

### core/agent/
`memory.cjs` — `buildMemoryContext(agentId, cycleType)` 读取 `agents/{id}/memory/`；`extractTaskMemory()` 写入 `memory/tasks/{taskId}.md`；`compressMemoryByRole()` 按 ceo/leader/member 更新 SUMMARY.md、decisions/、work-output/、domains/。

### core/common/
`paths.cjs`（路径单一真相源，支持 `AGENT_FACTORY_DATA_DIR` 覆盖）、`logger.cjs`（全局结构化日志）、`data-init.cjs`、`task-bridge.cjs`（fire-and-forget HTTP）、`autopilot-state.cjs`、`agent-service.cjs`（12 步原子 Agent 生命周期）、`department-service.cjs`、`project-service.cjs`（1 部门 N 项目 + 自动注入 STANDARDS.md）、`file-browser.cjs`、`skill-utils.cjs`、`skill-symlinks.cjs`、`base-rules-injector.cjs`、`project-standards.cjs`、`task-standards.cjs`、`phase-deliverables.cjs`、`models-service.cjs`、`env-manager.cjs`、`event-relay.cjs`、`validators.cjs`、`config-validator.cjs`。

### UI（`ui/src/`）
- `app/` — App Router + API 路由（48+ 端点）agents/gateway/projects/tasks/autopilot/skills/models/departments/costs/budget/events/platform/health/logs/usage/env/templates/sessions/messages/workspaces
- `components/` — 70+ React 组件（layout-shell、sidebar、data-provider、gateway-guard、agent-form/card/graph、template-picker、autopilot-card、department-loop-card、task-card/pipeline/quality、mission-editor、budget-dashboard、token-chart、comm-matrix、pixel-office 等）
- `services/` — agent-crud、autopilot-api、task-api
- `lib/` — **core-bridge.ts**（唯一 core 入口）、store.ts（Zustand + SSE + 轮询 + tab 可见性优化）、gateway-manager.ts、gateway-client.ts（gwCall/gwCallAsync）、gateway-chat.ts（子进程）、base-rules.ts、task-storage.ts、quality-gate.ts、data-fetchers.ts、event-relay.ts、i18n.ts、providers.ts、clawhub.ts
- `locales/` — zh/en

### scripts/
- **runtime/**: `start.mjs`（统一启动）、`autopilot.cjs` + `autopilot/{index,department-loop}.cjs`
- **migrate/**（`update` 自动调用）: `migrate-data-dir`、`migrate-sync-builtin`、`migrate-sync-config`、`migrate-sync-gateway`、`migrate-multi-project`
- **tools/**（手动）: `inject-base-rules.mjs`、`inject-project-standards.mjs`、`cleanup-invalid-outputs.mjs`
- **根目录**: `install.sh`、`patch-openclaw.mjs`（postinstall hook，版本 >= 2026.4.0 自动跳过）

### templates/builtin/
65 个 Agent 模板，每个含 4 文件：`template.json` + `AGENTS.md` + `SOUL.md` + `IDENTITY.md`。覆盖高管层、管理层、运营层、创意层、技术层、小说创作、量化金融、教程创作、研究分析。

### skills/
`project-init`、`peer-status`、`task-api`、`project-api`、`find-skills`、`skill-creator`、`wechat-mp-cn`。

## 关键数据结构

### Task
```typescript
interface Task {
  id: string; name: string
  status: 'pending'|'assigned'|'in_progress'|'review'|'completed'|'failed'|'rework'
  priority: 'P0'|'P1'|'P2'
  assignees: string[]; assignedAgent?: string
  creator: 'user'|string
  progress: number
  projectId?: string|null; phase?: number; type?: string
  quality?: TaskQuality        // 自检/同行评审/主管审批
  reworkCount?: number
  dependencies: string[]
  output?: string
  createdAt: string; updatedAt: string; completedAt?: string
}
```

### DepartmentConfig
```typescript
interface DepartmentConfig {
  id: string; name: string
  head: string              // 部门 Chief Agent ID
  interval: number          // 循环秒数
  enabled: boolean
  agents: string[]
  budget?: { dailyTokenLimit: number; alertThreshold: number }
  kpis?: Record<string, { target: number; unit: string }>
  workflow?: DepartmentWorkflow
}
```

### DepartmentLoopState
```typescript
interface DepartmentLoopState {
  status: 'running'|'stopped'|'cycling'|'idle'|'error'
  pid: number|null
  cycleCount: number
  lastCycleAt: string|null
  history: Array<{ cycle, startedAt, completedAt, elapsedSec, result }>
  tokensUsedToday: number
  budgetResetAt: string|null
}
```

## 关键文件 I/O

路径通过 `core/common/paths.cjs` 统一管理。

- `data/config/openclaw.json` — Gateway 配置 + Agent 注册（ConfigRepository 30s 缓存）
- `data/config/tasks.json` — 独立任务（实时）
- `data/projects/{dept}/{slug}/.project-meta.json` — 项目元数据 + 任务
- `data/departments/{id}/{config,state}.json` — 部门策略 + 运行态（30s 缓存）
- `data/config/autopilot-{state.json,costs.jsonl,events.jsonl}` — Autopilot 状态 + 审计日志
- `data/config/budget.json` — 全局预算
- `data/logs/YYYY-MM-DD.log` — 系统日志（14 天轮转）
- `config/{base-rules,project-standards,task-standards}.md` — base 源文件（mtime 缓存）
- `data/projects/{dept}/{slug}/STANDARDS.md` — 幂等 marker 注入
- `data/agents/{id}/memory/` — `SUMMARY.md`（覆写 2k 字）、`decisions/{date}.md`（append 500 字/条）、`work-output/{date}.md`、`domains/knowledge.md`（append+trim 3k）、`lessons/what-worked.md`（5k）、`tasks/{taskId}.md`（覆写 3k，质量门通过/失败写入）

## 技术栈

Next.js 14（App Router）+ React 18 + Zustand 4.5 + SSE/轮询降级 + Tailwind 3.4（暗色）+ clsx/CVA + lucide-react + Recharts + TypeScript 5.3 strict。路径别名 `@/*` → `./src/*`、`@entity/*` → `../entity/*`。core 用 CJS。Node.js >= 22。

## CLI 命令

```bash
agent-factory start        # 启动 Dashboard + Gateway（后台 + PID 追踪）
agent-factory stop         # 级联 SIGTERM
agent-factory restart
agent-factory status       # 端口/PID/版本
agent-factory logs         # tail -f 今日日志（支持 --level, --lines, --no-follow）
agent-factory update       # 原子升级
agent-factory version
agent-factory doctor       # 环境检查
```

`update` 流程：查最新 release → 停服 → 下载 tarball → rsync（保留 agents/projects/templates-custom/.env/openclaw.json）→ npm install → migrate-*.mjs（`AF_UPDATE_DIR` 指向 tmpDir）→ 重新注入 base-rules → 提示重启。Dashboard Settings 页「Agent Factory 更新」卡片也可触发（`/api/platform/update`）。

## 构建与运行

```bash
npm install && cd ui && npm install
agent-factory start              # 或 npm start（Dashboard 3100 + Gateway 19100）
npm run ui                        # 仅 Dashboard
npm run gateway                   # 仅 Gateway
cd ui && npm run {dev,build,lint}
```

## 测试

使用 `node:test` + `node:assert/strict`，无外部框架。

| 层 | 目录 | 说明 |
|---|---|---|
| 单元 | `tests/core/` 54 文件 | mock 隔离，按 core/ 子模块 |
| 接口 | `tests/interfaces/` 21 文件 | 真实 I/O，`repo-*` / `svc-*` 前缀 |
| 流程 | `tests/flows/` 8 文件 | mock Gateway 验证跨模块 |
| E2E | `tests/e2e/` 7 文件 | 真实 LLM（MiniMax），需 `TEST_LLM=1` |

```bash
npm test               # 单元+流程+接口
npm run test:{unit,interfaces,flows,e2e,all}
```

Helper：`tests/e2e/_helpers/{env-loader,cleanup}.cjs`、`tests/flows/_helpers/{mock-gateway,mock-repos,test-context}.cjs`。E2E 顶部必须 `shouldSkip()` 优雅跳过。

## 端口与环境变量

- Dashboard 3100，Gateway 19100（`OPENCLAW_GATEWAY_PORT` 覆盖）

| 变量 | 说明 |
|---|---|
| `ANTHROPIC_API_KEY` | 至少一个 API Key（也可 OPENAI/DEEPSEEK） |
| `OPENCLAW_GATEWAY_PORT` | Gateway 端口（默认 19100） |
| `AGENT_FACTORY_DIR` | 项目根（自动检测） |
| `AGENT_FACTORY_DATA_DIR` | 运行时数据目录（默认 `{ROOT}/data`） |
| `AGENT_FACTORY_TOKEN` | 内部通信 Token |
| `AF_UPDATE_DIR` | update 指向新版 tmpDir，migrate 脚本使用 |

## 架构核心概念

### 数据流
```
UI → Zustand Store → fetch /api/* → Services → core-bridge → core/ → 文件 I/O
  ↑                                                                    │
  └──── SSE 推送 / 轮询降级 ←───────────────────────────────────────────┘

Autopilot: orchestrator → gateway-client → WS → OpenClaw → LLM APIs
              ↓                ↑
          core/repo    core/observe（EventBus + Cost + Budget）
```

### 轮询（DataProvider）
Health 15s、Agents 10s、Logs 5s、Usage 30s。Tab 不可见时暂停，SSE 可用时优先推送。

### Gateway 状态
`'running' | 'stopped' | 'starting' | 'no-key' | 'error'`

### 源码与数据分离
所有运行时数据在 `data/` 下，源码目录保持干净。`config/base-rules.md` 强制 Agent 把产出写到 `data/workspaces/{id}/`，Gateway 的 workspace 字段指向 `data/agents/{id}/`。

### 双 Session 架构（Chat + Worker）

每个 Agent 有两类 Session：

- **`:main` (Chat)** — Gateway 自动创建；接收指令、响应 `[系统查询]`、汇报完成；持久
- **Worker 子会话** — Agent 通过 `sessions_spawn(mode:"run")` 自己创建；执行任务；Gateway `mode:"run"` 完成即回收

**任务执行流程：**
1. Chief `peer-send [Task: task-xxx]` → Agent `:main`
2. Agent 调 `sessions_spawn(mode:"run", agentId:自己)` 开 worker
3. Worker 产出写 `workspaces/{id}/`
4. `:main` 保持响应 `[系统查询]` → `STATUS: working/completed/idle`
5. Worker 完成 → `auto-announce` 回推 `:main`（user message 注入）
6. Agent 调任务 API 更新状态

`queryAgentStatus` 发到 `:main` 而非 worker（worker 外部无法查询）。

### Session 生命周期管理

kill 前先 `[系统查询]` 提取记忆 → 持久化到 `memory/` → 销毁。

- CEO `:autopilot`：每轮前 >80k kill, >50k compact
- Chief `:dept-autopilot`：`ensureSessionHealth` 每轮前 >80k kill, >50k compact
- Member `:main`：`runHealthCheck`（每 3 轮），无活跃任务 → kill；有活跃+>80k → compact
- 所有 session：`cleanStaleSessions` 14 天不活跃 → kill
- Worker：Gateway 自动回收

**记忆持久化时机：** CEO/Chief 循环完成 → SUMMARY.md + decisions/；任务通过/失败质量门 → tasks/{taskId}.md + work-output/ + domains/；session kill 前按角色提取。

### Base-Rules 注入

`config/base-rules.md`（`## AGENTS_RULES` / `## SOUL_RULES` / `## REMINDER`）通过 marker 幂等注入 AGENTS.md + SOUL.md。

- Agent 创建/更新时自动注入
- 手动：`node scripts/tools/inject-base-rules.mjs [agentId]`
- `agent-factory update` 自动重新注入
- **修改 base-rules.md 后必须执行注入脚本才会生效**

### 项目标准 + 任务标准注入

- **`config/project-standards.md`**（`## LIFECYCLE` + `## BOUNDARIES`）：项目创建时自动注入 → `STANDARDS.md`（marker 幂等）；部门指令展示当前阶段出口条件；修改后执行 `scripts/tools/inject-project-standards.mjs`
- **`config/task-standards.md`**（`## GENERAL` + `## TYPES`）：14 种任务类型定义；由 `type-inference.cjs` 从摘要关键词 + Agent 角色自动推断；所有触点（Chief 指令、任务创建、Worker 执行、质量门三阶段）均注入类型专属标准；mtime 缓存，修改后下次触发自动生效；未知类型回退 GENERAL

### Agent 创建流程

1. 用户选模板（builtin/custom）
2. `POST /api/agents` → 创建 `agents/{id}/{agent.json,AGENTS.md,TOOLS.md}` + memory/
3. 注入 base-rules 到 AGENTS.md + SOUL.md
4. 创建 `workspaces/{id}/`
5. 更新 `openclaw.json` 注册 Agent
6. 有部门则确保 `projects/{department}/` 存在
7. 重启 Gateway

### 聊天协议

WS `ws://127.0.0.1:19100`：`connect+token → hello-ok`；`chat.send + sessionKey + message → chat events (delta/final/error)`。为避 Next.js 打包 `ws` 问题，聊天用独立 Node 子进程（`ui/scripts/gateway-chat.js`）。

## 编码规范

### UI 层
- 所有组件 `'use client'`
- 数据获取通过 `/api/*` 路由，不直接访问 FS
- Tailwind 暗色，图标用 lucide-react
- i18n 所有文案经 `t()`，en.json 和 zh.json 同步
- TypeScript strict，避免 `any`
- CVA 定义变体
- Gateway 调用优先 `gwCallAsync()`（非阻塞）
- Store enrichment 用 `setTimeout(0)` 延迟合并

### core 层
- CJS (.cjs)
- 数据访问通过 `core/repo/`，不直接 `fs.readFileSync`
- 事件用 EventBus fire-and-forget
- LLM 调用必须 retry + circuit breaker
- JSONL 用 `appendFileSync`
- 惰性 require 防循环依赖
- **catch 块必须有 logger 调用，不允许静默吞错**
- 关键操作流程必须 INFO 级别开始/完成日志

### 全局
- 类型在 `entity/`（`.ts` + `.cjs`）
- 新模块通过 `index.cjs` barrel export
- 核心模块用全局单例（EventBus、ConfigRepository、CircuitBreaker、GatewayConnectionPool）

## i18n

默认 `zh`，localStorage key `af-locale`；`const { t, locale, setLocale } = useTranslation()`；`t('dashboard.title')`。新增文案必须同步 en.json + zh.json。

## 日志系统

全局 `core/common/logger.cjs`，四级：ERROR（操作失败）/ WARN（可恢复异常）/ INFO（关键里程碑）/ DEBUG（排查详情）。

- 路径：`data/logs/YYYY-MM-DD.log`，14 天自动清理
- 格式：`[ISO] [LEVEL] [component] message | {JSON}`
- 使用：`logger.info('component-name', '描述', { key: 'value' })`
- UI 通过 `core.common.logger`
- 覆盖 ~200 日志点，所有执行流程

## 关键配置

- **`config/openclaw.json`** — Gateway 核心：模型、Agent 列表、端口、token、插件（Agent CRUD 自动更新）
- **`config/models.json`** — 模型别名：Anthropic opus/sonnet/haiku；MiniMax M2.5/M2.1
- **Agent 模板 `templates/builtin/{id}/template.json`**：`{id,name,description,emoji,category,group,defaults:{model,skills,peers}}`

## Git 约定

**不提交**：`data/`、`.env`、`libs/`、`node_modules/`

**提交规范**：Conventional Commits（`feat:`/`fix:`/`refactor:`/`docs:`）；简洁面向操作；相关改动分组，不捆绑无关重构；Co-Authored-By: `shuanbao <shuanbao0@gmail.com>`（不用 Claude 的）

## 修改代码后的操作流程

UI 代码改动：
```bash
rm -rf ui/.next && lsof -ti:3100 | xargs kill -9 2>/dev/null; cd ui && npm run dev
```
执行过 `npm run build` 后 `.next` 必须清除（dev server 不兼容）；纯热更新不需要。CSS 404 基本都是缓存问题。

**发布新版本（⚠️ 打 tag 前必须先更新版本号）：**
1. bump `package.json` version 字段
2. bump `CLAUDE.md` 顶部「版本: X.Y.Z」
3. `git commit + push` 版本号变更
4. `git tag vX.Y.Z && git push origin vX.Y.Z`
5. GitHub Actions (`.github/workflows/release.yml`) 自动 Release + tarball
6. 其他机器 `agent-factory update`

## 常用运维脚本

```bash
# 注入工具（修改对应 config/*.md 后执行）
node scripts/tools/inject-base-rules.mjs [agentId]
node scripts/tools/inject-project-standards.mjs [dept/slug | --dry-run]
node scripts/tools/cleanup-invalid-outputs.mjs --dry-run

# 迁移预览
node scripts/migrate/migrate-sync-config.mjs --dry-run
node scripts/migrate/migrate-sync-gateway.mjs --dry-run
node scripts/migrate/migrate-data-dir.mjs --dry-run

# 查日志
agent-factory logs [--level=ERROR] [--lines=50] [--no-follow]
```

### OpenClaw Hotfix 补丁

`scripts/patch-openclaw.mjs` 通过 postinstall 自动运行：定位 `node_modules/openclaw`，版本 >= `2026.4.0` 跳过；否则扫描 `dist/**/*.js`，移除 `isReasoningTagProvider` 中的 `minimax` 判断行；幂等。修复上游合并后可删除脚本 + postinstall hook。

## 故障排除

- **Gateway 无法启动** — 检查 `.env` API Key 或 Dashboard Settings 添加 Provider
- **端口被占用** — `agent-factory stop` 或 `lsof -ti:3100 | xargs kill -9`
- **Next.js webpack 错误（`__webpack_modules__`）** — `rm -rf ui/.next && cd ui && npm run dev`
- **ws 模块类型错误** — 已知：`gateway-chat.ts` 的 `ws` import 在 `next build` 类型检查报错，不影响运行时（聊天用子进程）
- **Agent 不可用** — 确认 Gateway 运行 + `openclaw.json` 包含该 Agent
- **Agent 产出写错位置** — 确认 base-rules 注入（`inject-base-rules.mjs`）
- **MiniMax chat 无响应** — OpenClaw 2026.3.7 `enforceFinalTag` 会丢弃 MiniMax 输出；已通过 postinstall 补丁修复。上游 PR：https://github.com/openclaw/openclaw/pull/41115

## 修改 OpenClaw 源码并提交 PR

OpenClaw 源码位于 `/Users/yuanwu/workspace/openclaw`。

### 1. 修改与测试
```bash
cd /Users/yuanwu/workspace/openclaw
git checkout -b fix/分支名
pnpm install    # 首次
pnpm vitest run path/to/test.ts
```

### 2. 提交 PR（无直接 push 权限，需 fork）
```bash
git add <files> && git commit -m "fix: 描述"
gh repo fork openclaw/openclaw --remote=false
git remote add fork https://github.com/shuanbao0/openclaw.git
git push fork fix/分支名
gh pr create --repo openclaw/openclaw --head shuanbao0:fix/分支名 --title "..." --body "..."
```

**CI 注意：**
- `check` job 含 `oxfmt` 格式检查，行太长会失败，需展开多行
- `secrets` job（pnpm-audit-prod）仓库已有问题，所有 PR 失败，维护者会忽略
- 修改 `isReasoningTagProvider` 等记得同步 `src/utils/utils-misc.test.ts` 断言

### 3. 本地测试修改后的 OpenClaw
```bash
cd /Users/yuanwu/workspace/openclaw && pnpm build

# ⚠️ 用 ln -s，不要用 npm link（会破坏 ws 等依赖）
rm -rf /Users/yuanwu/workspace/agent-factory-workspace/node_modules/openclaw
ln -s /Users/yuanwu/workspace/openclaw /Users/yuanwu/workspace/agent-factory-workspace/node_modules/openclaw

lsof -ti:19100 | xargs kill -9 2>/dev/null
npm run gateway

CHAT_INPUT='{"sessionKey":"agent:ceo:test","message":"测试消息"}' node ui/scripts/gateway-chat.js

# 恢复
rm /Users/yuanwu/workspace/agent-factory-workspace/node_modules/openclaw
npm install
```

验证 symlink：`node -e "console.log(require.resolve('openclaw'))"` 应指向本地源码。`npm install` 会覆盖 symlink 恢复 registry 版本。

## 安全

- 切勿提交 `.env` 或任何含 API Key 的文件
- Gateway 内部 Token（`agent-factory-internal-token-2026`）仅本地通信
- Auth profiles 在 `data/openclaw-state/agents/main/agent/auth-profiles.json`（不提交）
