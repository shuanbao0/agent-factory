# Agent Factory 模块调用流程图

> 完整调用链路文档。每层列出精确的 import/require 关系与函数签名。

---

## 架构总览

```
 Browser / SSE Client
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 1 ── API Routes        (ui/src/app/api/)                  │
│             薄路由层：解析请求 → 委托 Service/Lib → 返回 JSON     │
│             ⚠ agent-tasks/models 路由含内联业务逻辑（待重构）     │
│             events/ 提供 SSE 实时推送（替代客户端轮询）           │
│             45 个路由文件，覆盖 Agent/Task/Autopilot/Gateway 等   │
└──────────────┬───────────────────────────────────────────────────┘
               │ import
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 2 ── Services          (ui/src/services/)                 │
│             业务编排层：组合 Lib 模块完成完整业务流程              │
│             3 个服务文件 (agent-crud / task-api / autopilot-api)  │
└──────────────┬───────────────────────────────────────────────────┘
               │ import
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 3 ── Lib               (ui/src/lib/)                      │
│             UI 侧工具库：core-bridge 桥接、Gateway 管理、类型安全 │
│             task-storage / quality-gate 为薄 Facade 委托 core/   │
│             store.ts (Zustand) / api-cache / event-relay 等      │
│             22 个模块，~3,400 行                                  │
└──────────────┬───────────────────────────────────────────────────┘
               │ require (via core-bridge.ts)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Entity ── 实体定义层         (entity/)                           │
│             常量 / 类型 / 默认值的唯一来源（@entity/* 路径别名）   │
│             Dashboard (TS) + Core (CJS) 双向共享                  │
└──────────────────────────────────────────────────────────────────┘
               │ import / require
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 6 ── Core 业务内核     (core/)                            │
│             唯一的业务逻辑源（Dashboard + Autopilot 共用）         │
│             6 个子模块，~5,350 行                                 │
└──────────────────────────────────────────────────────────────────┘


════════════════════════════════════════════════════════════════════
 Dashboard (Next.js TS)  ↑  上层        下层  ↓  Autopilot (Node CJS)
════════════════════════════════════════════════════════════════════


┌──────────────────────────────────────────────────────────────────┐
│  Layer 4 ── Autopilot 编排层  (scripts/autopilot/)               │
│             CEO 循环 + 部门循环：调度 Agent、管理状态              │
│             事件驱动：EventBus + Scheduler + AdaptiveTimer        │
│             SignalWatcher 接收 Dashboard 事件中继                 │
└──────────────┬───────────────────────────────────────────────────┘
               │ require (Facade 委托)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 5 ── Facade 适配层     (scripts/autopilot/*.cjs)          │
│             薄包装：API 不变，实现委托给 core/                    │
└──────────────┬───────────────────────────────────────────────────┘
               │ require('../../core/...')
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 6 ── Core 业务内核     (core/)                            │
│             唯一的业务逻辑源：repo / task / observe / agent /     │
│             common / llm                                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: API Routes

> 职责：解析 HTTP 请求参数，委托给 Service/Lib，封装为 JSON 响应。零业务逻辑。
>
> ⚠ **例外**：`agent-tasks/route.ts` 和 `models/route.ts` 包含内联业务逻辑（状态机、混合 fs 读写），
> 尚未抽取到 Service 层。`budget/route.ts` 的 PUT 也直接 writeFileSync 而非走 core/ Repository。

### 路由清单（45 个文件）

#### 核心 Agent 管理 (7 个)

```
agents/route.ts (61 行)
  imports: fetchAgentsData ← @/lib/data-fetchers
           createAgent, updateAgent, deleteAgent ← @/services/agent-crud
  GET    /api/agents        → fetchAgentsData()
  POST   /api/agents        → createAgent(body)
  PUT    /api/agents        → updateAgent(body)
  DELETE /api/agents        → deleteAgent(id)

agents/deploy/route.ts
  imports: fs, path, logError
  POST   /api/agents/deploy → 重新生成 TOOLS.md (从 agent.json 读 skills + 解析 SKILL.md)

agents/model/route.ts
  imports: fs, path
  GET    /api/agents/model?id  → 读 agent.json → model 字段
  PUT    /api/agents/model     → 更新 agent.json → model 字段

agents/permissions/route.ts
  imports: fs, path, logError
  GET    /api/agents/permissions → 读所有 agent.json → peers 矩阵
  PUT    /api/agents/permissions → 写回每个 agent.json → peers 字段

agents/[id]/chat/route.ts
  imports: spawn, path, logError
  POST   /api/agents/:id/chat → SSE 流式：spawn gateway-chat.js 子进程 → WebSocket

agents/[id]/init/route.ts
  imports: spawn, path, existsSync, readFileSync, logError
  POST   /api/agents/:id/init → SSE 流式：Agent 自初始化 (读 AGENTS.md → 生成 IDENTITY.md + SOUL.md)

agents/[id]/sessions/route.ts
  imports: gwCallAsync ← @/lib/gateway-client
  GET    /api/agents/:id/sessions → sessions.list / sessions.history (Gateway CLI)

agents/[id]/skills/route.ts
  imports: fs, path, syncSkillSymlinks ← @/lib/skill-symlinks
  GET    /api/agents/:id/skills → 列出可用技能 (builtin + project)
  PUT    /api/agents/:id/skills → 更新 agent.json skills + 同步 symlink

agents/[id]/workspace/route.ts
  imports: fs, path, stripMarkerBlock, injectBaseRulesForAgent ← @/lib/base-rules
  GET    /api/agents/:id/workspace → 列出工作区文件 / 返回文件内容
  PUT    /api/agents/:id/workspace → 写文件 + 重新注入 base-rules
```

#### Autopilot & 部门 (3 个)

```
autopilot/route.ts (124 行)
  imports: getAutopilotOverview, getDepartments, getBudgetSummary,
           getKpis, getBaseMission, getMission, stopAutopilot,
           runSingleCycle, startAutopilot, startAllLoops,
           startDeptLoop, stopDeptLoop, runDeptCycle,
           setBaseMission, setMission ← @/services/autopilot-api
  GET    /api/autopilot?view=overview|departments|budgets|kpis|base-mission|mission
  POST   /api/autopilot {action: start|stop|cycle|start-all|start-dept|stop-dept|dept-cycle|set-base-mission|set-mission}

autopilot/departments/route.ts (68 行)
  imports: getDepartments ← @/services/autopilot-api
           core ← @/lib/core-bridge
  GET    /api/autopilot/departments → getDepartments()
  POST   /api/autopilot/departments → core.repo.deptConfigRepo.load/save()

departments/route.ts
  imports: readDepartments, writeDepartments, fs, path
  GET    /api/departments        → 列出所有部门元数据
  POST   /api/departments        → 创建部门 + autopilot config
  PUT    /api/departments        → 更新部门字段
  DELETE /api/departments        → 删除部门 + 清理 Agent + 禁用 autopilot

departments/[id]/workflow/route.ts
  imports: getDepartmentWorkflow ← @/lib/department-workflow
  GET    /api/departments/:id/workflow → 部门工作流 (phases, directories)
```

#### 任务管理 (3 个)

```
tasks/route.ts (75 行)
  imports: listTasks, createTask, updateTask, deleteTask ← @/services/task-api
  GET    /api/tasks?projectId&status&assignee&type → listTasks(filters)
  POST   /api/tasks                                → createTask(body)
  PUT    /api/tasks {id, ...updates}               → updateTask(id, updates)
  DELETE /api/tasks?id                             → deleteTask(id)

tasks/batch/route.ts
  imports: fs, path, task-storage helpers, isTerminal, core
  POST   /api/tasks/batch → 清理：去重 rework 任务 / 关闭孤立 rework
  DELETE /api/tasks/batch → 批量删除：按 status + age 过滤

agent-tasks/route.ts (267 行) ⚠ 含内联业务逻辑
  imports: findAllTasks, findTaskById, updateTaskInPlace,
           readStandaloneTasks, writeStandaloneTasks,
           readProjectMeta, writeProjectMeta ← @/lib/task-storage
           checkQualityGate, createPipelineTask, createReworkTask,
           persistNewTask, getWorkflowForTask ← @/lib/quality-gate
           STATUSES, TRANSITIONS, normalizeStatus, isTerminal ← @entity/task
           relayEvent ← @/lib/event-relay
  特殊: Bearer token 认证 (AGENT_FACTORY_TOKEN)
        内联状态机转换验证 + 依赖检查 + rework 链回溯
        relayEvent 中继状态变更到 Autopilot (event-relay)
  GET    /api/agent-tasks?agent&projectId → findAllTasks() + filter
  POST   /api/agent-tasks                → 创建任务 (inline)
  PUT    /api/agent-tasks {taskId,status,...} → 内联状态机 + 质量门 + 事件中继
```

#### 配置 & 设置 (6 个)

```
tools/route.ts (35 行)
  imports: core ← @/lib/core-bridge
  GET    /api/tools         → core.repo.configRepo.getConfig() → config.tools
  PUT    /api/tools         → core.repo.configRepo.updateConfig(mutator)

memory-config/route.ts (42 行)
  imports: core ← @/lib/core-bridge
  GET    /api/memory-config → agents.defaults.memorySearch + compaction
  PUT    /api/memory-config → core.repo.configRepo.updateConfig(mutator)

budget/route.ts (52 行)
  imports: core ← @/lib/core-bridge
           writeFileSync ← fs
           DEFAULT_BUDGET ← @entity/observe
           validateBudgetConfig ← core/common/config-validator.cjs (CJS 动态 require)
  GET    /api/budget → core.observe.loadCompanyBudget()
  PUT    /api/budget → validate + writeFileSync (⚠ 直接 fs 写入)

models/route.ts (397 行) ⚠ 混合模式
  imports: fs, readAuthProfiles, restartGateway, getStatus,
           core ← @/lib/core-bridge, PROVIDERS ← @/lib/providers
  GET    /api/models → 读 Provider 列表 + auth 状态 (setup-token/oauth/env-var/config/none)
  PUT    /api/models → setDefault / upsertProvider / deleteProvider / addModel / deleteModel
                     → 同步 openclaw.json + 自动 restartGateway()

env/route.ts
  imports: fs, path
  GET    /api/env → 读 .env (掩码敏感值)
  PUT    /api/env → 更新 .env + process.env

auth-profiles/route.ts
  imports: fs, path
  GET    /api/auth-profiles → 掩码 auth profiles
  PUT    /api/auth-profiles → 保存 auth profile (token + provider)
  DELETE /api/auth-profiles → 删除 profile by ID
```

#### 实时数据 & 监控 (5 个)

```
events/route.ts (SSE)
  imports: 多个 data-fetchers
  GET    /api/events → SSE 推送：单例服务端轮询 → 广播
         health (15s), agents (10s), logs (5s), usage (30s),
         messages (10s), tasks (10s), costs (30s), alerts (30s),
         autopilot (10s), departments (30s), budget (60s)

health/route.ts
  imports: fetchHealthData ← @/lib/data-fetchers
  GET    /api/health → fetchHealthData()

logs/route.ts
  imports: fetchLogsData ← @/lib/data-fetchers
  GET    /api/logs → fetchLogsData()

usage/route.ts
  imports: fetchUsageData ← @/lib/data-fetchers
  GET    /api/usage → fetchUsageData() (60s TTL 缓存 + in-flight 去重)

costs/route.ts
  imports: fs, path
  GET    /api/costs → 读 JSONL 成本日志 (period 过滤 + 来源过滤 + 每日聚合)
```

#### Gateway 管理 (5 个)

```
gateway/status/route.ts    → getStatus()
gateway/start/route.ts     → startGateway()
gateway/stop/route.ts      → stopGateway()
gateway/restart/route.ts   → restartGateway()
gateway/update/route.ts    → GET: 检查 OpenClaw 版本
                            → POST: 安装指定版本 + 自动重启
```

#### 项目 & 文件 (4 个)

```
projects/route.ts
  imports: fs, path, getDepartmentWorkflow
  GET    /api/projects → 列出项目 (含 token 用量聚合)
  POST   /api/projects → 创建项目 (workflow 目录结构 + .project-meta.json)

projects/[id]/route.ts
  DELETE /api/projects/:id → 递归删除项目目录 (路径遍历校验)

projects/[id]/files/route.ts
  GET    /api/projects/:id/files → 列出项目文件 / 返回文件内容 (1MB 限制)

projects/[id]/preview/route.ts
  imports: fs, path, spawn, execFile, net
  GET    /api/projects/:id/preview → 检查 dev server 状态
  POST   /api/projects/:id/preview → start (自动检测类型 + 可用端口) / stop
```

#### 会话 & 消息 (3 个)

```
sessions/route.ts
  imports: gwCallAsync
  GET    /api/sessions    → sessions.list
  DELETE /api/sessions    → sessions.kill

sessions/cleanup/route.ts
  imports: gwCallAsync
  POST   /api/sessions/cleanup → 清理过期会话 (default 7 天, batch 5)

messages/route.ts (425 行)
  imports: gwCallAsync, core ← @/lib/core-bridge
  GET    /api/messages → 聚合 Agent 间通信：
         sessions.list → 分离直连/子代会话 → batch 读 chat.history
         → 正则提取 [Inter-Agent Message] → 解析错误日志
         → 最近 200 条消息
```

#### 技能管理 (5 个)

```
skills/route.ts            → 列出 builtin + project 技能 (缓存 30s)
skills/builtin/route.ts    → openclaw skills list --json (缓存 120s)
skills/online/route.ts     → ClawHub 市场搜索 / 检查 / 浏览 (缓存 300s)
skills/manage/route.ts     → 安装 / 更新 / 卸载技能 (失效所有缓存)
skills/install-bin/route.ts → brew install 二进制 (120s 超时)
```

#### 模板 & 工作区 (2 个)

```
templates/route.ts
  GET    /api/templates → 列出可见模板
  POST   /api/templates → 创建自定义模板

workspaces/route.ts
  GET    /api/workspaces → 列出活跃工作区 + 归档快照 / 返回文件内容
  DELETE /api/workspaces → 删除归档备份
```

#### 平台更新 (1 个)

```
platform/update/route.ts
  GET    /api/platform/update → 检查 Agent Factory 最新版本 (GitHub API)
  POST   /api/platform/update → 执行 agent-factory update (5 分钟超时)
```

---

## Layer 2: Services

> 职责：业务编排。组合 Lib 模块完成完整业务流程。通过 `core-bridge.ts` 统一访问 core/。
> 3 个文件，共 ~1,254 行。

### `agent-crud.ts` (~653 行)

```
imports:
  readTemplate, getTemplateDir   ← @/lib/template-meta
  injectBaseRulesForAgent        ← @/lib/base-rules
  restartGateway, getStatus      ← @/lib/gateway-manager
  syncSkillSymlinks              ← @/lib/skill-symlinks
  logError                       ← @/lib/error-logger
  core                           ← @/lib/core-bridge
  existsSync, mkdirSync, ...    ← fs
  join, resolve                  ← path

内部函数:
  resolveModelRef(ref)           → 模型别名解析 (读 config/models.json)
  parseSkillMeta(skillMd)        → 解析 SKILL.md frontmatter
  generateToolsMd(agentId, skills, agentDir) → 生成 TOOLS.md
  readOpenlawConfig()            → 委托 core.repo.configRepo.getConfig()
  addToOpenclawConfig(agentId, workspaceDir, model)
                                 → 委托 core.repo.configRepo.addAgent()
  removeFromOpenclawConfig(agentId)
                                 → 委托 core.repo.configRepo.removeAgent()
  syncAutopilotDeptAgents(department, agentId, action)
  ensureProjectForDepartment(department, agentId)
  tryRestartGateway()            → getStatus() + restartGateway()
  buildPeersRolesSection(peers)  → 生成 Peers 职责 Markdown
  generateAgentsMd({id, role, name, description, peers})

导出:
  createAgent(body) → {ok, id, deployed, restarted, hasIdentityFiles}
    流程: 验证 → 读模板 → 创建 agents/{id}/ → 写 agent.json
        → 写 AGENTS.md → 注入 base-rules → 创建技能 symlink
        → 写 TOOLS.md → 写 IDENTITY.md/SOUL.md/MEMORY.md
        → 创建记忆基础设施 (KNOWLEDGE_TREE.md, memory/domains/, memory/projects/,
           memory/decisions/, memory/relationships/)
        → 创建 workspaces/{id}/ → 注册到 openclaw.json
        → 同步部门配置 → 重启 Gateway

  updateAgent(body) → {ok}
    流程: 读 agent.json → 合并更新 → 重注入 base-rules
        → 同步技能 → 更新 openclaw.json → 处理部门变更 → 重启 Gateway

  deleteAgent(id) → {ok, restarted, archivedTo}
    流程: 移除 openclaw.json → 删除 agents/{id}/
        → 删除 .openclaw-state/agents/{id}/
        → 归档 workspaces/{id}/ → workspaces/.archived/{id}_{timestamp}
        → 重启 Gateway
```

### `autopilot-api.ts` (~326 行)

```
imports:
  spawn                          ← child_process
  readFileSync, existsSync,      ← fs
  readdirSync
  resolve, join                  ← path
  logError                       ← @/lib/error-logger
  core                           ← @/lib/core-bridge
  AutopilotState, DeptInfo       ← @entity/autopilot
  DepartmentConfig               ← @entity/dept

内部函数:
  loadState()                    → 委托 core.common.loadState()
  saveState(state)               → 委托 core.common.saveState()
  isProcessRunning(pid)          → process.kill(pid, 0)
  atomicWriteSync(path, data)    → 原子写入 (仅 mission 写入)
  loadDepartments()              → 组合 core.repo.deptConfigRepo/deptStateRepo/missionRepo
                                   + 读 config/departments/*/directives.md + report.md + mission.md
  loadBudgetSummary()            → 委托 core.observe.getBudgetSummary()

导出:
  getAutopilotOverview()         → 全局状态 + mission + history
  getDepartments()               → 部门列表 (config + state + report + directives + mission)
  getBudgetSummary()             → 公司 + 部门预算用量
  getKpis()                      → 部门 KPI 配置数据
  getBaseMission()               → config/base-mission.md 内容
  getMission()                   → config/mission.md 内容
  stopAutopilot()                → SIGTERM → SIGKILL + 停所有部门
  runSingleCycle()               → spawn(autopilot/index.cjs)
  startAutopilot(interval?)      → spawn(index.cjs --loop --interval)
  startAllLoops()                → spawn(index.cjs --all)
  startDeptLoop(deptId, interval?) → spawn(department-loop.cjs --dept --loop)
  stopDeptLoop(deptId)           → SIGTERM 部门进程
  runDeptCycle(deptId)           → spawn(department-loop.cjs --dept)
  setBaseMission(content)        → 写 config/base-mission.md
  setMission(content)            → 写 config/mission.md
```

### `task-api.ts` (275 行)

```
imports:
  Task                           ← @/lib/types (type)
  readStandaloneTasks,            ← @/lib/task-storage
  writeStandaloneTasks,
  readProjectTasks,
  writeProjectMeta,
  updateProjectTask,
  deleteProjectTask
  checkQualityGate,              ← @/lib/quality-gate
  createPipelineTask,
  createReworkTask,
  persistNewTask,
  getWorkflowForTask
  core                           ← @/lib/core-bridge

导出:
  listTasks({projectId?, status?, assignee?, type?})
    → 合并 readProjectTasks() + readStandaloneTasks()
    → 过滤 → 按 priority + updatedAt 排序

  createTask(body) → {task, ok}
    → 生成 ID → 构造 Task
    → core.repo.taskRepo.readProjectMeta() 验证项目存在
    → 写入 project 或 standalone

  updateTask(id, updates) → {task, ok, qualityGate?, reworkTask?, pipelineTask?}
    → 查找任务 (standalone → project)
    → 如果 status=completed:
        → getWorkflowForTask(task)
        → checkQualityGate(task, workflow)
        → 通过 → createPipelineTask() → persistNewTask()
        → 未通过 + shouldRework → createReworkTask() → persistNewTask()
        → 未通过 + escalate → status='failed'
    → 非 completion → 直接合并更新

  deleteTask(id) → {ok}
    → 查找并删除 (standalone → project)
```

---

## Layer 3: Lib (UI 工具库)

> 职责：UI 侧的数据访问与工具函数。TypeScript 类型安全。
> 22 个模块，共 ~3,400 行。

### 关键模块调用关系

```
core-bridge.ts                              ★ 唯一的 core/ 入口
  └──→ require('../../core')  (CJS→TS 桥接, module.createRequire 绕过 webpack)

quality-gate.ts  (薄 Facade，~62 行)
  ├──→ core-bridge.ts          (core.task.checkQualityGate 等)
  ├──→ task-storage.ts         (readProjectMeta)
  └──→ department-workflow.ts  (getDepartmentWorkflow)

task-storage.ts  (薄 Facade，~54 行)
  └──→ core-bridge.ts          (core.repo.taskRepo.*)

department-workflow.ts (~40 行)
  └──→ core-bridge.ts     (core.repo.deptConfigRepo.load)

department-meta.ts (~60 行)
  └──→ fs 直读 config/departments/*/config.json

data-fetchers.ts (~516 行, 11 个 fetcher)
  ├──→ gateway-client.ts  (gwCallAsync)
  └──→ core-bridge.ts     (core.repo.taskRepo.findAllTasks,
                            core.repo.configRepo.getConfig,
                            core.common.loadState,
                            core.observe.loadCompanyBudget,
                            core.observe.queryCosts)

event-relay.ts (~33 行)
  └──→ fs.appendFileSync  (config/.autopilot-signal, JSONL)

gateway-manager.ts (~278 行)
  └──→ child_process      (Gateway 进程 spawn/kill + 端口检测)

gateway-client.ts (~62 行)
  └──→ child_process      (execFile openclaw gateway call)

gateway-chat.ts (~382 行)
  └──→ ws (WebSocket)     (全协议实现: connect→hello→chat.send→delta→final)

store.ts (~692 行)
  └──→ zustand            (全局状态: agents/tasks/logs/usage/costs/autopilot 等)
       data-fetchers      (AgentMessage type)

api-cache.ts (~53 行)
  └──→ 内存 TTL 缓存 + in-flight 请求去重

autopilot-shared.ts (~64 行)
  └──→ @entity/autopilot  (AutopilotState, DeptInfo re-export + 状态颜色 + 倒计时 hook)
```

### `core-bridge.ts` — CJS↔TS 桥接 (~90 行)

```
module.createRequire → require('../../core') → 提供 typed 访问
  core.repo.taskRepo        → 任务 CRUD (read/write/find/update/delete)
  core.repo.configRepo      → openclaw.json 配置 (getConfig/updateConfig/getGatewayConfig/addAgent/removeAgent)
  core.repo.deptConfigRepo  → 部门配置 (load/save/updateConfig)
  core.repo.deptStateRepo   → 部门状态 (load/save)
  core.repo.agentMetaRepo   → Agent 元数据 (load/save)
  core.repo.missionRepo     → mission 文件读取 (readMission/readBaseMission/readDeptMission)
  core.task.*               → 质量门、pipeline、rework
  core.observe.getBudgetSummary()    → 公司+部门预算汇总
  core.observe.loadCompanyBudget()   → 公司预算配置 (budget.json)
  core.observe.queryCosts(opts?)     → 成本记录查询 (autopilot-costs.jsonl)
  core.observe.getDailySummary(days) → 按天+来源聚合成本
  core.common.loadState()   → Autopilot 状态 (autopilot-state.json)
  core.common.saveState()   → 保存 Autopilot 状态
```

### `data-fetchers.ts` — 数据获取 API (~516 行)

```
导出 11 个 fetcher:
  fetchHealthData()            → gwCallAsync('health') + gwCallAsync('status')
  fetchAgentsData()            → gwCallAsync('agents.list') + agent.json 元数据 + busy 检测
  fetchLogsData()              → gwCallAsync('logs.tail') + gwCallAsync('sessions.list')
  fetchUsageData()             → gwCallAsync('sessions.usage') (60s TTL + in-flight 去重)
  fetchTasksData()             → core.repo.taskRepo.findAllTasks()
  fetchMessagesData()          → sessions.list → batch chat.history → 正则提取 Inter-Agent Message
  fetchCostsData()             → core.observe.queryCosts() → 最近 200 条
  fetchAlertsData()            → 读 config/alerts.json
  fetchAutopilotStatusData()   → core.common.loadState()
  fetchAutopilotDeptsData()    → 读 config/departments.json
  fetchBudgetStatusData()      → core.observe.loadCompanyBudget()

SSE events/route.ts 使用上述 fetcher 以不同间隔轮询并广播
```

### `event-relay.ts` — 跨进程事件中继 (~33 行)

```
relayEvent(eventType, payload) → void
  → 追加 JSON 行到 config/.autopilot-signal
  → Autopilot 端通过 SignalWatcher (fs.watch) 读取并分发到 EventBus
  → 实现 Dashboard → Autopilot 的异步事件通知
```

### `quality-gate.ts` 导出函数 (Facade → core/)

```
getWorkflowForTask(task: Task) → DepartmentWorkflow
  → 读 task.projectId → readProjectMeta() → getDepartmentWorkflow(dept)

checkQualityGate(task: Task, workflow: DepartmentWorkflow) → QualityGateResult
  → 查找 pipeline step → 委托 core.task.checkQualityGate(task, step)

createPipelineTask(completedTask, workflow) → Task | null
  → 查找 pipeline step → 委托 core.task.createPipelineTask(task, step, types)

createReworkTask(task, errors) → Task
  → 委托 core.task.createReworkTask(task, errors)

persistNewTask(task) → void
  → 委托 core.repo.taskRepo.writeProjectMeta / writeStandaloneTasks
```

### `task-storage.ts` 导出函数 (Facade → core/)

```
所有函数 1:1 委托 core.repo.taskRepo.*:
  normalizeTask / readStandaloneTasks / writeStandaloneTasks
  readProjectMeta / writeProjectMeta / readProjectTasks
  findAllTasks / findTaskById / updateProjectTask
  deleteProjectTask / updateTaskInPlace
```

### 其他 Lib 模块

```
types.ts (~37 行)
  → @entity/* 的 re-export hub (Agent, Task, Dept, Config, Observe, Project, UI 类型)

api-cache.ts (~53 行)
  → cached<T>(key, ttlMs, fn) — TTL 缓存 + in-flight 请求去重
  → invalidate(keyPrefix) — 清除匹配缓存

base-rules.ts (~169 行)
  → injectBaseRulesForAgent(agentDir) — 幂等注入 base-rules 到 AGENTS.md + SOUL.md

template-meta.ts (~107 行)
  → readTemplate(id), getTemplateDir(id), listTemplates()

skill-symlinks.ts (~78 行)
  → syncSkillSymlinks(agentId, skills) — 创建/删除 symlink (幂等)

clawhub.ts (~219 行)
  → ClawHub 技能市场：listLocal/listInstalled/listBuiltin/explore/install/uninstall

providers.ts (~349 行)
  → 15+ AI Provider 定义 (Anthropic/OpenAI/DeepSeek/MiniMax/Azure 等 + auth 模式)

gateway-chat.ts (~382 行)
  → sendChatMessage(agentId, message, callbacks, options) — WebSocket 全协议

store.ts (~692 行)
  → Zustand 全局状态 (agents/templates/departments/projects/skills/logs/usage/health
     /models/settings/autopilot/messages/costs/tasks)
  → 优化: 延迟 enrichment + O(N) 复杂度 + shallow 比较防重渲染

i18n.ts (~54 行) → useTranslation() hook + localStorage 持久化
error-logger.ts (~8 行) → logError(context, err)
utils.ts (~32 行) → 通用工具函数
autopilot-shared.ts (~64 行) → 状态颜色配置 + useCountdown() hook
```

---

## Entity 层：实体定义（常量/类型/默认值的唯一来源）

> 职责：定义所有跨层共享的常量、类型、默认值。Dashboard (TS) 通过 `@entity/*` 路径别名引用，
> Core (CJS) 通过 `require('../../entity/...')` 引用。**零业务逻辑，纯数据定义。**

```
entity/
├── index.ts                        ★ Barrel 导出 (re-export all)
├── task/
│   ├── task.ts                     → STATUSES, TRANSITIONS, TERMINAL
│   │                                 canTransition, getValidTransitions,
│   │                                 isTerminal, isValidStatus, normalizeStatus
│   ├── quality-gate.ts             → GATE_STAGES, GATE_TRANSITIONS, GATE_TERMINAL
│   │                                 canAdvanceGate, isGateDone
│   └── quality-validator.ts        → DEFAULT_GATE_CONFIG, PipelineStep
├── agent/
│   └── agent.ts                    → AgentRole, Agent, AgentMeta, AgentTemplate,
│                                     AgentConfigEntry
├── dept/
│   └── dept.ts                     → Department, DepartmentConfig, DepartmentWorkflow,
│                                     DepartmentLoopState, DepartmentFurnitureItem,
│                                     PhaseDefinition, TaskTypeDefinition,
│                                     DEFAULT_DEPT_STATE
├── config/
│   └── config.ts                   → OpenClawConfig, OpenClawModelEntry,
│                                     OpenClawProviderConfig, GatewayConfig
├── observe/
│   ├── budget.ts                   → DEFAULT_BUDGET, CompanyBudget, BudgetSummary
│   └── cost.ts                     → PRICING, CostEntry, CostQueryResult,
│                                     DailyCostSummary
├── autopilot/
│   └── autopilot.ts                → DEFAULT_INTERVAL_SEC, DEFAULT_AUTOPILOT_STATE,
│                                     AutopilotState, DeptInfo
├── project/
│   └── project.ts                  → Project, ProjectMeta
└── ui/
    └── ui.ts                       → Skill, LogEntry, TimelineMessage, Channel

主要消费者:
  UI 层:  ui/src/lib/types.ts 作为中转 re-export hub
          agent-tasks/route.ts 直接引用 @entity/task
          budget/route.ts 直接引用 @entity/observe
          models/route.ts 直接引用 @entity/config
          autopilot-api.ts 直接引用 @entity/autopilot, @entity/dept
  Core 层: core/task/*.cjs re-export entity/ 常量
           core/observe/*.cjs 引用 entity/ 默认值
           core/common/*.cjs 引用 entity/ 校验函数
```

---

## Layer 4: Autopilot 编排层

> 职责：CEO 主循环 + 部门循环的调度编排。通过 Facade 调用 core/ 模块。
> 事件驱动架构：EventBus + Scheduler + AdaptiveTimer + SignalWatcher。

### `index.cjs` — CEO 主循环 (562 行)

```
require('./state.cjs')            → loadState, saveState, withStateLock
require('./gateway.cjs')          → sendToCeo, getGatewayConfig
require('./readers.cjs')          → fetchSessionTokens, readProjectTasks,
                                    readStandaloneTasks, readAgentActivity
require('./directive.cjs')        → buildDirective
require('./sync.cjs')             → syncProjects
require('./memory.cjs')           → buildMemoryContext, compressMemory
require('./department-loop.cjs')  → runDepartmentCycle, autoTransitionTasks
require('./task-bridge.cjs')      → createCycleTask, completeCycleTask, updateTaskStatus
require('./logger.cjs')           → logger
require('./constants.cjs')        → DEFAULT_INTERVAL_SEC, MAX_HISTORY_ENTRIES, ...

事件驱动模块 (从 core/ 引入):
require('../../core/observe/event-bus.cjs')      → eventBus (全局事件总线)
require('../../core/observe/scheduler.cjs')      → Scheduler (事件驱动调度)
require('../../core/observe/adaptive-timer.cjs') → AdaptiveTimer (活跃度自适应间隔)
require('../../core/observe/signal-watcher.cjs') → SignalWatcher (Dashboard 事件中继接收)

主循环流程:
  loadState()
  → SignalWatcher 监听 config/.autopilot-signal (Dashboard 事件中继)
  → Scheduler 注册事件处理器 (task-status-change / budget-alert 等)
  → AdaptiveTimer 根据活跃度调整循环间隔
  → buildDirective()                    // 构建 CEO 指令 (readers 读数据)
  → buildMemoryContext('ceo', 'coordination')  // 构建记忆上下文
  → sendToCeo(directive)               // 发送给 CEO Agent
  → compressMemory('ceo', response)    // 压缩响应到记忆
  → autoTransitionTasks(response)      // 根据回复自动更新任务状态
  → syncProjects()                     // 同步项目状态
  → saveState()
  → 如果 --all 模式, 遍历启动各部门 runDepartmentCycle()

导出:
  runCycle()                    — 单次 CEO 循环
  main()                       — 主入口 (带 --loop / --all 模式)
  startAll()                   — 启动所有部门循环
  discoverActiveDepartments()  — 发现活跃部门
```

### `department-loop.cjs` — 部门循环 (562 行)

```
require('./readers.cjs')          → loadDeptConfig, loadDeptState, saveDeptState,
                                    getSessionTokenInfo, readAgentActivity,
                                    readProjectTasks, readStandaloneTasks,
                                    readAgentMeta (lazy)
require('./gateway.cjs')          → sendToAgent, compactSession, killSession
require('./dept-directive.cjs')   → buildDepartmentDirective
require('./memory.cjs')           → compressMemoryByRole
require('./budget.cjs')           → checkBudget, trackTokenUsage
require('./task-bridge.cjs')      → createCycleTask, completeCycleTask,
                                    createWorkTask, updateTaskStatus
require('./quality-gate.cjs')     → processQualityGate
require('./logger.cjs')           → logger
require('./constants.cjs')        → DEPARTMENTS_DIR, IDLE_COMPLETE_MINS, ...

导出:
  runDepartmentCycle(deptId)       — 完整部门循环 (核心)
  autoTransitionTasks(response)    — 根据 idle/stale 自动状态流转
  ensureSessionHealth(agentId)     — 会话膨胀管理 (compaction/reset 阈值检查)
  fallbackDispatch(deptId, tasks)  — 主管无响应时的降级派发
  generateDepartmentReport(deptId) — 生成部门报告
  parseTaskAssignments(text)       — 解析 [任务分配] 段落
  parseTaskCompletions(text)       — 解析 [任务完成] 信号

部门循环流程 (runDepartmentCycle):
  loadDeptConfig(deptId)
  → checkBudget(deptId)                 // 预算检查
  → loadDeptState(deptId)
  → ensureSessionHealth(headId)         // 会话健康检查 (compaction/reset)
  → buildDepartmentDirective(...)       // 构建部门指令
  → sendToAgent(headId, directive)      // 发送给部门主管
  → 如果空响应 → fallbackDispatch()     // 降级派发 (直接分配任务给成员)
  → trackTokenUsage(deptId, usage)      // 记录 token 消耗
  → compressMemoryByRole(headId, response, 'leader')  // 压缩记忆
  → autoTransitionTasks(response)       // 自动状态流转
      → 识别 review 状态任务 → processQualityGate(deptId, task)
      → 质量门通过 → updateTaskStatus(taskId, 'completed')
      → 质量门未通过 → updateTaskStatus(taskId, 'rework')
  → saveDeptState(deptId, state)
```

### `directive.cjs` — CEO 指令构建 (~80 行)

```
require('./readers.cjs')          → readMission, readCeoWorkspaceFile,
                                    readProjectTasks, readStandaloneTasks,
                                    readAgentActivity, readAllDepartmentReports,
                                    readEscalations
require('./logger.cjs')           → logger

buildDirective(cycleType) → string
  路由: cycleType → buildCoordinationDirective() 或 buildStrategyDirective()
  coordination: mission + memory + 项目任务 + Agent 活跃度 + 独立任务
  strategy:     mission + 项目摘要 + 部门报告 (长期规划视角)
  输出: CEO 需要处理的综合指令文本
```

### `dept-directive.cjs` — 部门指令构建 (~256 行)

```
require('./readers.cjs')          → readAgentActivity, readProjectTasks,
                                    readDeptMission, readBaseMission, readAgentMeta
require('./memory.cjs')           → buildMemoryContext
require('./constants.cjs')        → DEPARTMENTS_DIR, PROJECTS_DIR
require('./logger.cjs')           → logger
require('../common/project-standards.cjs') → loadProjectStandards, getPhaseStandards

内部函数:
  buildTeamStatus(config, activity)     → 格式化团队成员状态 (idle/busy/任务数)
  buildDeptTasks(projects, standalone)  → 按项目+类型组织任务
  buildDeptProjects(deptId, projects)   → 项目列表 + 当前阶段 + 出口条件 (← project-standards)
  buildKpiStatus(config)               → 展示 KPI 定义
  readCeoDirectives(deptId)            → 提取 CEO 对本部门的特定指令

buildDepartmentDirective(deptId, config, state, transitions) → string
  读取: 部门 mission + base-mission + 项目任务 + Agent 活跃度 + 项目标准
  注入: 记忆上下文 + 状态转换结果 + 团队状态 + KPI + CEO 指令 + 阶段出口条件
  输出: 部门主管需要处理的综合指令文本
```

### `gateway.cjs` — WebSocket 通信 (~60 行，非 Facade，含协议实现)

```
require('ws')                     → WebSocket
require('crypto')                 → randomUUID
require('./constants.cjs')        → CONFIG_DIR, DEFAULT_AGENT_TIMEOUT_MS, ...
require('./readers.cjs')          → readMemorySummary
require('./logger.cjs')           → logger

导出:
  sendToAgent(agentId, sessionKey, message, timeoutMs=60000)
    → Promise<{ok, text?, error?, usage?, aborted?}>
    连接 ws://127.0.0.1:{port} → connect + token → chat.send → 收集 delta → final
    内含: 空响应检测 + retry-kill 恢复机制 (注入 memory 后重试)

  sendToCeo(message, timeoutMs?)
    → sendToAgent('ceo', 'agent:ceo:autopilot', message, timeoutMs)

  compactSession(sessionKey, timeoutMs)
    → 压缩会话上下文

  killSession(sessionKey, timeoutMs)
    → 重置会话

  getGatewayConfig()
    → 读取 Gateway 配置 (端口, token)
```

### `sync.cjs` — 项目同步 (~60 行)

```
require('./readers.cjs')          → readCeoWorkspaceFile, fetchSessionTokens
require('./constants.cjs')        → PROJECTS_DIR, CEO_WORKSPACE, PROJECT_ROOT
require('./logger.cjs')           → logger

syncProjects()
  读取 CEO 记忆/响应 → 检测项目阶段变化 → 更新 .project-meta.json
```

---

## Layer 5: Facade 适配层

> 职责：保持 autopilot 调用方的 API 不变，将实现 100% 委托给 core/。每个 Facade ≤ 60 行。

```
┌────────────────────────┬──────────────────────────────────┬──────────────────────┐
│ Facade 文件             │ 委托目标                          │ 导出函数              │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ readers.cjs (60 行)    │ core/repo/session.cjs            │ readAgentActivity    │
│                        │ core/repo/mission.cjs            │ readMission          │
│                        │ core/repo/task.cjs               │ readProjectTasks     │
│                        │ core/repo/dept-config.cjs        │ loadDeptConfig       │
│                        │ core/repo/dept-state.cjs         │ loadDeptState        │
│                        │ core/repo/agent-meta.cjs         │ readAgentMeta        │
│                        │                                  │ (共 17 个函数)        │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ budget.cjs (13 行)     │ core/observe/budget.cjs          │ checkBudget          │
│                        │                                  │ trackTokenUsage      │
│                        │                                  │ loadCompanyBudget    │
│                        │                                  │ getBudgetSummary     │
│                        │                                  │ shouldResetDaily     │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ memory.cjs (11 行)     │ core/agent/memory.cjs            │ buildMemoryContext   │
│                        │                                  │ compressMemory       │
│                        │                                  │ compressMemoryByRole │
│                        │                                  │ extractSummaryFrom.. │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ kpi.cjs                │ core/observe/kpi.cjs             │ calculateDeptKPIs    │
│                        │                                  │ saveKPISnapshot      │
│                        │                                  │ readKPIHistory       │
│                        │                                  │ getCompanyKPIs       │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ stall-detector.cjs     │ core/observe/stall-detector.cjs  │ detectStalls         │
│ (9 行)                 │                                  │ detectDeptStall      │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ task-bridge.cjs (12行) │ core/common/task-bridge.cjs      │ createCycleTask      │
│                        │                                  │ completeCycleTask    │
│                        │                                  │ createWorkTask       │
│                        │                                  │ updateTaskStatus     │
│                        │                                  │ findActiveTaskFor..  │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ state.cjs (11 行)      │ core/common/autopilot-state.cjs  │ loadState            │
│                        │                                  │ saveState            │
│                        │                                  │ withStateLock        │
│                        │                                  │ DEFAULT_STATE        │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ quality-gate.cjs       │ core/task/quality-orchestrator    │ processQualityGate   │
│  (15 行, DI 注入)      │ + ./gateway.cjs (sendToAgent)    │ selectReviewer       │
│                        │                                  │ findTasksInReview    │
└────────────────────────┴──────────────────────────────────┴──────────────────────┘
```

### `quality-gate.cjs` Facade 示例 (DI 注入模式)

```javascript
const { QualityOrchestrator } = require('../../core/task/quality-orchestrator.cjs')
const { sendToAgent } = require('./gateway.cjs')

const orch = new QualityOrchestrator({ sendFn: sendToAgent })

module.exports = {
  processQualityGate: (deptId, task) => orch.process(deptId, task),
  selectReviewer: (deptId, task, config) => orch.selectReviewer(deptId, task, config),
  findTasksInReview: (deptId, projects) => orch.findTasksInReview(deptId, projects),
}
```

---

## Layer 6: Core 业务内核

> 职责：唯一的业务逻辑源。所有模块使用 CJS，Node.js + Next.js 通用。
> 6 个子模块，共 ~5,350 行。

### `core/index.cjs` — Barrel 导出 (15 行)

```javascript
module.exports = {
  repo:    require('./repo/index.cjs'),     // Repository 数据访问
  task:    require('./task/index.cjs'),     // 任务状态机 + 质量门
  llm:     require('./llm/index.cjs'),     // LLM 通信与决策
  observe: require('./observe/index.cjs'), // 可观测性
  agent:   require('./agent/index.cjs'),   // Agent 业务逻辑
  common:  require('./common/index.cjs'),  // 通用工具
}
```

### 依赖方向 (单向，无循环)

```
entity/   ← 无依赖 (常量/类型的唯一来源，所有层共享)
common/   ← entity/ (validators 引用 entity/ 常量)
repo/     ← entity/ (默认值)
task/     ← entity/ (re-export 常量，DI 注入外部依赖)
agent/    ← (无 core 内部依赖，直接读 fs)
observe/  ← repo/ (lazy require，避免循环) + entity/ (默认值/定价)
llm/      ← repo/ (lazy require gateway config)
common/agent-service.cjs ← repo/ (ConfigRepository + AgentMetaRepository)
```

> 注：`common/agent-service.cjs` 依赖 `repo/` 是例外。大部分 `common/` 模块无 core 内部依赖。
> `observe/` 和 `llm/` 通过 lazy require 引用 `repo/`，避免模块加载时的循环依赖。

### `core/repo/` — Repository Pattern 数据访问层 (~848 行)

```
base.cjs (112 行, 基类)
  ├── TTL 缓存 (cacheTtlMs: 30000 for Autopilot, 0 for API)
  ├── 原子写入 (tmp + rename)
  └── read(path) / write(path, data) / update(path, mutator) / invalidate()

session.cjs (103 行, extends BaseRepository)
  ├── readAgentActivity()
  │     读 .openclaw-state/agents/*/status.json → {[agentId]: {totalTokens, lastActive, idleMins}}
  ├── fetchSessionTokens()
  │     读 .openclaw-state/sessions/*.json → [{sessionKey, totalTokens, ...}]
  └── getSessionTokenInfo(agentId, sessionKey)
        读 .openclaw-state/sessions/{key}.json → {inputTokens, outputTokens, totalTokens}

mission.cjs (123 行, extends BaseRepository)
  ├── readMission()           → config/mission.md 全文
  ├── readBaseMission()       → config/base-mission.md 全文
  ├── readDeptMission(deptId) → config/departments/{deptId}/mission.md
  ├── readWorkspaceFile(agentDir, filename)
  ├── readCeoWorkspaceFile(filename) → workspaces/ceo/{filename}
  ├── readAllDepartmentReports() → 遍历 config/departments/*/report.md
  ├── readEscalations()       → config/escalations.json
  └── readMemorySummary(agentId) → agents/{agentId}/MEMORY.md 前 2000 字

task.cjs (222 行, extends BaseRepository)
  ├── normalizeTask(raw, projectId)  → 兼容旧字段
  ├── readStandaloneTasks()          → config/tasks.json
  ├── writeStandaloneTasks(tasks)
  ├── readProjectsWithTasks()        → [{id, meta, tasks}] (保持项目结构)
  ├── readProjectTasks()             → Task[] (扁平列表)
  ├── findAllTasks()                 → standalone + project
  ├── findTaskById(taskId)
  ├── updateProjectTask(projectId, taskId, updates)
  ├── deleteProjectTask(projectId, taskId)
  └── updateTaskInPlace(taskId, updates)

dept-config.cjs (67 行, extends BaseRepository)
  ├── load(deptId) → config/departments/{deptId}/config.json | null
  ├── save(deptId, config)
  ├── updateConfig(deptId, mutator) → 原子更新
  └── 双实例: deptConfigRepo (30s 缓存, Autopilot 用) / deptConfigRepoNoCache (API 用)

dept-state.cjs (61 行, extends BaseRepository)
  ├── load(deptId)  → config/departments/{deptId}/state.json | DEFAULT_STATE
  └── save(deptId, state)

agent-meta.cjs (54 行, extends BaseRepository)
  ├── readMeta(agentId) → agents/{agentId}/agent.json | null
  ├── writeMeta(agentId, data)
  └── updateMeta(agentId, mutator) → 原子更新

config.cjs (107 行, extends BaseRepository)
  ├── getConfig()   → config/openclaw.json
  ├── updateConfig(mutator)
  ├── getGatewayConfig() → 网关配置 (端口, token)
  ├── addAgent(agentId, workspaceDir, model?)
  └── removeAgent(agentId)

project-meta.cjs (87 行, extends BaseRepository)
  ├── readMeta(projectId)  → projects/{dept}/{slug}/.project-meta.json (1 部门 N 项目)
  ├── writeMeta(projectId, meta) → 原子写入
  ├── updateMeta(projectId, mutator) → 原子更新
  └── readAll() → 扫描所有项目 (两级目录: projects/{dept}/{slug}/)
```

### `core/task/` — 任务生命周期 (~955 行)

```
state-machine.cjs (68 行) — 任务状态 FSM
  状态: pending → assigned → in_progress → review → completed
                                  ↘ rework ↗       → failed
  ├── canTransition(from, to) → boolean
  ├── getValidTransitions(from) → string[]
  ├── isTerminal(status) → boolean
  ├── normalizeStatus(status) → string     // 'running' → 'in_progress'
  └── transition(task, to, context?) → {ok, task?, error?}

quality-gate.cjs (125 行) — 质量门 FSM (5 阶段)
  阶段: pending → self_checking → peer_reviewing → head_approving → done
                       ↘               ↘                ↘
                     failed          failed           failed
  ├── canAdvance(from, to) → boolean
  ├── isGateDone(stage) → boolean
  ├── getGateState(task) → {stage, selfCheck?, peerReview?, headApproval?}
  ├── initGate(task) → gate
  ├── advanceGate(task, nextStage, result?) → {ok, error?}
  └── nextAction(task) → string | null

quality-validator.cjs (219 行) — 质量验证引擎 (Strategy Pattern)
  ├── checkQualityGate(task, pipelineStep) → {passed, errors, shouldRework, escalate}
  │     验证: selfCheck 分数 → peerReview → validators → rework/escalate 判定
  ├── runValidator(name, task, config) → string[]
  │     内置: wordCount / endingKeywords / noEndingKeywords / similarity
  ├── createPipelineTask(completedTask, pipelineStep, taskTypes) → Task | null
  └── createReworkTask(task, errors) → Task

quality-orchestrator.cjs (310 行) — 评审编排 (DI Pattern)
  require('../common/task-standards.cjs') → getStandardsForType
  constructor({sendFn, readAgentActivity?, loadDeptConfig?, logger?})
  ├── process(deptId, task) → Promise<{passed, reason?}>
  │     流程: loadDeptConfig → requestSelfCheck → selectReviewer
  │          → requestPeerReview → requestHeadApproval
  ├── _requestSelfCheck(agentId, task) → 使用类型专属检查清单 (← task-standards.md)
  │     未知类型回退通用 4 条清单
  ├── selectReviewer(deptId, task, config) → agentId | null
  │     策略: REVIEWER_MAP[type] → tag 匹配 → 最空闲 candidate
  └── findTasksInReview(deptId, projects) → Task[]

strategy.cjs (110 行) — 任务类型策略
  ├── getStrategy(taskType?, deptConfig?) → TaskStrategy (未命中时返回 _fallback)
  ├── BUILTIN_STRATEGIES — writing/editing/worldbuilding/character/plotting/
  │                         coding/analysis/research + _fallback (共 9 个)
  └── REQUIRED_FIELDS — 策略必填字段校验列表

auto-transition.cjs (144 行) — 自动状态流转
  ├── parseTaskAssignments(text) → [{agentId, summary}]
  ├── parseTaskCompletions(text) → [taskId]
  └── computeTransitions(opts) → [{taskId, from, to, reason, extras?}]
        opts: {allTasks, agentActivity, chiefResponseText,
               idleOnly?, idleCompleteMins?, staleTaskMins?}
        返回 _quality_gate 伪状态 → 调用方处理异步质量门
```

### `core/observe/` — 可观测性 (~913 行)

```
event-bus.cjs (87 行) — 事件总线 (Singleton, extends EventEmitter)
  ├── eventBus.fire(eventType, payload)  — fire-and-forget
  ├── eventBus.on(event, handler)        — 注册监听器
  └── JSONL 持久化 (可选)

signal-watcher.cjs (117 行) — 跨进程事件中继接收
  ├── SignalWatcher(signalPath, eventBus) — fs.watch 监听 Dashboard 信号文件
  └── 解析 JSONL → 分发到 EventBus

scheduler.cjs (117 行) — 事件驱动调度器
  ├── Scheduler(eventBus) — 注册事件 → 触发回调
  └── 支持优先级、去重、延迟执行

adaptive-timer.cjs (77 行) — 活跃度自适应定时器
  ├── AdaptiveTimer(config) — 根据 Agent 活跃度动态调整循环间隔
  └── 空闲时拉长间隔，繁忙时缩短

cost-tracker.cjs (175 行) — 成本记录
  ├── calculateCost(model, usage) → USD 成本 (基于 entity/observe/cost.ts PRICING)
  ├── trackCost(opts) → JSONL 追加 + 触发 event-bus
  ├── queryCosts(opts) → 过滤 + 聚合
  └── getDailySummary(days) → 按天+来源分组汇总

budget.cjs (137 行) — 预算管理
  lazy require: repo/dept-config.cjs, repo/dept-state.cjs
  ├── checkBudget(deptId) → {allowed, warning?, reason?, ratio}
  ├── trackTokenUsage(deptId, usage)
  ├── loadCompanyBudget() → {company: {dailyTokenLimit, monthlyTokenLimit, alertThreshold}}
  ├── getBudgetSummary() → {company, departments}
  └── shouldResetDaily(lastResetAt) → boolean

kpi.cjs (125 行) — KPI 计算引擎
  lazy require: repo/dept-config.cjs, repo/task.cjs
  ├── calculateDepartmentKPIs(deptId) → {[metric]: {target, unit, actual, achievement}}
  ├── saveKPISnapshot(deptId, kpis) → JSONL 追加
  ├── readKPIHistory(deptId, limit=100)
  └── getCompanyKPIs() → 聚合所有部门

stall-detector.cjs (71 行) — 停滞检测
  lazy require: repo/dept-state.cjs
  ├── detectStalls(deptId) → [{taskId, taskName, stalledCycles, suggestion}]
  └── detectDepartmentStall(deptId) → {stalled, reason?}

reactors/ — 事件响应子系统
  ├── index.cjs (24 行)     → registerAll(bus) — 注册所有 reactor
  ├── cost-alert.cjs (57 行) → 成本阈值告警
  ├── cycle-monitor.cjs (88 行) → 循环完成监控
  └── alert-bridge.cjs (83 行)  → 告警中继到外部系统
```

### `core/agent/` — Agent 业务逻辑 (~305 行)

```
memory.cjs (301 行) — 结构化记忆管理
  无 core/ 内部依赖 (直接读写 agents/{id}/memory/ 目录)
  ├── buildMemoryContext(agentId, cycleType)
  │     cycleType: 'coordination' | 'strategy' | 'department'
  │     返回: {summary?, recentDecisions?, departmentStatus?, lessonsLearned?}
  ├── compressMemory(agentId, fullResponse)
  │     提取摘要 → 写入 memory/YYYY-MM-DD.md
  ├── compressMemoryByRole(agentId, fullResponse, role)
  │     role: 'ceo' → 全量记录 | 'leader' → 决策+产出 | 'member' → 仅产出
  ├── extractSummaryFromMemory(raw)
  ├── extractDecisionEntry(response, timestamp)
  ├── buildSummaryFromResponse(response, date)
  ├── extractWorkOutput(response, timestamp)
  ├── updateDomainKnowledge(agentId, response)
  └── updateLessons(agentId, response)
```

### `core/common/` — 通用工具 (~412 行)

```
task-bridge.cjs (102 行) — Dashboard API 客户端 (fire-and-forget)
  无 core/ 内部依赖 (HTTP 调用 Dashboard API)
  目标: http://localhost:3100
  认证: Bearer AGENT_FACTORY_TOKEN
  ├── apiRequest(method, path, body) → Promise<object|null>
  ├── createCycleTask(agentId, type, cycleNum)     → POST /api/agent-tasks
  ├── completeCycleTask(agentId, taskId, result)    → PUT  /api/agent-tasks
  ├── createWorkTask(assignee, taskName, deptId, options) → POST /api/agent-tasks
  │     内置去重: findActiveTaskForAgent() → 有活跃任务则复用
  ├── updateTaskStatus(agentId, taskId, status, extras) → PUT /api/agent-tasks
  └── findActiveTaskForAgent(assignee, deptId)      → GET  /api/agent-tasks?agent&projectId

autopilot-state.cjs (51 行) — 全局状态持久化
  无 core/ 内部依赖
  状态文件: config/autopilot-state.json
  ├── loadState() → AutopilotState
  ├── saveState(state) — 原子写入 (tmp + rename + fallback)
  ├── withStateLock(fn) — load → _locked=true → save → fn() → unlock → save
  └── DEFAULT_STATE = {status:'stopped', pid:null, cycleCount:0, ...}

validators.cjs (55 行) — 输入校验
  ├── validateAgentId(id) → {valid, error?}
  ├── validateTaskStatus(status) → boolean
  └── sanitizePath(p) → string | null

config-validator.cjs (124 行) — 配置校验
  ├── validateBudgetConfig(config) → 校验 budget.json 结构
  └── validateOpenclawConfig(config) → 校验 openclaw.json 结构

agent-service.cjs (72 行) — Agent 删除服务
  依赖: repo/config.cjs (ConfigRepository), repo/agent-meta.cjs (AgentMetaRepository)
  └── AgentService.deleteAgent(id) → {ok, archivedTo}

project-standards.cjs — 项目标准解析 + 注入
  依赖: repo/project-meta.cjs (ProjectMetaRepository)
  ├── parseProjectStandards(raw) → {lifecycle, boundaries}
  ├── getPhaseStandards(lifecycle, phaseKey) → string|null
  ├── buildProjectStandardsMd(parsed, meta) → string (含 marker)
  ├── injectStandardsForProject(projectId) → 幂等写入 STANDARDS.md
  └── loadProjectStandards() → 缓存解析结果 (mtime)

task-standards.cjs — 任务标准解析
  无 core/ 内部依赖 (直接读 config/task-standards.md)
  ├── parseTaskStandards(raw) → {general, types}
  ├── getTaskTypeStandards(types, taskType) → string|null
  ├── extractChecklist(standardsText) → string[]
  ├── getStandardsForType(taskType) → {typeStandards, generalStandards, checklist}
  └── loadTaskStandards() → 缓存解析结果 (mtime)
```

### `core/llm/` — LLM 通信与决策 (~1,530 行)

```
gateway-pool.cjs (397 行) — WebSocket 连接池
  ├── 连接复用 + 速率限制
  └── 健康检查 + 自动重连

anthropic-client.cjs (133 行) — Anthropic API 直连客户端
  ├── getClient() → 初始化 Anthropic SDK
  ├── sendWithTools(messages, tools, options) → LLM 响应
  └── Circuit breaker + 重试逻辑

retry.cjs (176 行) — 重试与熔断器
  ├── withRetry(fn, options) → 指数退避重试
  └── CircuitBreaker class → 熔断保护

chief-tools.cjs (237 行) — Chief Agent tool definitions
  └── 任务分配、完成解析、状态查询等 tool 定义

review-tools.cjs (110 行) — 评审 tool definitions
  └── self-check / peer-review / head-approval tool 定义

decision-engine.cjs (161 行) — LLM 决策引擎
  └── DecisionEngine class → makeChiefDecision / makeCeoDecision

directive-builder.cjs (316 行) — 指令构建器
  └── DirectiveBuilder → 上下文注入、记忆、报告组装

注: LLM 模块当前由 core/ 内部使用，外部消费者通过 autopilot/gateway.cjs 间接调用。
```

---

## 关键调用链路追踪

### 场景 1: 创建 Agent

```
Browser
  → POST /api/agents                          [Layer 1: Route]
    → agent-crud.createAgent(body)            [Layer 2: Service]
      → readTemplate(templateId)              [Layer 3: Lib]
      → fs.mkdirSync(agents/{id}/)
      → fs.writeFileSync(agent.json)
      → fs.writeFileSync(AGENTS.md)
      → injectBaseRulesForAgent(agentDir)     [Layer 3: Lib]
      → syncSkillSymlinks(id, skills)         [Layer 3: Lib]
      → generateToolsMd(id, skills, dir)      [Layer 2: 内部函数]
      → fs.writeFileSync(IDENTITY.md, SOUL.md, MEMORY.md, ...)
      → fs.mkdirSync(memory/domains, memory/projects, memory/decisions, memory/relationships)
      → addToOpenclawConfig(id, dir, model)   [Layer 2: 内部函数]
        → core.repo.configRepo.addAgent()   [Layer 6: core/]
      → ensureProjectForDepartment(dept, id)  [Layer 2: 内部函数]
        → fs 确保 projects/{dept}/ 目录存在（项目由 Chief 通过 project-api 创建）
      → syncAutopilotDeptAgents(dept, id, 'add')
        → fs 更新 config/departments/{dept}/config.json
      → tryRestartGateway()                   [Layer 2: 内部函数]
        → getStatus()                         [Layer 3: Lib]
        → restartGateway()                    [Layer 3: Lib]
    ← {ok: true, id, deployed, restarted}
  ← 200 JSON
```

### 场景 2: 任务完成 + 质量门 (Dashboard 触发)

```
Browser
  → PUT /api/tasks {id, status:'completed'}   [Layer 1: Route]
    → task-api.updateTask(id, updates)        [Layer 2: Service]
      → readStandaloneTasks()                 [Layer 3: task-storage Facade]
        → core.repo.taskRepo.readStandaloneTasks() [Layer 6: core/]
      → getWorkflowForTask(task)              [Layer 3: quality-gate Facade]
        → readProjectMeta(projectId)          [Layer 3: → core.repo.taskRepo]
        → getDepartmentWorkflow(dept)         [Layer 3: department-workflow]
          → core.repo.deptConfigRepo.load(dept) [Layer 6: core/]
      → checkQualityGate(task, workflow)      [Layer 3: quality-gate Facade]
        → 查找 pipeline step
        → core.task.checkQualityGate(task, step) [Layer 6: core/]
          → 检查 selfCheck / peerReview / validators
          → 判定: passed / shouldRework / escalate
      ─── 如果通过 ───
      → createPipelineTask(task, workflow)    [Layer 3: → core.task.createPipelineTask]
      → persistNewTask(pipelineTask)          [Layer 3: → core.repo.taskRepo]
      ← {task, pipelineTask, ok: true}
      ─── 如果未通过 + shouldRework ───
      → createReworkTask(task, errors)        [Layer 3: → core.task.createReworkTask]
      → persistNewTask(reworkTask)
      ← {task, reworkTask, qualityGate, ok: true}
  ← 200 JSON
```

### 场景 3: Autopilot 部门循环 (事件驱动)

```
定时触发 / Dashboard POST /api/autopilot {action:'dept-cycle'}
  → spawn department-loop.cjs --dept novel    [Layer 2: Service]

department-loop.cjs                           [Layer 4: 编排层]
  → loadDeptConfig('novel')                   [Layer 5: Facade → readers.cjs]
    → deptConfigRepo.load('novel')            [Layer 6: core/repo/dept-config]
      → fs 读 config/departments/novel/config.json
  → checkBudget('novel')                      [Layer 5: Facade → budget.cjs]
    → core/observe/budget.checkBudget()       [Layer 6: core/observe/budget]
      → deptConfigRepo.load() → 读 budget.dailyTokenLimit
      → deptStateRepo.load() → 读 tokensUsedToday
      ← {allowed: true, ratio: 0.3}
  → loadDeptState('novel')                    [Layer 5: Facade → readers.cjs]
    → deptStateRepo.load('novel')             [Layer 6: core/repo/dept-state]
  → buildDepartmentDirective(...)             [Layer 4: dept-directive.cjs]
    → readAgentActivity()                     [Layer 5: Facade → readers.cjs]
      → sessionRepo.readAgentActivity()       [Layer 6: core/repo/session]
    → readProjectTasks()                      [Layer 5: Facade → readers.cjs]
      → taskRepo.readProjectsWithTasks()      [Layer 6: core/repo/task]
    → readDeptMission('novel')                [Layer 5: Facade → readers.cjs]
      → missionRepo.readDeptMission('novel')  [Layer 6: core/repo/mission]
    → buildMemoryContext(headId, 'department') [Layer 5: Facade → memory.cjs]
      → core/agent/memory.buildMemoryContext() [Layer 6: core/agent/memory]
        → fs 读 agents/{headId}/MEMORY.md + memory/
  → sendToAgent(headId, directive)            [Layer 4: gateway.cjs]
    → WebSocket ws://127.0.0.1:19100
    → chat.send → 收集 delta → final
    ← {ok: true, text: '...', usage: {totalTokens: 5000}}
  → trackTokenUsage('novel', usage)           [Layer 5: Facade → budget.cjs]
    → core/observe/budget.trackTokenUsage()   [Layer 6: core/observe/budget]
      → deptStateRepo.load() → tokensUsedToday += 5000 → save()
  → compressMemoryByRole(headId, response, 'leader') [Layer 5: Facade → memory.cjs]
    → core/agent/memory.compressMemoryByRole() [Layer 6: core/agent/memory]
      → 提取决策 + 产出 → 写入 memory/YYYY-MM-DD.md
  → autoTransitionTasks(response)             [Layer 4: department-loop.cjs]
    → 解析 response 中的任务状态变更
    → 识别 review 状态任务:
      → processQualityGate('novel', task)     [Layer 5: Facade → quality-gate.cjs]
        → QualityOrchestrator.process()       [Layer 6: core/task/quality-orchestrator]
          → sendFn(assignee, key, prompt, 60s) → Agent 自检
          ← selfCheck: {passed: true, score: 85}
          → selectReviewer('novel', task, config)
            → 查 REVIEWER_MAP[type] → 最空闲 candidate
          → sendFn(reviewer, key, prompt, 60s) → 同行评审
          ← peerReview: {passed: true, score: 80}
          → sendFn(headId, key, prompt, 60s)  → 主管审批
          ← headApproval: {passed: true}
        ← {passed: true}
      → updateTaskStatus(taskId, 'completed') [Layer 5: Facade → task-bridge.cjs]
        → core/common/task-bridge              [Layer 6: core/common/task-bridge]
          → HTTP PUT /api/agent-tasks          [回到 Dashboard API]
  → saveDeptState('novel', state)             [Layer 5: Facade → readers.cjs]
    → deptStateRepo.save('novel', state)      [Layer 6: core/repo/dept-state]
```

### 场景 4: Autopilot → Dashboard 回写任务 + 事件中继

```
task-bridge.cjs (core/common/)                [Layer 6]
  → HTTP PUT http://localhost:3100/api/agent-tasks
    → agent-tasks/route.ts                    [Layer 1: Route]
      → findTaskById(taskId)                  [Layer 3: task-storage Facade → core/]
      → updateTaskInPlace(taskId, updates)    [Layer 3: task-storage Facade → core/]
      → relayEvent('task-status-change', {...}) [Layer 3: event-relay]
        → fs.appendFileSync(config/.autopilot-signal)
        → Autopilot SignalWatcher 接收事件 → EventBus 分发
      → 如果 status=completed:
        → getWorkflowForTask(task)            [Layer 3: quality-gate Facade]
        → checkQualityGate(task, workflow)    [Layer 3: → core.task.checkQualityGate]
        → createPipelineTask / createReworkTask [Layer 3: → core.task.*]
    ← 200 JSON {task, ok: true}
```

### 场景 5: SSE 实时数据推送

```
Browser
  → GET /api/events                            [Layer 1: Route (SSE)]
    → 单例服务端轮询循环:
      每 5s:  fetchLogsData()                  [Layer 3: data-fetchers]
      每 10s: fetchAgentsData()                [Layer 3: data-fetchers]
              fetchTasksData()                 [Layer 3: → core.repo.taskRepo]
              fetchMessagesData()              [Layer 3: → gwCallAsync]
              fetchAutopilotStatusData()       [Layer 3: → core.common.loadState]
      每 15s: fetchHealthData()                [Layer 3: → gwCallAsync]
      每 30s: fetchUsageData()                 [Layer 3: → gwCallAsync]
              fetchCostsData()                 [Layer 3: → core.observe.queryCosts]
              fetchAlertsData()                [Layer 3: → fs 读 alerts.json]
              fetchAutopilotDeptsData()        [Layer 3: → fs 读 departments.json]
      每 60s: fetchBudgetStatusData()          [Layer 3: → core.observe.loadCompanyBudget]
    → 广播到所有连接的 SSE 客户端
    ← data: {"type":"agents","payload":[...]}
```

---

## 跨进程通信架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Dashboard 进程 (Next.js)                       │
│                                                                      │
│  event-relay.ts                                                      │
│    └─ relayEvent() → appendFileSync(config/.autopilot-signal)       │
│                                                                      │
│  events/route.ts (SSE)                                               │
│    └─ 轮询 data-fetchers → 广播到 Browser                           │
│                                                                      │
│  agent-tasks/route.ts                                                │
│    └─ 处理 Autopilot HTTP 回写 → relayEvent() 通知                  │
└──────────────┬──────────────────────────────────────────────────────┘
               │ fs.appendFileSync (signal file)
               │ HTTP PUT /api/agent-tasks (task-bridge)
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Autopilot 进程 (Node.js CJS)                    │
│                                                                       │
│  SignalWatcher (fs.watch)                                             │
│    └─ 读取 config/.autopilot-signal → 解析 JSONL → eventBus.fire()  │
│                                                                       │
│  EventBus (Singleton)                                                 │
│    ├─ Scheduler 响应事件 → 触发优先循环                               │
│    ├─ Reactors (cost-alert / cycle-monitor / alert-bridge)            │
│    └─ AdaptiveTimer 根据活跃度调整间隔                                │
│                                                                       │
│  task-bridge.cjs (core/common/)                                       │
│    └─ HTTP 回写任务状态到 Dashboard API                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 数据流向总结

```
                    ┌─────────────────┐
                    │   Browser/User  │
                    └────────┬────────┘
                             │ HTTP + SSE
                             ▼
               ┌─────────────────────────┐
               │  Dashboard (Next.js)     │
               │  Routes → Services → Lib │
               │           ↓ core-bridge  │
               │  events/ SSE 广播        │
               │  event-relay → 信号文件   │
               └─────────────┬───────────┘
                             │ require (core-bridge.ts)
                             │ HTTP (/api/agent-tasks)
                             │ fs (config/.autopilot-signal)
               ┌─────────────┼───────────┐
               │             ▼           │
               │  ┌─────────────────┐    │
               │  │  Autopilot 进程  │    │
               │  │  事件驱动:       │    │
               │  │  SignalWatcher   │    │
               │  │  → EventBus     │    │
               │  │  → Scheduler    │    │
               │  │  → AdaptiveTimer│    │
               │  │  编排 → Facade   │    │
               │  └────────┬────────┘    │
               │           │ require     │
               │           ▼             │
               │  ┌─────────────────┐    │  WebSocket
               │  │  Core 业务内核   │────┼──────────→ Gateway (19100)
               │  │  repo/ task/    │    │              │
               │  │  observe/ llm/  │    │              ▼
               │  │  agent/ common/ │    │         ┌─────────┐
               │  └────────┬────────┘    │         │  Agent   │
               │           │             │         │ (Claude) │
               │  ┌────────┴────────┐    │         └─────────┘
               │  │  Entity 实体层   │    │
               │  │  常量/类型/默认值│    │
               │  └─────────────────┘    │
               │                         │
               │  ★ Dashboard + Autopilot│
               │    共用同一 core/ 实例   │
               │    共用同一 entity/ 定义 │
               │           │ 读写        │
               │           ▼             │
               │    config/departments/  │
               │    .openclaw-state/     │
               │    agents/*/memory/     │
               └─────────────────────────┘
```

---

## 实战推演：小说部门完整运行链路

> 基于实际代码逻辑 + 真实部门配置推演。
> 部门：网文创作部（novel），10 个 Agent，MiniMax-M2.5 模型，项目：返利消费者系统网文。

### 部门配置概览

```
部门 ID:    novel (📚 网文创作部)
部门主管:   novel-chief (Novel Chief Planner)
循环间隔:   600s (10 分钟)
日预算:     800,000 tokens
KPI 目标:   5 章/天, 质量 ≥ 75, 完成率 ≥ 80%

10 人团队:
  novel-chief       — 总策划：创意方向、团队协调
  novel-writer      — 写手：按大纲写章节 (2000-3000 字/章)
  plot-architect    — 大纲师：主线/卷/章大纲、节奏把控
  character-designer — 人设师：角色档案、关系网、角色弧线
  worldbuilder      — 世界观师：力量体系、地理、阵营、历史
  style-editor      — 文笔编辑：润色、去 AI 味、一致性
  pacing-designer   — 节奏师：情绪曲线、高潮分布、章末钩子
  continuity-mgr    — 连续性检查：Bug 追踪、时间线一致性
  reader-analyst    — 读者分析：读者心理、留存策略
  novel-researcher  — 调研员：类型分析、竞品分析、素材收集

质量门 pipeline:
  writing → editing gate:
    minScore:75, selfCheck:true, maxReworks:3
    validators: wordCount(≥3000), noEndingKeywords, similarity(≤30%)
  editing → review gate:
    minScore:75, selfCheck:true, peerReview:true, maxReworks:2
```

---

### 第一幕：CEO 循环触发部门调度

**触发**：Dashboard 用户点击 "Start All Loops" → `POST /api/autopilot {action:'start-all'}`

```
autopilot-api.ts: startAllLoops()                          [Layer 2: Service]
  → spawn('node', ['scripts/autopilot/index.cjs', '--all'], {detached: true})
  → 进程 PID 写入 autopilot-state.json
```

**index.cjs 启动**：

```
index.cjs main()                                           [Layer 4: 编排层]
  ┌─ loadState()                                           [Layer 5: Facade → state.cjs]
  │    → core/common/autopilot-state.loadState()           [Layer 6: core/]
  │    ← {status:'running', pid:12345, cycleCount:3}
  │
  ├─ SignalWatcher(config/.autopilot-signal, eventBus)     [core/observe]
  │    → fs.watch 开始监听 Dashboard 事件中继
  │
  ├─ AdaptiveTimer({baseInterval:600, min:120, max:1800})  [core/observe]
  │    → 初始间隔 600s (10 分钟)
  │
  ├─ Scheduler(eventBus)                                   [core/observe]
  │    → 注册 'task-status-change' → 可触发优先循环
  │
  ├─ runCycle('coordination')                              CEO 先跑一轮协调
  │    → buildDirective('coordination')                    [Layer 4: directive.cjs]
  │       → readMission()                                  [Layer 5 → core/repo/mission]
  │           ← "以盈利为核心目标的 AI 公司..."
  │       → readProjectTasks()                             [Layer 5 → core/repo/task]
  │           ← projects/novel/ 下的任务列表
  │       → readAgentActivity()                            [Layer 5 → core/repo/session]
  │           ← 10 个 Agent 全部 idle (idleMins > 600)
  │       → readAllDepartmentReports()                     [Layer 5 → core/repo/mission]
  │           ← novel 部门上一轮报告
  │    → sendToCeo(directive)                              [Layer 4: gateway.cjs]
  │       → WebSocket ws://127.0.0.1:19100 → Gateway → ceo Agent
  │    → CEO 回复: "小说部门继续推进返利消费者项目，进入大纲细化阶段"
  │    → compressMemory('ceo', response)                   [Layer 5 → core/agent/memory]
  │       → 写入 agents/ceo/memory/2026-03-17.md
  │    → saveState({cycleCount:4})                         [Layer 5 → core/common]
  │
  └─ discoverActiveDepartments()
       → 扫描 config/departments/ → 找到 novel (enabled:true)
       → runDepartmentCycle('novel')                       启动小说部门循环
```

---

### 第二幕：部门循环启动 — novel-chief 接收指令

**department-loop.cjs: runDepartmentCycle('novel')**

```
Step 1: 加载配置                                            [Layer 5 → core/repo]
  loadDeptConfig('novel')
    → deptConfigRepo.load('novel')
    → 读 config/departments/novel/config.json
    ← {head:'novel-chief', agents:[10人],
       budget:{dailyTokenLimit:800000, alertThreshold:0.8},
       interval:600, enabled:true}

Step 2: 预算检查                                            [Layer 5 → core/observe]
  checkBudget('novel')
    → core/observe/budget.checkBudget()
    → deptState.tokensUsedToday = 0, limit = 800,000
    ← {allowed: true, ratio: 0.0}
    ✅ 预算充足

Step 3: 加载部门状态                                        [Layer 5 → core/repo]
  loadDeptState('novel')
    → deptStateRepo.load('novel')
    ← {cycleCount:3, lastCycle:'2026-03-09T03:06:46Z', tokensUsedToday:0}

Step 4: 会话健康检查                                        [Layer 4]
  ensureSessionHealth('novel-chief')
    → getSessionTokenInfo('novel-chief', 'agent:novel-chief:autopilot')
    → 当前 tokens < 500,000 → ✅ 正常
    (500K~800K → compactSession() 压缩上下文,
     > 800K → killSession() 重置会话)
```

**构建部门指令**：

```
Step 5: buildDepartmentDirective(...)                       [Layer 4: dept-directive.cjs]
  → readDeptMission('novel')                               [Layer 5 → core/repo/mission]
      ← "批量生产高质量网文内容，通过平台分成实现稳定收入..."
  → readBaseMission()
      ← "以盈利为核心目标..."
  → readProjectTasks()                                     [Layer 5 → core/repo/task]
      → 扫描 projects/novel/*/ → 读 .project-meta.json → 任务列表:
         task-001: "细化第一卷大纲(Ch1-30)" type:plotting  status:assigned  assignee:plot-architect
         task-002: "主角人设完善"           type:character status:assigned  assignee:character-designer
         task-003: "返利系统规则设定"       type:worldbuilding status:in_progress assignee:worldbuilder
         task-004: "竞品深度分析"           type:research  status:completed assignee:novel-researcher
  → readAgentActivity()                                    [Layer 5 → core/repo/session]
      → 读 .openclaw-state/agents/*/status.json
      ← {novel-chief: {idleMins:15}, worldbuilder: {idleMins:3},
         plot-architect: {idleMins:600}, character-designer: {idleMins:600},
         novel-writer: {idleMins:600}, ...其余 idle}
  → buildMemoryContext('novel-chief', 'department')        [Layer 5 → core/agent/memory]
      → 读 agents/novel-chief/MEMORY.md (前 2000 字)
      → 读 memory/decisions/ (近期决策)
      ← {summary: "项目进入大纲阶段，研究已完成...",
          recentDecisions: ["确定番茄小说为主平台", "采用消费返利+重生+都市题材"]}
  → readCeoDirectives('novel')
      ← "继续推进返利消费者项目，进入大纲细化阶段"
  → buildTeamStatus(config, activity)
      ← "🟢 worldbuilder — 活跃 (3min) — 1 个进行中任务
          ⚪ plot-architect — 空闲 (10h) — 1 个已分配任务
          ⚪ character-designer — 空闲 (10h) — 1 个已分配任务
          ⚪ novel-writer — 空闲 — 无任务
          ⚪ style-editor / pacing-designer / continuity-mgr / reader-analyst / novel-researcher — 空闲"

组装最终指令:
  ┌─────────────────────────────────────────────────┐
  │ [部门使命] 批量生产高质量网文...                   │
  │ [CEO 指令] 继续推进返利消费者项目，大纲细化        │
  │ [记忆上下文] 项目进入大纲阶段，研究已完成           │
  │ [任务看板]                                        │
  │   ✅ task-004 竞品深度分析 (completed)             │
  │   🔵 task-003 返利系统规则设定 (in_progress)       │
  │   📋 task-001 细化第一卷大纲 (assigned)            │
  │   📋 task-002 主角人设完善 (assigned)              │
  │ [团队状态] worldbuilder 活跃, 其余空闲              │
  │ [KPI] 目标: 5 章/天, 质量 ≥ 75, 完成率 ≥ 80%      │
  └─────────────────────────────────────────────────┘
```

**发送给 novel-chief**：

```
Step 6: sendToAgent('novel-chief', 'agent:novel-chief:autopilot', directive, 60000)
  → WebSocket ws://127.0.0.1:19100                        [Layer 4: gateway.cjs]
  → connect + token → hello-ok
  → chat.send({sessionKey:'agent:novel-chief:autopilot', message: directive})
  → 收集 delta → final
```

---

### 第三幕：novel-chief 决策与任务分配

**Gateway 将指令发给 novel-chief (MiniMax-M2.5)，Chief 回复**：

```
novel-chief 回复 (模拟):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[状态评估]
竞品分析(task-004)已完成，worldbuilder 正在推进系统规则(task-003)。
plot-architect 和 character-designer 已分配任务但长时间空闲，需要催促。
novel-writer 等 5 人空闲，当前阶段暂无可分配工作。

[任务分配]
- @plot-architect: 请立即开始 task-001 "细化第一卷大纲(Ch1-30)"，
  参考 projects/novel/rebate-consumer/research/cycle3.md 的竞品分析结果。
  产出到 workspaces/plot-architect/rebate-consumer/drafts/volume1-outline-v1.md
- @character-designer: 请立即开始 task-002 "主角人设完善"，
  基于 vision.md 中的角色弧线展开。
  产出到 workspaces/character-designer/rebate-consumer/drafts/protagonist-v1.md
- @pacing-designer: 新建任务 "第一卷节奏曲线设计"，
  分析 30 章的情绪波动和高潮分布。

[任务完成]
确认 task-004 竞品深度分析已完成。

[决策记录]
大纲、人设、世界观三线并行推进，预计 2-3 个循环后汇总对齐。
pacing-designer 提前介入，避免大纲完成后再返工节奏。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 第四幕：department-loop 解析回复 & 执行

```
Step 7: 记录 token 消耗                                    [Layer 5 → core/observe]
  trackTokenUsage('novel', {totalTokens:5200, inputTokens:4000, outputTokens:1200})
    → deptState.tokensUsedToday += 5200 → 5200 / 800000 = 0.65%
    → eventBus.fire('token-usage', {deptId:'novel', total:5200})

Step 8: 压缩记忆                                           [Layer 5 → core/agent/memory]
  compressMemoryByRole('novel-chief', response, 'leader')
    → 提取决策: "三线并行推进，pacing-designer 提前介入"
    → 提取产出: 任务分配列表
    → 写入 agents/novel-chief/memory/2026-03-17.md

Step 9: autoTransitionTasks(response)                      [Layer 4]
  → parseTaskAssignments(response)                         [core/task/auto-transition]
      ← [{agentId:'plot-architect', summary:'细化第一卷大纲'},
          {agentId:'character-designer', summary:'主角人设完善'},
          {agentId:'pacing-designer', summary:'第一卷节奏曲线设计'}]

  → parseTaskCompletions(response)                         [core/task/auto-transition]
      ← ['task-004']

  → computeTransitions({allTasks, agentActivity, chiefResponseText})
      ← [{taskId:'task-001', from:'assigned',  to:'in_progress', reason:'chief 分配'},
         {taskId:'task-002', from:'assigned',  to:'in_progress', reason:'chief 分配'},
         {taskId:'task-004', from:'completed', to:'_quality_gate', reason:'chief 确认完成'}]
```

**逐个执行 transition**：

```
─── task-001: assigned → in_progress ──────────────────────────────────
  updateTaskStatus('plot-architect', 'task-001', 'in_progress')
    → core/common/task-bridge.cjs                          [Layer 6]
    → HTTP PUT http://localhost:3100/api/agent-tasks
      → agent-tasks/route.ts                               [Layer 1]
        → TRANSITIONS['assigned'] 包含 'in_progress' ✅
        → 无前置依赖 ✅
        → updateTaskInPlace('task-001', {status:'in_progress',
                                         startedAt:'2026-03-17T10:01:00Z'})
                                                           [Layer 3 → core/repo/task]
        → relayEvent('task-status-change', {taskId:'task-001', status:'in_progress'})
            → fs.appendFileSync(config/.autopilot-signal)  [Layer 3: event-relay]
            → SignalWatcher 接收 → eventBus.fire()         [Autopilot 进程]
      ← 200 {ok:true, task:{id:'task-001', status:'in_progress'}}

─── task-002: assigned → in_progress ──────────────────────────────────
  (同上流程)

─── task-004: completed → 质量门 ──────────────────────────────────────
  processQualityGate('novel', task-004)                    [Layer 5 → core/task]
    → QualityOrchestrator.process('novel', task-004)
    (详见第五幕)

─── pacing-designer 新任务创建 ────────────────────────────────────────
  createWorkTask('pacing-designer', '第一卷节奏曲线设计', 'novel', {type:'plotting'})
    → findActiveTaskForAgent('pacing-designer', 'novel')   [Layer 6: core/common]
      → GET /api/agent-tasks?agent=pacing-designer&projectId=novel
      ← 无活跃任务
    → POST /api/agent-tasks                                [Layer 1]
      ← {id:'task-005', name:'第一卷节奏曲线设计', type:'plotting',
         assignee:'pacing-designer', projectId:'novel', status:'pending'}
    → relayEvent('task-created', {taskId:'task-005'})
```

---

### 第五幕：质量门流程 — task-004 "竞品深度分析"

```
QualityOrchestrator.process('novel', task-004)             [Layer 6: core/task]
  │
  ├─ Step 1: loadDeptConfig('novel')
  │    → 查找 pipeline: task-004.type = 'research'
  │    → pipeline 中无 research 类型的 gate 定义
  │    → 使用 DEFAULT_GATE_CONFIG: {minScore:70, selfCheck:true, peerReview:false}
  │
  ├─ Step 2: requestSelfCheck (自检)
  │    → sendFn('novel-researcher', 'agent:novel-researcher:review', selfCheckPrompt, 60000)
  │      → WebSocket → Gateway → novel-researcher (MiniMax-M2.5)
  │
  │    发送给 novel-researcher 的 prompt:
  │    ┌─────────────────────────────────────────────┐
  │    │ 请对你完成的任务进行自我评审:                  │
  │    │ 任务: 竞品深度分析                             │
  │    │ 产出: projects/novel/rebate-consumer/research/ │
  │    │                                                │
  │    │ 评分标准 (0-100):                              │
  │    │ - 完整性: 是否覆盖所有竞品?                    │
  │    │ - 深度: 分析是否有洞察?                        │
  │    │ - 可操作性: 建议是否具体可执行?                │
  │    └─────────────────────────────────────────────┘
  │
  │    novel-researcher 回复:
  │    ← selfCheck: {score: 82, passed: true, comments: "覆盖4部竞品，提炼了差异化策略"}
  │
  ├─ Step 3: 分数 82 ≥ minScore 70 ✅
  │    → peerReview 未配置 → 跳过
  │    → headApproval 未配置 → 跳过
  │
  └─ 结果: {passed: true, reason: 'self-check passed with score 82'}

  → updateTaskStatus('novel-researcher', 'task-004', 'completed')
    → HTTP PUT /api/agent-tasks                            [Layer 1]
    → checkQualityGate(task-004, workflow) → {passed:true}
    → pipeline 中无后续步骤 (research 无 pipeline)
    → 任务最终状态: completed ✅
```

---

### 第六幕：下一个循环 — Agent 间交流

**10 分钟后，AdaptiveTimer 触发下一次 runDepartmentCycle('novel')**

此时各 Agent 的工作状态：

```
worldbuilder       — in_progress (task-003 返利系统规则) — 产出中
plot-architect     — in_progress (task-001 第一卷大纲)   — 产出中
character-designer — in_progress (task-002 主角人设)     — 产出中
pacing-designer    — pending     (task-005 节奏曲线)     — 等待分配
其余 6 人          — idle
```

**Agent 间通信**（通过 peer-send 技能，异步消息，经 Gateway WebSocket 传递）：

```
plot-architect → character-designer:
┌─────────────────────────────────────────────────────────┐
│ [Inter-Agent Message from: plot-architect]               │
│ [Task Reference: task-001]                               │
│                                                          │
│ 大纲 Ch7-10 涉及主角首次大额消费场景，需要确认:          │
│ 1. 主角性格在"被甩"后是否会报复性消费？还是理性消费？     │
│ 2. 前女友再次出现时，主角的态度是冷漠还是展示？           │
│ 请参考 workspaces/plot-architect/rebate-consumer/         │
│   drafts/volume1-outline-v1.md 第7-10章部分               │
└─────────────────────────────────────────────────────────┘

character-designer → plot-architect:
┌─────────────────────────────────────────────────────────┐
│ [Inter-Agent Message from: character-designer]           │
│ [Task Reference: task-002]                               │
│                                                          │
│ 根据人设定义:                                             │
│ - 主角前期"闷骚型"，表面理性但内心渴望证明自己            │
│ - 消费行为: 表面理性(有系统规则约束)，但选择消费场景       │
│   时会"巧合"出现在前女友面前 → 间接炫耀而非直接报复       │
│ - 前女友再现: 冷漠+不经意展示 > 刻意炫耀                  │
│   (更符合"逆袭"爽感，读者代入感更强)                       │
│ 详见 workspaces/character-designer/rebate-consumer/       │
│   drafts/protagonist-v1.md 性格曲线章节                   │
└─────────────────────────────────────────────────────────┘

worldbuilder → plot-architect:
┌─────────────────────────────────────────────────────────┐
│ [Inter-Agent Message from: worldbuilder]                 │
│ [Task Reference: task-003]                               │
│                                                          │
│ 系统规则已初步定稿，关键约束供大纲参考:                    │
│ - Lv1 返利比 1:10，冷却期 24h，单笔上限 1万               │
│ - Lv2 解锁条件: 累计消费 50万，返利比 1:15                │
│ - 利他消费(帮别人买单)额外 +20% 返利                      │
│ - 系统惩罚: 连续 3 天不消费，返利比下降 10%               │
│ → 这意味着大纲需要设计"每日消费"的情节驱动力              │
│ 完整规则: projects/novel/rebate-consumer/world/           │
│   system-rules-v1.md                                     │
└─────────────────────────────────────────────────────────┘
```

**Dashboard 聚合消息**（`messages/route.ts`）：

```
messages/route.ts: GET /api/messages                       [Layer 1]
  → gwCallAsync('sessions.list', {limit:100})              [Layer 3: gateway-client]
  → 找到 agent:plot-architect:*, agent:character-designer:* 等会话
  → batch 读 chat.history (每 5 个并行, 最多 20 个)
  → 正则匹配 [Inter-Agent Message from: ...]
  → 解析为 {fromAgent:'plot-architect', toAgent:'character-designer',
            type:'send', content:'大纲Ch7-10涉及...', timestamp:'...'}
  → events/route.ts SSE 广播给前端
  ← data: {"type":"messages","payload":[...]}
```

---

### 第七幕：写作阶段 + 严格质量门

**假设又过了几个循环，大纲和人设完成，进入写作阶段。
novel-chief 分配写作任务**：

```
novel-chief 在某次循环中分配:
  task-010: "第1章 毕业聚会"  type:writing assignee:novel-writer
  task-011: "第2章 系统激活"  type:writing assignee:novel-writer
  task-012: "第3章 第一次消费" type:writing assignee:novel-writer
```

**novel-writer 完成 task-010，触发 writing 质量门**：

```
updateTaskStatus('novel-writer', 'task-010', 'completed')
  → HTTP PUT /api/agent-tasks                              [Layer 1]
  → agent-tasks/route.ts:
    → status 从 in_progress → completed
    → TRANSITIONS['in_progress'] 包含 'completed' ✅

    → getWorkflowForTask(task-010)                         [Layer 3: quality-gate]
      → readProjectMeta('novel') → {department:'novel'}
      → getDepartmentWorkflow('novel')                     [Layer 3: department-workflow]
        → core.repo.deptConfigRepo.load('novel')           [Layer 6: core/repo]
      → 找到 pipeline: writing → editing gate:
        {from:'writing', to:'editing',
         gate:{minScore:75, selfCheck:true, maxReworks:3,
               validators:['wordCount','noEndingKeywords','similarity']},
         config:{minWords:3000, avoidEndings:true, maxRepeatRatio:0.3}}

    → checkQualityGate(task-010, workflow)                  [Layer 3 → core/task]
      → core.task.checkQualityGate(task-010, pipelineStep)  [Layer 6]
```

**质量门详细校验**：

```
quality-validator.cjs: checkQualityGate(task-010, step)    [Layer 6: core/task]
  │
  ├─ validator 1: wordCount
  │    → 读取产出文件字数
  │    → 实际: 2,800 字 < minWords: 3,000
  │    ← error: "字数不足: 2800/3000"
  │
  ├─ validator 2: noEndingKeywords
  │    → 检查是否包含 AI 常见结尾词 ("综上所述","总而言之","希望以上")
  │    ← ✅ 无违规
  │
  ├─ validator 3: similarity
  │    → 对比最近完成的同类任务，100 字符块比对
  │    → 重复率 8% < maxRepeatRatio 30%
  │    ← ✅ 通过
  │
  ├─ 自检分数: 未执行 (validator 已有失败项)
  │
  └─ 结果:
     {passed: false,
      errors: ["字数不足: 2800/3000"],
      shouldRework: true,    ← reworkCount(0) < maxReworks(3)
      escalate: false}

  → createReworkTask(task-010, ["字数不足: 2800/3000"])     [Layer 6: core/task]
    ← {id:'task-010-rework-1',
        name:'返工: 第1章 毕业聚会',
        type:'writing',
        assignee:'novel-writer',
        status:'pending',
        reworkFromId:'task-010',
        reworkErrors:["字数不足: 2800/3000"],
        reworkCount: 1}

  → persistNewTask(reworkTask)                             [Layer 3 → core/repo/task]
    → core.repo.taskRepo.writeProjectMeta('novel', updatedMeta)

  → relayEvent('task-rework', {taskId:'task-010', reworkId:'task-010-rework-1'})
    → fs.appendFileSync(config/.autopilot-signal)

  ← 200 {ok:true, task:{status:'completed'},
          qualityGate:{passed:false, errors:["字数不足"]},
          reworkTask:{id:'task-010-rework-1'}}
```

**novel-writer 补充字数后再次提交**：

```
(novel-writer 收到返工任务 → 补充内容 → 3,200 字)

updateTaskStatus('novel-writer', 'task-010-rework-1', 'completed')
  → checkQualityGate 再次运行:
    ├─ wordCount: 3,200 ≥ 3,000 ✅
    ├─ noEndingKeywords: ✅
    ├─ similarity: 12% < 30% ✅
    ├─ selfCheck: novel-writer 自评 78 分 ≥ 75 ✅
    └─ {passed: true}

  → createPipelineTask(task-010-rework-1, pipelineStep)    [Layer 6: core/task]
    → pipeline: writing → editing
    ← {id:'task-013',
        name:'审校: 第1章 毕业聚会',
        type:'editing',
        assignee: null,         ← 等 novel-chief 分配给 style-editor
        status:'pending',
        pipelineFromId:'task-010-rework-1'}

  → persistNewTask(pipelineTask)                           [Layer 3 → core/repo/task]

  → 回溯 rework 链:
    → task-010-rework-1.reworkFromId = 'task-010'
    → task-010 标记为最终 completed

  ← 200 {ok:true, qualityGate:{passed:true},
          pipelineTask:{id:'task-013', type:'editing'}}
```

---

### 第八幕：editing 阶段 + peer review

**下一循环 novel-chief 看到 task-013 待分配，分配给 style-editor**：

```
novel-chief: "@style-editor 请审校第1章，注意去除AI味，保持网文节奏感"
  → autoTransitionTasks 解析:
    → task-013: pending → assigned → in_progress (assignee: style-editor)
    → updateTaskStatus → HTTP PUT /api/agent-tasks → relayEvent
```

**style-editor 完成后，触发 editing → review gate (含 peer review)**：

```
quality-validator.cjs: checkQualityGate(task-013, editingGateStep)
  │
  │ editing gate: {minScore:75, selfCheck:true, peerReview:true, maxReworks:2}
  │
  ├─ Step 1: selfCheck
  │    → sendFn('style-editor', sessionKey, selfCheckPrompt)
  │      → WebSocket → Gateway → style-editor (MiniMax-M2.5)
  │    ← {score:80, passed:true, comments:"已去除3处AI腔，调整段落节奏"}
  │    ✅ 80 ≥ 75
  │
  ├─ Step 2: selectReviewer('novel', task-013, config)     [Layer 6: core/task]
  │    → REVIEWER_MAP['editing'] 或 tag 匹配
  │    → candidates: [continuity-mgr, reader-analyst]
  │    → readAgentActivity()                               [Layer 5 → core/repo/session]
  │       ← continuity-mgr idle 5min, reader-analyst idle 30min
  │    → 选择最空闲: reader-analyst
  │    ← 'reader-analyst'
  │
  ├─ Step 3: peerReview
  │    → sendFn('reader-analyst', sessionKey, peerReviewPrompt)
  │      → WebSocket → Gateway → reader-analyst (MiniMax-M2.5)
  │    ┌─────────────────────────────────────────────┐
  │    │ 请评审 style-editor 完成的审校任务:           │
  │    │ 文件: projects/novel/rebate-consumer/         │
  │    │       chapters/ch01-graduation-party.md       │
  │    │ 评分标准: 读者留存率、节奏感、代入感           │
  │    └─────────────────────────────────────────────┘
  │    ← {score:76, passed:true,
  │       comments:"开篇节奏好，但第3段内心独白略长，建议缩减"}
  │    ✅ 76 ≥ 75
  │
  ├─ Step 4: headApproval (editing gate 未配置)
  │    → 跳过
  │
  └─ 结果: {passed: true}

  → pipeline 中无后续步骤 (editing → review 无更多 gate)
  → task-013 最终状态: completed ✅
```

---

### 第九幕：Dashboard 实时展示

**整个过程中，Browser 通过 SSE 实时接收更新**：

```
Browser ←── SSE GET /api/events ←── 服务端轮询             [Layer 1]

每 10s: data: {"type":"tasks","payload":[
  {"id":"task-001","name":"细化第一卷大纲","status":"in_progress",
   "assignee":"plot-architect"},
  {"id":"task-010","name":"第1章 毕业聚会","status":"completed",
   "assignee":"novel-writer","qualityGate":{"passed":true}},
  {"id":"task-010-rework-1","name":"返工: 第1章","status":"completed",
   "reworkFromId":"task-010"},
  {"id":"task-013","name":"审校: 第1章","status":"completed",
   "assignee":"style-editor"},
  ...
]}

每 10s: data: {"type":"messages","payload":[
  {"fromAgent":"plot-architect","toAgent":"character-designer",
   "type":"send","content":"大纲Ch7-10涉及主角首次大额消费场景..."},
  {"fromAgent":"worldbuilder","toAgent":"plot-architect",
   "type":"send","content":"系统规则已初步定稿..."},
  ...
]}

每 30s: data: {"type":"costs","payload":{
  "totalCost": 0.42,
  "entries":[
    {"agent":"novel-chief","tokens":5200,"cost":0.08,"source":"autopilot"},
    {"agent":"novel-writer","tokens":12000,"cost":0.18,"source":"autopilot"},
    {"agent":"style-editor","tokens":6500,"cost":0.10,"source":"autopilot"},
    {"agent":"reader-analyst","tokens":4000,"cost":0.06,"source":"autopilot"}
  ]
}}

每 10s: data: {"type":"autopilot","payload":{
  "status":"running","cycleCount":7
}}

每 30s: data: {"type":"departments","payload":[
  {"id":"novel","cycleCount":4,"tokensUsedToday":33700,
   "budgetRatio":0.042,"agentCount":10}
]}
```

---

### 全景时间线

```
Cycle 4 (T+0min)        Cycle 5 (T+10min)       Cycle 6 (T+20min)        Cycle 7 (T+30min)
┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ CEO 协调循环      │    │ Agent 间交流     │    │ 大纲/人设完成     │    │ 写作阶段开始          │
│ → novel 部门启动  │    │ plot↔character  │    │ chief 汇总对齐    │    │ writer 写 Ch1-3       │
│ chief 接收指令    │    │ world→plot 规则  │    │ 分配写作任务       │    │ Ch1 质量门 ❌ (字数)   │
│ 分配 3 个任务     │    │ pacing 开始节奏  │    │ writer 进入状态    │    │ → rework → ✅          │
│ 确认 task-004    │    │                 │    │                  │    │ → pipeline → editing   │
│ 创建 task-005    │    │                 │    │                  │    │ editor 审校 → peer ✅   │
└─────────────────┘    └─────────────────┘    └──────────────────┘    └──────────────────────┘
         │                      │                       │                        │
   预算: 0.65%             预算: 3.2%              预算: 5.1%              预算: 8.4%
   tokens: 5,200          tokens: 25,600          tokens: 40,800          tokens: 67,200
```

### 状态流转全景

```
novel-researcher ── task-004 research ──→ completed → 质量门 ✅ (selfCheck 82)
                                                      (无 pipeline, 终态)

worldbuilder ────── task-003 worldbuilding ──→ in_progress → completed
                                               ↓ peer-send
plot-architect ──── task-001 plotting ──→ in_progress ─────→ completed
                     ↕ peer-send           ↕ peer-send
character-designer ─ task-002 character ──→ in_progress ───→ completed

pacing-designer ─── task-005 plotting ──→ assigned → in_progress → completed

novel-writer ────── task-010 writing ──→ in_progress → completed
                                          → 质量门 ❌ (wordCount 2800 < 3000)
                                          → createReworkTask
                    task-010-rework-1 ──→ in_progress → completed
                                          → 质量门 ✅ (3200字, selfCheck 78)
                                          → createPipelineTask (writing→editing)
                    task-013 editing ────→ (由 chief 分配给 style-editor)

style-editor ────── task-013 editing ──→ in_progress → completed
                                          → 质量门 ✅ (selfCheck 80, peerReview 76)
                                          → (无后续 pipeline, 终态)
                                          → peer reviewer: reader-analyst

reader-analyst ──── (peer review 参与者, 评分 76)

continuity-mgr ──── (待大纲完成后介入一致性检查)
```

### 关键代码路径索引

| 事件 | 代码入口 | 层级 |
|------|---------|------|
| 启动所有循环 | `autopilot-api.startAllLoops()` → `index.cjs --all` | L2→L4 |
| CEO 协调 | `index.cjs runCycle()` → `directive.cjs` → `gateway.cjs` | L4 |
| 部门循环 | `department-loop.cjs runDepartmentCycle()` | L4 |
| 构建部门指令 | `dept-directive.cjs buildDepartmentDirective()` | L4 |
| 预算检查 | `budget.cjs` → `core/observe/budget.checkBudget()` | L5→L6 |
| 记忆压缩 | `memory.cjs` → `core/agent/memory.compressMemoryByRole()` | L5→L6 |
| 任务自动流转 | `auto-transition.cjs computeTransitions()` | L6 |
| 任务状态回写 | `task-bridge.cjs` → HTTP → `agent-tasks/route.ts` | L6→L1 |
| 事件中继 | `event-relay.ts relayEvent()` → `signal-watcher.cjs` | L3→L6 |
| 质量门校验 | `quality-validator.cjs checkQualityGate()` | L6 |
| Peer Review | `quality-orchestrator.cjs selectReviewer()` → `sendFn()` | L6 |
| 返工创建 | `quality-validator.cjs createReworkTask()` | L6 |
| Pipeline 推进 | `quality-validator.cjs createPipelineTask()` | L6 |
| Agent 间消息 | peer-send 技能 → Gateway → `messages/route.ts` 聚合 | Gateway→L1 |
| SSE 实时推送 | `events/route.ts` → `data-fetchers.ts` 轮询 → Browser | L1→L3 |
| 自适应间隔 | `AdaptiveTimer` 根据活跃度调整 600s~120s~1800s | L6 |
