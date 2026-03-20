# Agent Factory 开发指南

## 项目概述

Agent Factory 是一个自包含的多 Agent 协作平台，内置 OpenClaw 引擎，提供 Dashboard UI 进行管理。支持自主 Autopilot 循环、多部门协作、任务质量门、成本追踪与预算管控。

- 版本: 0.4.49
- 仓库: https://github.com/shuanbao0/agent-factory
- 运行时: Node.js >= 22
- 许可: GPL-3.0

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                   Dashboard UI (3100)                        │
│               Next.js 14 + React 18 + Zustand               │
└────────────────────┬────────────────────────────────────────┘
                     │ fetch /api/* (48+ 路由)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  API Routes (Next.js)                        │
│        agents, autopilot, tasks, projects, skills...        │
└────────┬──────────────────────────────┬─────────────────────┘
         │                              │
         ▼                              ▼
┌────────────────────┐    ┌───────────────────────────────────┐
│  Services 层       │    │  core-bridge.ts (CJS↔TS 桥接)     │
│  agent-crud.ts     │───▶│  唯一入口访问 core/ 模块           │
│  autopilot-api.ts  │    └───────────────┬───────────────────┘
│  task-api.ts       │                    │ require()
└────────────────────┘                    ▼
         │              ┌─────────────────────────────────────┐
         │              │           core/ (CJS)                │
         │              │  repo → task → llm → observe → agent │
         │              │  autopilot → common                  │
         │              └────────────────┬────────────────────┘
         │                               │
         ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│            OpenClaw Gateway (19100) — LLM 路由引擎           │
│  多 LLM 路由 (Anthropic/MiniMax/OpenAI/DeepSeek)            │
│  Memory 搜索 + Session 持久化 + Token 计数                   │
└─────────────────────────────────────────────────────────────┘
```

## 设计模式与代码原则

### 核心设计模式

| 模式 | 应用位置 | 说明 |
|------|----------|------|
| **Repository Pattern** | `core/repo/` | BaseRepository 抽象 JSON 文件 I/O，带 TTL 缓存（30s）+ 原子写入（tmp+rename） |
| **State Machine** | `core/task/state-machine.cjs` | 任务状态转换表：pending→assigned→in_progress→review→completed/failed/rework |
| **Strategy Pattern** | `core/task/strategy.cjs` | 8 种任务类型策略（writing/coding/research...），各有不同超时、分数阈值 |
| **Observer/Pub-Sub** | `core/observe/event-bus.cjs` | EventBus 继承 EventEmitter，fire-and-forget 语义 + JSONL 持久化 |
| **Circuit Breaker** | `core/llm/retry.cjs` | 三态断路器（CLOSED→OPEN→HALF_OPEN），防止 LLM 级联失败 |
| **Connection Pool** | `core/llm/gateway-pool.cjs` | 单 WebSocket 连接复用，惰性连接 + 自动重连 + 心跳保活 |
| **Dependency Injection** | `core/task/quality-orchestrator.cjs` | 注入 sendFn、readAgentActivity 等，解耦质量门与 Gateway 实现 |
| **Facade Pattern** | `ui/src/lib/task-storage.ts` 等 | UI 层薄包装器，保留旧接口签名但委托给 core |
| **Marker-based Injection** | `ui/src/lib/base-rules.ts` | HTML 注释标记实现幂等注入，支持反复执行不重复 |

### 代码编写原则

#### 简洁与逻辑

1. **最小必要复杂度**：只写当前需求所需的代码，三行相似代码优于一个过早抽象。不为假设性的未来需求设计
2. **不过度工程化**：不添加未要求的功能、重构、注释、docstring、类型注解。bug 修复不需要顺手清理周围代码
3. **不添加冗余防御**：不为不可能发生的场景添加错误处理/回退/校验。只在系统边界（用户输入、外部 API）做校验，信任内部代码和框架保证
4. **删除即删除**：确认无用的代码直接删除，不留 `_unused` 变量、`// removed` 注释、re-export 兼容 shim
5. **单一职责**：模块级——每个 core/ 子目录只负责一个领域（repo 只管数据访问、task 只管状态机、observe 只管可观测性）；函数级——每个函数只做一件事，逻辑线性，复杂条件拆成命名清晰的子函数而非嵌套 if-else；文件级——一个文件围绕一个概念（如 `quality-gate.cjs` 只管质量门 FSM，不混入任务创建逻辑）
6. **命名即文档**：变量名和函数名应自解释意图，减少注释依赖。只在逻辑不自明处（如 workaround、业务规则）加注释

#### 架构与分层

7. **业务逻辑集中在 core/**：UI 层不含业务逻辑，所有持久化/决策/校验在 core/ 中完成
8. **Entity 是类型单一真相源**：`entity/` 目录定义所有 TypeScript 接口和常量（同时提供 `.ts` 和 `.cjs` 双格式），core/ 和 UI 都从这里引用
9. **CJS↔TS 桥接隔离**：`core-bridge.ts` 是 UI 访问 core/ 的唯一入口，用 `createRequire` 绕过 webpack 静态分析
10. **新模块通过 barrel export 暴露**：每个 core/ 子目录的 `index.cjs` 统一导出，`core/index.cjs` 按命名空间聚合

#### 可靠性

11. **Fire-and-forget 容错**：EventBus 监听器错误不影响主流程；TaskBridge 的 Dashboard API 调用失败不阻塞 Autopilot
12. **幂等操作**：所有迁移脚本、base-rules 注入、技能 symlink 同步均可重复执行
13. **原子服务操作**：`createAgent()` 一次完成 6 步（建文件→注入规则→注册配置→建工作空间→创建项目→重启 Gateway），无中间态
14. **惰性依赖加载**：circular dependency 用 lazy require 预防（如 `budget.cjs`）
15. **JSONL Append-Only**：成本和事件日志用 JSONL 追加写，避免 read-modify-write 竞争

## 项目结构

```
agent-factory/
├── entity/                # 实体定义层（TypeScript 类型 + 常量，单一真相源）
│   ├── task/              # Task 状态机常量、接口、质量门类型
│   ├── agent/             # Agent/AgentMeta/AgentTemplate 接口
│   ├── dept/              # Department 配置、工作流、运行状态类型
│   ├── config/            # OpenClawConfig、GatewayConfig 接口
│   ├── autopilot/         # AutopilotState 接口
│   ├── observe/           # Budget、Cost 接口
│   ├── project/           # ProjectMeta 接口
│   └── ui/                # UI 专用类型
├── core/                  # 核心业务模块（CJS，唯一的业务逻辑源）
│   ├── repo/              # Repository Pattern — 数据访问层
│   ├── task/              # State Machine + Strategy — 任务生命周期
│   ├── llm/               # LLM 通信与决策引擎
│   ├── observe/           # 可观测性 — Event Bus + Cost + Budget + KPI
│   ├── agent/             # Agent 记忆管理
│   ├── autopilot/         # Autopilot 自主循环（CEO + 部门循环）
│   └── common/            # 通用工具（validators, task-bridge, autopilot-state）
├── ui/                    # Next.js Dashboard（详见下方）
├── agents/                # Agent 核心定义（运行时创建，不提交）
├── workspaces/            # Agent 产出空间（不提交）
├── projects/              # 项目级共享空间（按 department 分目录，不提交）
├── bin/
│   └── agent-factory.mjs  # CLI 入口（start/stop/update/doctor 等命令）
├── config/
│   ├── openclaw.json      # Gateway 配置（端口、模型、插件、Agent 列表）
│   ├── models.json        # 模型别名定义（Anthropic/MiniMax）
│   ├── base-rules.md      # 全局强制注入规则（三段：AGENTS_RULES/SOUL_RULES/REMINDER）
│   ├── autopilot-state.json # Autopilot 运行状态
│   ├── departments.json   # 部门注册表
│   ├── departments/       # 按部门的 config.json + state.json
│   ├── budget.json        # 全局预算配置
│   ├── autopilot-costs.jsonl  # 成本审计日志（append-only）
│   └── autopilot-events.jsonl # 事件审计日志（append-only）
├── templates/
│   ├── builtin/           # 内置 Agent 模板（65 个角色）
│   └── custom/            # 用户自定义模板（不提交）
├── skills/                # 共享技能（project-init、peer-status、task-api 等）
├── scripts/               # 运维与迁移脚本
├── docs/                  # 项目文档（BLUEPRINT、PLAN、设计稿）
├── libs/                  # 本地库（openclaw 源码，不提交）
├── .env                   # API Key 等敏感配置（不提交）
├── .env.example           # 环境变量模板
├── package.json           # 根依赖 + bin 定义
└── BLUEPRINT.md           # 架构蓝图
```

## 各模块详解

### entity/ — 实体定义层

项目所有 TypeScript 类型和常量的单一真相源。每个子模块同时提供 `.ts`（供 UI）和 `.cjs`（供 core）两种格式。

| 模块 | 关键导出 |
|------|----------|
| `task/` | `STATUSES`, `TRANSITIONS`, `TERMINAL`, `canTransition()`, `Task`, `TaskQuality`, `PipelineStep` |
| `agent/` | `Agent`, `AgentMeta`, `AgentTemplate`, `AgentConfigEntry` |
| `dept/` | `DepartmentConfig`, `DepartmentWorkflow`, `DepartmentLoopState`, `DEFAULT_DEPT_STATE` |
| `config/` | `OpenClawConfig`, `GatewayConfig` |
| `autopilot/` | `AutopilotState` |
| `observe/` | `CompanyBudget`, `CostEntry`, `DailyCostSummary` |
| `project/` | `ProjectMeta` |

### core/repo/ — 数据访问层（Repository Pattern）

所有持久化数据通过 Repository 访问，屏蔽文件 I/O 细节。

| Repository | 管理数据 | 缓存 TTL |
|------------|----------|----------|
| `BaseRepository` | 抽象基类：JSON 文件读写 + TTL 缓存 + 原子写入（tmp+rename） | 可配置 |
| `ConfigRepository` | `config/openclaw.json` — Gateway 配置 + Agent 注册 | 30s |
| `TaskRepository` | `config/tasks.json` + `projects/{id}/.project-meta.json` — 独立/项目任务 | 0（API 实时） |
| `SessionRepository` | `.openclaw-state/` — Session token 用量 | 0 |
| `DeptConfigRepository` | `config/departments/{id}/config.json` — 部门策略 | 30s |
| `DeptStateRepository` | `config/departments/{id}/state.json` — 部门运行时状态 | 30s |
| `MissionRepository` | `config/mission.md` / `config/departments/{id}/mission.md` | 0 |
| `AgentMetaRepository` | `agents/{id}/agent.json` — Agent 元数据 | 0 |
| `ProjectMetaRepository` | `projects/{id}/.project-meta.json` — 项目元数据 | 0 |

### core/task/ — 任务生命周期（State Machine + Strategy + Quality Gate）

| 模块 | 职责 |
|------|------|
| `state-machine.cjs` | 状态转换验证（引用 entity/task 常量），记录转换历史（actor, reason, timestamp） |
| `strategy.cjs` | 8 种内置策略（writing/editing/worldbuilding/character/plotting/coding/analysis/research），定义 idleThresholdMins、staleThresholdMins、minPassingScore、preferredReviewers |
| `quality-gate.cjs` | 三阶段质量门 FSM：self_checking → peer_reviewing → head_approving → done，每阶段在独立 Autopilot 周期运行 |
| `quality-validator.cjs` | 质量校验规则（格式、必填字段） |
| `quality-orchestrator.cjs` | 质量门编排器（DI：注入 sendFn、readAgentActivity、loadDeptConfig） |
| `auto-transition.cjs` | 基于 idle 时间的自动状态转换（idle > 18min → auto-complete，idle > 30min → auto-fail） |

**任务状态机：**
```
pending → assigned → in_progress → review → completed
                  ↘          ↗         ↘
                   rework  ←──────────  failed
```

### core/llm/ — LLM 通信与决策

| 模块 | 职责 |
|------|------|
| `anthropic-client.cjs` | Anthropic SDK 封装（tool-use），支持 `sendWithTools()` |
| `gateway-pool.cjs` | 持久 WebSocket 连接池（单连接复用），惰性连接 + 自动重连 + 心跳 + idle 超时 |
| `retry.cjs` | 指数退避重试 + 三态断路器（CLOSED→OPEN→HALF_OPEN） |
| `directive-builder.cjs` | Prompt 组合：`buildDirective()`、`buildDepartmentDirective()` |

### core/observe/ — 可观测性

| 模块 | 职责 |
|------|------|
| `event-bus.cjs` | Pub-Sub 事件系统（继承 EventEmitter），自动时间戳 + JSONL 持久化，错误隔离 |
| `cost-tracker.cjs` | Token→USD 成本计算，JSONL 追加写入 `autopilot-costs.jsonl` |
| `budget.cjs` | 按部门每日 Token 预算执行：`checkBudget()` + `trackTokenUsage()` |
| `kpi.cjs` | 部门 KPI 计算：成功率、平均延迟、产出质量 |
| `stall-detector.cjs` | 任务/部门停滞检测 |
| `scheduler.cjs` | 周期调度器 |
| `adaptive-timer.cjs` | 基于历史模式的动态超时调整 |
| `signal-watcher.cjs` | OS 信号处理（优雅关闭） |
| `reactors/` | 事件监听器注册：cost-alert（成本阈值告警）、cycle-monitor（周期追踪） |

### core/autopilot/ — 自主循环引擎

Autopilot 是 Agent Factory 的核心自动化机制，包含 CEO 协调循环和部门执行循环。

| 模块 | 职责 |
|------|------|
| `orchestrator.cjs` | CEO 协调循环（默认 30min/次）：buildMemoryContext → sendToCeo → syncProjects → 触发部门循环 |
| `department-loop.cjs` | 部门执行循环（默认 10min/次）：buildDirective → sendToAgent(chief) → parseTaskAssignments → autoTransitionTasks → processQualityGate |
| `gateway-client.cjs` | Agent WebSocket 通信：sendToAgent、sendToCeo、compactSession、queryAgentStatus |
| `directive.cjs` | CEO 指令构建 |
| `dept-directive.cjs` | 部门 Chief 指令构建 |
| `sync.cjs` | 项目状态同步（根据 CEO 信号更新阶段/状态） |
| `task-prompt.cjs` | 任务上下文：`buildTaskContext()` 轻量增强（已接入 department-loop）+ `buildTaskPrompt()` 完整自包含 prompt |
| `dept-activity.cjs` | 部门活动追踪 |
| `constants.cjs` | 共享常量（超时、重试、轮询间隔） |
| `logger.cjs` | 结构化日志 |

**Autopilot 执行流程：**
```
CEO 协调周期 (30min)
  ├─ buildMemoryContext() + buildDirective()
  ├─ sendToCeo() → WebSocket → Gateway
  ├─ eventBus.fire('cycle.start')
  ├─ syncProjects() — 阶段推进
  └─ 触发各部门循环

部门执行周期 (10min/部门)
  ├─ buildDepartmentDirective() + memory
  ├─ sendToAgent(chief) → WebSocket
  ├─ parseTaskAssignments + parseTaskCompletions
  ├─ autoTransitionTasks()
  │   ├─ checkBudget()
  │   ├─ queryAgentStatus() → 双 Session 模式（查 :main）
  │   ├─ idle > 18min → auto-complete
  │   ├─ idle > 30min → auto-fail
  │   └─ processQualityGate() — 三阶段评审
  ├─ trackTokenUsage() → cost-tracker
  └─ eventBus.fire() → Reactors

任务执行（双 Session 架构，由 Agent 自主驱动）
  ├─ Chief peer-send [Task: task-xxx] → Agent :main session
  ├─ Agent 遵循 base-rules 任务执行协议:
  │   ├─ sessions_spawn(mode: "run") → 创建 worker 子会话
  │   ├─ :main 保持响应 → 回复 [系统查询] STATUS: working
  │   └─ worker 完成 → auto-announce → Agent 调 API 更新状态
  └─ Worker 子会话由 Gateway 自动回收（mode:"run" 结束即终结）
```

### core/agent/ — Agent 记忆管理

| 模块 | 职责 |
|------|------|
| `memory.cjs` | 构建记忆上下文：`buildMemoryContext(agentId, cycleType)` → {summary, recentDecisions, lessonsLearned}；从 `agents/{id}/memory/` 读取 |

### core/common/ — 通用工具

| 模块 | 职责 |
|------|------|
| `task-bridge.cjs` | Dashboard API 客户端（fire-and-forget HTTP），用于 Autopilot 同步任务状态到 UI |
| `autopilot-state.cjs` | 管理 `config/autopilot-state.json`（PID、周期计数） |
| `validators.cjs` | 通用配置校验 |
| `config-validator.cjs` | 配置结构验证 |
| `agent-service.cjs` | Agent 元数据服务 |
| `department-service.cjs` | 部门生命周期管理（创建/更新/删除） |
| `project-service.cjs` | 项目生命周期 + Token 用量聚合 |
| `file-browser.cjs` | 安全目录遍历 + workspace 管理 |
| `skill-utils.cjs` | 技能元数据解析 + TOOLS.md 生成 |
| `skill-symlinks.cjs` | 技能 symlink 同步（幂等） |
| `base-rules-injector.cjs` | Base-rules 解析与幂等注入 |
| `models-service.cjs` | models.json ↔ openclaw.json 同步 |
| `env-manager.cjs` | .env 文件读写 |
| `event-relay.cjs` | SSE 事件转发 |

### UI 目录结构（`ui/`）

```
ui/src/
├── app/                   # Next.js App Router
│   ├── api/               # API 路由（48+ 端点）
│   │   ├── agents/        # Agent CRUD、chat、sessions、skills、deploy、permissions
│   │   ├── gateway/       # start/stop/restart/status
│   │   ├── projects/      # 项目 CRUD + 文件浏览
│   │   ├── tasks/         # 任务 CRUD + 质量门 + 批量操作
│   │   ├── autopilot/     # Autopilot 控制 + 部门循环管理
│   │   ├── skills/        # 技能安装管理
│   │   ├── models/        # 模型配置 + 测试
│   │   ├── departments/   # 部门配置
│   │   ├── costs/         # 成本追踪
│   │   ├── budget/        # 预算管理
│   │   ├── events/        # SSE 事件流
│   │   ├── platform/      # 平台更新（check/update）
│   │   └── ...            # health, logs, usage, env, templates, sessions, messages, workspaces
│   ├── agents/            # Agent 管理页
│   ├── projects/          # 项目页
│   ├── skills/            # 技能商店页
│   ├── messages/          # 消息中心
│   ├── logs/              # 日志监控页
│   ├── settings/          # 设置页（Provider、Gateway、模型、平台更新）
│   ├── setup/             # 初始配置向导
│   ├── layout.tsx         # 根布局
│   └── page.tsx           # Dashboard 首页
├── components/            # React 组件（70+）
│   ├── ui/                # 基础 UI（Card、Badge、Button、Dialog 等）
│   ├── layout-shell.tsx   # 主布局壳（sidebar + content）
│   ├── sidebar.tsx        # 导航侧边栏
│   ├── data-provider.tsx  # SSE 连接 + 轮询初始化
│   ├── gateway-guard.tsx  # Gateway 访问守卫（当前透传）
│   ├── agent-form.tsx     # Agent 创建/编辑表单
│   ├── agent-card.tsx     # Agent 列表卡片
│   ├── agent-graph.tsx    # Agent 网络关系图
│   ├── template-picker.tsx # 模板选择器
│   ├── autopilot-card.tsx # Autopilot 控制面板
│   ├── department-loop-card.tsx # 部门循环控制
│   ├── task-card.tsx      # 任务卡片
│   ├── task-pipeline.tsx  # 流水线可视化
│   ├── task-quality.tsx   # 质量门 UI
│   ├── mission-editor.tsx # Mission 编辑器
│   ├── budget-dashboard.tsx # 预算仪表板
│   ├── token-chart.tsx    # Token 用量图表（Recharts）
│   ├── comm-matrix.tsx    # Agent 通信矩阵
│   ├── pixel-office/      # 像素风办公室可视化
│   └── ...
├── services/              # 服务层（API 路由 → 服务委托）
│   ├── agent-crud.ts      # Agent 创建/更新/删除全流程（原子操作）
│   ├── autopilot-api.ts   # Autopilot 进程管理（spawn/kill）+ 状态查询
│   └── task-api.ts        # 任务 CRUD + 质量门触发 + 流水线任务生成
├── lib/                   # 核心库
│   ├── core-bridge.ts     # CJS↔TS 桥接（core/ 的唯一访问入口）
│   ├── store.ts           # Zustand 全局状态 + SSE + 轮询 + Tab 可见性优化
│   ├── gateway-manager.ts # Gateway 进程管理（spawn/kill/status）
│   ├── gateway-client.ts  # Gateway CLI 调用封装（gwCall / gwCallAsync）
│   ├── gateway-chat.ts    # WebSocket 聊天协议（独立子进程）
│   ├── base-rules.ts      # Base-rules 解析与幂等注入（marker 机制）
│   ├── task-storage.ts    # 任务存储 Facade（委托 core.repo.taskRepo）
│   ├── quality-gate.ts    # 质量门 Facade（委托 core.task）
│   ├── department-workflow.ts # 部门工作流配置
│   ├── data-fetchers.ts   # 异步数据获取（gwCallAsync 非阻塞）
│   ├── skill-symlinks.ts  # 技能 symlink 同步
│   ├── event-relay.ts     # SSE 事件广播
│   ├── autopilot-shared.ts # Autopilot 状态配置辅助
│   ├── i18n.ts            # i18n（zh/en，localStorage 持久化）
│   ├── providers.ts       # AI Provider 定义（15+ 供应商）
│   ├── template-meta.ts   # 模板读取
│   ├── clawhub.ts         # ClawHub 技能市场 CLI 封装
│   ├── types.ts           # TypeScript 类型定义（从 entity/ 重导出）
│   └── utils.ts           # 工具函数
├── locales/               # 翻译文件
│   ├── en.json
│   └── zh.json
└── styles/globals.css     # Tailwind + 自定义样式（暗色主题）
```

### scripts/ — 运维与迁移脚本

| 脚本 | 用途 | 设计特点 |
|------|------|----------|
| `start.mjs` | 统一启动 Dashboard + Gateway | 后台 spawn + PID 文件 |
| `autopilot.cjs` | Autopilot 入口（委托 core/autopilot） | detached 进程 |
| `inject-base-rules.mjs` | 注入 base-rules 到 Agent | 幂等 marker 机制 + `--dry-run` |
| `migrate-sync-builtin.mjs` | 同步内置模板到已有 Agent | peers/skills/AGENTS.md 对齐 |
| `migrate-sync-config.mjs` | 同步部门配置 | `AF_UPDATE_DIR` 支持 + 智能合并 |
| `migrate-sync-gateway.mjs` | 同步 openclaw.json + models.json | 深度合并，保留用户值 |
| `patch-openclaw.mjs` | postinstall 自动补丁 | 幂等，版本 >= 2026.4.0 自动跳过 |

### templates/builtin/ — 内置 Agent 模板

每个模板包含 4 个文件：`template.json`（元数据 + 默认配置）、`AGENTS.md`（行为定义）、`SOUL.md`（人格定义）、`IDENTITY.md`（简介）。

角色覆盖（65 个模板）：
- **高管层**：CEO、COO、CFO、Chief Scientist
- **管理层**：PM、Sales Director、Legal Director、BD、CSM、Presales、Service Manager
- **运营层**：Accountant、Contract Specialist、Compliance Officer、Content Ops、Growth Ops、Support Agent
- **创意层**：Designer、Content Creator、Brand Director、Anime Director、Art Director、Visual Editor、Post Producer、Sound Director、Storyboard Artist、Animation Supervisor、Script Adapter
- **技术层**：Backend、Frontend、Data Engineer、Code Instructor、AI Researcher、Execution Engineer、Tester
- **小说创作**：Novel Chief、Novel Writer、Novel Researcher、Worldbuilder、Character Designer、Plot Architect、Pacing Designer、Continuity Manager、Style Editor、Reader Analyst
- **量化金融**：Quant Chief、Quant Developer、Quant Researcher、Cost Analyst、Risk Manager、Market Analyst Crypto、Strategy Optimizer
- **教程创作**：Tutorial Chief、Tutorial Researcher、Tutorial Reviewer、Tutorial Writer
- **研究分析**：Researcher、Analyst、Writer、Marketing、Product、PR Specialist、Innovation Analyst

### skills/ — 共享技能库

| 技能 | 用途 |
|------|------|
| `project-init` | 项目脚手架（vite/express/fullstack 模板）+ `.project-meta.json` |
| `peer-status` | 查询 peer Agent 状态 + 跨 Agent 消息 |
| `task-api` | 任务 CRUD + 质量门集成 |
| `find-skills` | 从 ClawHub 市场发现技能 |
| `skill-creator` | 自定义技能脚手架向导 |
| `wechat-mp-cn` | 微信小程序集成 |

## 关键数据结构

### Task（任务）

```typescript
interface Task {
  id: string
  name: string
  status: 'pending' | 'assigned' | 'in_progress' | 'review' | 'completed' | 'failed' | 'rework'
  priority: 'P0' | 'P1' | 'P2'
  assignees: string[]
  assignedAgent?: string
  creator: 'user' | string
  progress: number
  projectId?: string | null
  phase?: number
  type?: string
  quality?: TaskQuality          // 自检/同行评审/主管审批结果
  reworkCount?: number
  dependencies: string[]
  output?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}
```

### DepartmentConfig（部门配置）

```typescript
interface DepartmentConfig {
  id: string
  name: string
  head: string                   // 部门 Chief Agent ID
  interval: number               // 循环间隔（秒）
  enabled: boolean
  agents: string[]               // 部门成员 Agent ID 列表
  budget?: { dailyTokenLimit: number; alertThreshold: number }
  kpis?: Record<string, { target: number; unit: string }>
  workflow?: DepartmentWorkflow  // 阶段、任务类型、流水线
}
```

### DepartmentLoopState（部门运行状态）

```typescript
interface DepartmentLoopState {
  status: 'running' | 'stopped' | 'cycling' | 'idle' | 'error'
  pid: number | null
  cycleCount: number
  lastCycleAt: string | null
  history: Array<{ cycle, startedAt, completedAt, elapsedSec, result }>
  tokensUsedToday: number
  budgetResetAt: string | null
}
```

## 关键文件 I/O 一览

| 文件 | 用途 | 模式 |
|------|------|------|
| `config/openclaw.json` | Gateway 配置 + Agent 注册 | ConfigRepository (30s 缓存) |
| `config/departments/{id}/config.json` | 部门策略 | DeptConfigRepository (30s 缓存) |
| `config/departments/{id}/state.json` | 部门运行时状态 | DeptStateRepository (30s 缓存) |
| `config/tasks.json` | 独立任务 | TaskRepository (实时) |
| `projects/{id}/.project-meta.json` | 项目元数据 + 任务 | TaskRepository (实时) |
| `config/autopilot-state.json` | Autopilot 进程状态 | AutopilotState (实时) |
| `config/autopilot-costs.jsonl` | 成本审计日志 | CostTracker (append-only) |
| `config/autopilot-events.jsonl` | 事件审计日志 | EventBus (append-only) |
| `config/budget.json` | 全局预算 | Budget (实时) |
| `agents/{id}/memory/` | Agent 记忆 | MemoryManager (实时) |

## 技术栈

| 层 | 技术 |
|----|------|
| UI 框架 | Next.js 14 (App Router) + React 18 |
| 状态管理 | Zustand 4.5 + SSE 推送 + 轮询降级 |
| 样式 | Tailwind CSS 3.4（暗色主题）+ clsx + tailwind-merge + CVA |
| 图标 | lucide-react |
| 图表 | Recharts |
| 语言 | TypeScript 5.3（strict 模式） |
| 路径别名 | `@/*` → `./src/*`，`@entity/*` → `../entity/*` |
| Gateway 引擎 | OpenClaw（npm 依赖，本地运行） |
| 核心模块 | CommonJS (.cjs) — Node.js require 生态兼容 |
| 运行时 | Node.js >= 22 |

## CLI 命令（`agent-factory`）

安装后可全局使用 `agent-factory` 命令（通过 `package.json` bin 字段 + `install.sh` 注册）：

```bash
agent-factory start            # 启动 Dashboard + Gateway（后台，PID 追踪）
agent-factory stop             # 停止所有服务（级联 SIGTERM）
agent-factory restart          # 重启
agent-factory status           # 查看运行状态（端口、PID、版本）
agent-factory logs             # 实时查看日志（tail -f）
agent-factory update           # 自动升级到最新版本（原子更新）
agent-factory version          # 显示版本号
agent-factory doctor           # 检查环境（Node、依赖、配置、目录）
```

`agent-factory update` 流程（原子更新）：
1. 查询 GitHub 最新 release → 停止服务
2. 下载 tarball → rsync 覆盖代码（保留 agents/、projects/、templates/custom/、.env、openclaw.json）
3. npm install（root + ui）
4. 运行 migrate-\*.mjs 迁移脚本（通过 `AF_UPDATE_DIR` 传入 tmpDir）
5. 重新注入 base-rules → 清理 tmpDir → 提示重启

也可通过 Dashboard Settings 页面的「Agent Factory 更新」卡片触发（`/api/platform/update`）。

## 构建与运行命令

```bash
# 安装依赖
npm install                    # 根目录（安装 openclaw 引擎）
cd ui && npm install           # UI 依赖

# 启动（推荐）
agent-factory start            # 或 npm start
npm start                      # 同时启动 Dashboard (3100) + Gateway (19100)

# 分别启动
npm run ui                     # 仅 Dashboard（cd ui && npm run dev）
npm run gateway                # 仅 Gateway

# UI 开发
cd ui
npm run dev                    # 开发服务器 http://localhost:3100
npm run build                  # 生产构建
npm run lint                   # ESLint 检查
```

## 测试

使用 Node.js 内置 `node:test` + `node:assert/strict`，无外部测试框架依赖。

### 测试分层

| 层 | 目录 | 文件数 | 说明 |
|----|------|--------|------|
| 单元测试 | `tests/core/` | 54 | mock 隔离，按 core/ 子模块对应（agent/autopilot/common/llm/observe/repo/task） |
| 接口测试 | `tests/interfaces/` | 21 | 真实文件 I/O，验证 Repository（`repo-*`）+ Service（`svc-*`）层契约 |
| 流程测试 | `tests/flows/` | 8 | mock Gateway，验证跨模块业务流程（任务生命周期、质量门流水线、预算追踪等） |
| E2E 测试 | `tests/e2e/` | 7 | 真实 LLM 调用（MiniMax），需 Gateway 运行 + `TEST_LLM=1` |

### 运行命令

```bash
npm test                      # 单元 + 流程 + 接口（不调 LLM，日常开发用）
npm run test:unit             # 仅单元测试
npm run test:interfaces       # 仅接口测试
npm run test:flows            # 仅流程测试
npm run test:e2e              # 仅 E2E（需 Gateway 运行 + TEST_LLM=1）
npm run test:all              # 全部（含 E2E）
```

### 测试 Helper

| 目录 | 模块 | 用途 |
|------|------|------|
| `tests/e2e/_helpers/` | `env-loader.cjs` | Gateway 检测 + API Key 检查 + `shouldSkip()` 优雅跳过 |
| | `cleanup.cjs` | 测试数据清理（tasks.json 截断、JSONL 截断） |
| `tests/flows/_helpers/` | `mock-gateway.cjs` | mock sendFn + mock agent activity |
| | `mock-repos.cjs` | MockConfigRepository、MockTaskRepository 等 stub |
| | `test-context.cjs` | `createTestContext()` 组装完整测试上下文 |

### 编写规范

- 文件格式：CJS（`.test.cjs`），与 core/ 保持一致
- 命名约定：`tests/{层}/{模块名}.test.cjs`，接口层用 `repo-*` / `svc-*` 前缀区分 Repository 和 Service
- E2E 测试必须在顶部调用 `shouldSkip()` 检查环境，无 Gateway 或无 API Key 时优雅跳过
- 流程测试通过 `_helpers/test-context.cjs` 注入 mock 依赖，不依赖真实 Gateway

## 端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Dashboard | 3100 | Next.js 开发服务器 |
| Gateway | 19100 | OpenClaw WebSocket Gateway |

可通过环境变量 `OPENCLAW_GATEWAY_PORT` 覆盖 Gateway 端口。

## 环境变量

参见 `.env.example`：

| 变量 | 必填 | 说明 |
|------|------|------|
| `ANTHROPIC_API_KEY` | 至少一个 | Anthropic API Key |
| `OPENAI_API_KEY` | 可选 | OpenAI API Key |
| `DEEPSEEK_API_KEY` | 可选 | DeepSeek API Key |
| `OPENCLAW_GATEWAY_PORT` | 否 | 自定义 Gateway 端口（默认 19100） |
| `AGENT_FACTORY_DIR` | 否 | 项目根目录（自动检测） |
| `AGENT_FACTORY_TOKEN` | 否 | 内部通信 Token（默认 `agent-factory-internal-token-2026`） |
| `AF_UPDATE_DIR` | 否 | update 时自动设置，指向新版 tmpDir，migrate 脚本用来读取 incoming config |

## 架构核心概念

### 数据流

```
UI 组件 → Zustand Store → fetch /api/* → Services → core-bridge → core/ → 文件 I/O
                ↑                                                            │
                └──── SSE 推送 / 轮询降级 ←─────────────────────────────────────┘

Autopilot:
orchestrator → gateway-client → WebSocket → OpenClaw Gateway → LLM APIs
     ↓              ↑
 core/repo     core/observe (EventBus + CostTracker + Budget)
```

### 轮询机制（DataProvider）

| 数据 | 间隔 | 说明 |
|------|------|------|
| Health | 15s | Gateway 健康状态 |
| Agents | 10s | Agent 列表 + 状态 |
| Logs | 5s | 日志流 |
| Usage | 30s | Token 用量统计 |

优化：Tab 不可见时暂停轮询，SSE 可用时优先使用推送。

### Gateway 状态

`getStatus()` 返回值：`'running'` | `'stopped'` | `'starting'` | `'no-key'` | `'error'`

### 双目录架构（agents/ vs workspaces/）

Agent 的核心定义与工作产出严格分离：

| 目录 | 用途 | 内容 |
|------|------|------|
| `agents/{id}/` | 核心定义 | AGENTS.md, SOUL.md, IDENTITY.md, MEMORY.md, memory/, skills/, agent.json |
| `workspaces/{id}/` | 产出空间 | 文档、代码、分析报告等一切工作产出 |

- `config/openclaw.json` 的 workspace 字段指向 `agents/{id}/`（Gateway 从这里读取 Agent 定义）
- `config/base-rules.md` 中的规则强制 Agent 把产出写到 `workspaces/{id}/`
- `projects/{department}/` 是按部门划分的共享空间，所有同部门 Agent 可读写

### 双 Session 架构（Chat + Worker）

每个 Agent 运行时有两类 Session，由 `base-rules.md` 的「任务执行协议」定义：

| Session | 创建者 | 用途 | 生命周期 |
|---------|--------|------|----------|
| `:main` (Chat) | Gateway 自动 | 接收指令、响应状态查询、汇报完成 | 持久，系统被动清理（50k compact / 80k kill） |
| Worker 子会话 | Agent 自己 (`sessions_spawn`) | 实际执行任务、写入产出 | 临时，Gateway `mode:"run"` 完成即回收 |

**任务执行流程：**
1. Chief 通过 `peer-send` 发送 `[Task: task-xxx]` 指令 → Agent 的 `:main` session
2. Agent 遵循 base-rules，调用 `sessions_spawn(mode: "run", agentId: 自己)` 创建 worker 子会话
3. Worker 子会话在隔离环境中执行任务，产出写入 `workspaces/{id}/`
4. `:main` 保持响应——收到 `[系统查询]` 立即回复 `STATUS: working/completed/idle`
5. Worker 完成 → `auto-announce` → Agent 在 `:main` 调用任务 API 更新状态
6. Worker 子会话由 Gateway 自动回收

**状态查询（`queryAgentStatus`）发到 `:main`** 而非 worker——因为 `:main` 始终响应，worker 在 Gateway 内部运行、外部无法直接查询。

### Base-Rules 注入机制

`config/base-rules.md` 包含三段（`## AGENTS_RULES` / `## SOUL_RULES` / `## REMINDER`），通过 `ui/src/lib/base-rules.ts` 的 marker 机制幂等注入到每个 Agent 的 AGENTS.md 和 SOUL.md 中。

- Agent 创建/更新时自动注入（`injectBaseRulesForAgent()`）
- 手动批量重新注入：`node scripts/inject-base-rules.mjs`
- 单个 Agent 注入：`node scripts/inject-base-rules.mjs novel-chief`
- `agent-factory update` 会自动重新注入

修改 `config/base-rules.md` 后必须执行 `node scripts/inject-base-rules.mjs` 使规则生效。

### Agent 创建流程

1. 用户选择模板（builtin/custom）
2. `POST /api/agents` → 创建 `agents/{id}/agent.json` + `AGENTS.md` + `TOOLS.md` + 记忆基础设施
3. 注入 base-rules 到 AGENTS.md 和 SOUL.md
4. 创建 `workspaces/{id}/`（空产出目录）
5. 更新 `config/openclaw.json` 注册 Agent（workspace 指向 `agents/{id}/`）
6. 如果 Agent 有 department，自动创建/更新 `projects/{department}/`
7. 重启 Gateway 加载新 Agent

### 聊天协议

WebSocket 连接 `ws://127.0.0.1:19100`，帧协议：
1. `connect` + token → `hello-ok`
2. `chat.send` + sessionKey + message → `chat` events (delta/final/error)

为避免 Next.js webpack 打包 `ws` 模块的问题，聊天使用独立 Node 子进程（`ui/scripts/gateway-chat.js`）。

## 编码规范

### UI 层

- 所有 UI 组件使用 `'use client'` 指令（客户端组件）
- 数据获取通过 `/api/*` 路由，不直接在客户端访问文件系统
- 使用 Tailwind 暗色主题，颜色变量定义在 `globals.css`
- 响应式布局：`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- 图标使用 lucide-react，不使用其他图标库
- i18n：所有用户可见文案必须经过 `t()` 翻译函数，同时更新 `en.json` 和 `zh.json`
- TypeScript strict 模式，避免 `any`
- 组件变体使用 CVA（class-variance-authority）
- Gateway 调用优先使用 `gwCallAsync()`（非阻塞），避免 `gwCall()`（阻塞）
- Store enrichment 用 `setTimeout(0)` 延迟合并，避免阻塞事件循环

### core 层

- 使用 CommonJS (.cjs) 格式，确保 Node.js require 兼容
- 所有数据访问通过 `core/repo/` Repository，不直接 `fs.readFileSync`
- 事件用 EventBus fire-and-forget，监听器错误不影响主流程
- LLM 调用必须通过 retry + circuit breaker 包装
- JSONL 日志用 `fs.appendFileSync()`，避免 read-modify-write 竞争
- 惰性 require 预防循环依赖

### 全局

- 类型定义放 `entity/`，同时提供 `.ts` 和 `.cjs` 格式
- 常量放 `entity/`，core/ 和 UI 统一引用
- 新增模块通过 `index.cjs` barrel export 暴露
- 核心模块用全局单例（EventBus、ConfigRepository、CircuitBreaker、GatewayConnectionPool）

## i18n 系统

- 默认语言：`zh`（中文）
- 持久化：localStorage key `af-locale`
- Hook：`const { t, locale, setLocale } = useTranslation()`
- 翻译函数：`t('dashboard.title')` → 点分路径查找
- 新增文案时，`en.json` 和 `zh.json` 必须同步更新

## 关键配置文件

### `config/openclaw.json`

Gateway 核心配置，包含：模型定义、Agent 列表、端口、认证 Token、插件。Agent 创建/删除时会自动更新此文件。

### `config/models.json`

模型别名映射，定义各 Provider 下的模型 ID。当前配置：
- Anthropic：opus (claude-opus-4-6)、sonnet (claude-sonnet-4-6)、haiku
- MiniMax：M2.5、M2.1（通过 minimax）

### Agent 模板（`templates/builtin/{id}/template.json`）

```json
{
  "id": "pm",
  "name": "Project Manager",
  "description": "...",
  "emoji": "📋",
  "category": "builtin",
  "group": "executive",
  "defaults": {
    "model": "minimax/MiniMax-M2.5",
    "skills": ["tmux", "github", "session-logs"],
    "peers": ["ceo", "researcher", "..."]
  }
}
```

## Git 约定

### 不提交的内容

- `.env` — API Key 等敏感信息
- `agents/` — Agent 核心定义（运行时创建，仅保留 `.gitkeep`）
- `workspaces/` — Agent 产出空间（运行时写入）
- `projects/` — 项目共享空间（按 department 自动创建）
- `templates/custom/` — 用户自定义模板（仅保留 `.gitkeep`）
- `.openclaw-state/` — Gateway 运行时状态
- `libs/` — 本地库源码
- `node_modules/`

### 提交规范

- 遵循 Conventional Commits：`feat:`, `fix:`, `refactor:`, `docs:` 等
- 提交消息简洁，面向操作（如 `feat: template-based agent creation system`）
- 相关改动分组提交，不捆绑无关重构
- Co-Authored-By 使用用户信息：`Co-Authored-By: shuanbao <shuanbao0@gmail.com>`，不使用 Claude 的

## 安全提示

- 切勿提交 `.env` 或任何包含 API Key 的文件
- Gateway 内部 Token（`agent-factory-internal-token-2026`）仅用于本地通信
- Auth profiles 存储在 `.openclaw-state/agents/main/agent/auth-profiles.json`（不提交）

## 修改代码后的操作流程

修改 UI 代码后，需按以下步骤确保变更生效：

```bash
# 1. 清除 Next.js 缓存（避免旧 build 产物与 dev server 冲突，导致 CSS/JS 404）
rm -rf ui/.next

# 2. 杀掉占用端口的旧进程
lsof -ti:3100 | xargs kill -9 2>/dev/null

# 3. 重启开发服务器
cd ui && npm run dev

# 发布新版本（CI 自动打包，无需手动操作）
# ⚠️ 打 tag 前必须先更新版本号！
# 1. bump package.json version 字段
# 2. bump CLAUDE.md 顶部的 "版本: X.Y.Z"
# 3. git commit + push 版本号变更
# 4. git tag vX.Y.Z && git push origin vX.Y.Z
# 5. GitHub Actions (.github/workflows/release.yml) 自动创建 Release + tarball
# 其他机器即可通过 agent-factory update 更新
```

**注意事项：**
- 执行过 `npm run build` 后，`.next` 目录包含生产构建产物，与 dev server 的增量编译不兼容，必须清除
- 如果只是热更新（未执行过 build），通常不需要清缓存，Fast Refresh 会自动生效
- 如果遇到 CSS 404（如 `/_next/static/css/app/layout.css` 返回 404），基本都是缓存问题，清除 `.next` 即可
- 可用一行命令完成全部操作：`rm -rf ui/.next && lsof -ti:3100 | xargs kill -9 2>/dev/null; cd ui && npm run dev`

## 常用运维脚本

```bash
# 重新注入 base-rules 到所有 Agent（修改 config/base-rules.md 后必须执行）
node scripts/inject-base-rules.mjs

# 同步部门配置（update 后自动执行，也可手动运行）
node scripts/migrate-sync-config.mjs --dry-run   # 预览
node scripts/migrate-sync-config.mjs             # 同步所有部门
node scripts/migrate-sync-config.mjs novel        # 同步单个部门

# 同步 Gateway 配置（openclaw.json + models.json，update 后自动执行）
node scripts/migrate-sync-gateway.mjs --dry-run   # 预览
node scripts/migrate-sync-gateway.mjs             # 同步

# OpenClaw postinstall 补丁（npm install 自动触发，通常无需手动运行）
node scripts/patch-openclaw.mjs

# 升级（用户端）
agent-factory update
```

### OpenClaw Hotfix 补丁机制

`scripts/patch-openclaw.mjs` 通过 `postinstall` hook 在每次 `npm install` 后自动运行：

1. 定位 `node_modules` 中的 `openclaw`，读取版本号
2. 若版本 >= `2026.4.0`（上游修复版本），跳过
3. 扫描 `dist/**/*.js`，找到 `isReasoningTagProvider` 函数中的 `minimax` 判断行并移除
4. 幂等：已补丁的文件不会重复修改

当上游发布修复版本后，只需更新 `package.json` 中的 openclaw 版本约束，补丁脚本自动跳过。后续版本可移除脚本和 postinstall hook。

## 故障排除

- **Gateway 无法启动**：检查 `.env` 是否配置了至少一个 API Key，或在 Dashboard Settings 页面添加 Provider
- **端口被占用**：`agent-factory stop` 或 `lsof -ti:3100 | xargs kill -9`
- **Next.js webpack 错误（__webpack_modules__）**：清除缓存 `rm -rf ui/.next && cd ui && npm run dev`
- **ws 模块类型错误**：已知问题，`gateway-chat.ts` 中的 `ws` import 在 `next build` 类型检查时会报错，不影响运行时（聊天通过独立子进程执行）
- **Agent 不可用**：确认 Gateway 正在运行，检查 `config/openclaw.json` 中 agents 列表是否包含该 Agent
- **Agent 产出写错位置**：如果 Agent 把产出写到了 `agents/{id}/` 而非 `workspaces/{id}/`，确认 base-rules 已注入（`node scripts/inject-base-rules.mjs`），工作空间目录在 Agent 创建时由 agent-service 自动创建
- **MiniMax 模型 chat 无响应（`(no response)`）**：OpenClaw 2026.3.7 的 `enforceFinalTag` 机制会丢弃 MiniMax 输出（MiniMax 不使用 `<final>` 标签）。已通过 `postinstall` 自动补丁修复（`scripts/patch-openclaw.mjs`），`npm install` 时自动应用。上游 PR：https://github.com/openclaw/openclaw/pull/41115 ，待合并发版后补丁脚本会自动跳过

## 修改 OpenClaw 源码并提交 PR 流程

当需要修复 OpenClaw Gateway 的 bug 时，遵循以下流程：

### 1. 修改与本地测试

```bash
# OpenClaw 源码位于 /Users/yuanwu/workspace/openclaw
cd /Users/yuanwu/workspace/openclaw

# 创建 fix 分支
git checkout -b fix/描述性分支名

# 修改代码后，跑相关测试
pnpm install                    # 首次需要安装依赖
pnpm vitest run path/to/test.ts # 跑单个测试文件
```

### 2. 提交 PR 到 OpenClaw

```bash
# 提交（OpenClaw 使用 oxfmt 格式化，注意行宽限制）
git add <files>
git commit -m "fix: 描述"

# 没有直接 push 权限，需要 fork
gh repo fork openclaw/openclaw --remote=false
git remote add fork https://github.com/shuanbao0/openclaw.git
git push fork fix/分支名

# 创建 PR（按 .github/PULL_REQUEST_TEMPLATE.md 模板填写）
gh pr create --repo openclaw/openclaw --head shuanbao0:fix/分支名 --title "..." --body "..."
```

**CI 注意事项：**
- `check` job 包含 `oxfmt` 格式检查，行太长会失败，需要展开为多行格式
- `secrets` job（pnpm-audit-prod）是仓库已有的依赖漏洞问题，所有 PR 都会失败，维护者会忽略
- 修改 `isReasoningTagProvider` 等函数时，记得同步更新 `src/utils/utils-misc.test.ts` 中的断言

### 3. 本地测试修改过的 OpenClaw

在 PR 合并发版前，可以在 Agent Factory 中使用本地修改的 OpenClaw 构建产物测试：

```bash
# 1. 构建 OpenClaw
cd /Users/yuanwu/workspace/openclaw
pnpm build

# 2. 手动 symlink 到 Agent Factory 的 node_modules
#    ⚠️ 不要用 npm link，会破坏其他依赖（如 ws）
rm -rf /Users/yuanwu/workspace/agent-factory-workspace/node_modules/openclaw
ln -s /Users/yuanwu/workspace/openclaw /Users/yuanwu/workspace/agent-factory-workspace/node_modules/openclaw

# 3. 重启 Gateway 并测试
lsof -ti:19100 | xargs kill -9 2>/dev/null
npm run gateway

# 4. 用 gateway-chat.js 发测试消息（stderr 输出 [chat-debug] 诊断日志）
CHAT_INPUT='{"sessionKey":"agent:ceo:test","message":"测试消息"}' node ui/scripts/gateway-chat.js

# 5. 测试完毕后恢复 npm registry 版本
rm /Users/yuanwu/workspace/agent-factory-workspace/node_modules/openclaw
npm install
```

**关键注意：**
- 使用 `ln -s` 手动 symlink，不要用 `npm link`（会导致 `ws` 等依赖丢失）
- `npm install` 会覆盖 symlink，恢复为 npm registry 版本
- 验证 symlink 是否生效：`node -e "console.log(require.resolve('openclaw'))"`，应指向本地源码路径
