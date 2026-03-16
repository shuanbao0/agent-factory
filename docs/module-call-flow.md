# Agent Factory 模块调用流程图

> 重构后的完整调用链路文档。每层列出精确的 import/require 关系与函数签名。

---

## 架构总览

```
 Browser
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 1 ── API Routes        (ui/src/app/api/)                  │
│             薄路由层：解析请求 → 委托 Service → 返回 JSON         │
└──────────────┬───────────────────────────────────────────────────┘
               │ import
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 2 ── Services          (ui/src/services/)                 │
│             业务编排层：组合 Lib 模块完成完整业务流程              │
└──────────────┬───────────────────────────────────────────────────┘
               │ import
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 3 ── Lib               (ui/src/lib/)                      │
│             UI 侧工具库：core-bridge 桥接、Gateway 管理、类型安全 │
│             task-storage / quality-gate 为薄 Facade 委托 core/   │
└──────────────┬───────────────────────────────────────────────────┘
               │ require (via core-bridge.ts)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 6 ── Core 业务内核     (core/)                            │
│             唯一的业务逻辑源（Dashboard + Autopilot 共用）         │
└──────────────────────────────────────────────────────────────────┘


════════════════════════════════════════════════════════════════════
 Dashboard (Next.js TS)  ↑  上层        下层  ↓  Autopilot (Node CJS)
════════════════════════════════════════════════════════════════════


┌──────────────────────────────────────────────────────────────────┐
│  Layer 4 ── Autopilot 编排层  (scripts/autopilot/)               │
│             CEO 循环 + 部门循环：调度 Agent、管理状态              │
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

### `agents/route.ts` (61 行)

```
imports:
  NextRequest, NextResponse          ← next/server
  fetchAgentsData                    ← @/lib/data-fetchers
  createAgent, updateAgent, deleteAgent  ← @/services/agent-crud

GET  /api/agents        → fetchAgentsData()
POST /api/agents        → createAgent(body)
PUT  /api/agents        → updateAgent(body)
DELETE /api/agents      → deleteAgent(id)
```

### `autopilot/route.ts` (124 行)

```
imports:
  getAutopilotOverview, getDepartments,     ← @/services/autopilot-api
  getBudgetSummary, getKpis,
  getBaseMission, getMission,
  stopAutopilot, runSingleCycle,
  startAutopilot, startAllLoops,
  startDeptLoop, stopDeptLoop,
  runDeptCycle, setBaseMission, setMission

GET  /api/autopilot?view=overview     → getAutopilotOverview()
GET  /api/autopilot?view=departments  → getDepartments()
GET  /api/autopilot?view=budgets      → getBudgetSummary()
GET  /api/autopilot?view=kpis         → getKpis()
GET  /api/autopilot?view=base-mission → getBaseMission()
GET  /api/autopilot?view=mission      → getMission()
POST /api/autopilot {action:'stop'}       → stopAutopilot()
POST /api/autopilot {action:'cycle'}      → runSingleCycle()
POST /api/autopilot {action:'start'}      → startAutopilot(interval)
POST /api/autopilot {action:'start-all'}  → startAllLoops()
POST /api/autopilot {action:'start-dept'} → startDeptLoop(deptId, interval)
POST /api/autopilot {action:'stop-dept'}  → stopDeptLoop(deptId)
POST /api/autopilot {action:'dept-cycle'} → runDeptCycle(deptId)
POST /api/autopilot {action:'set-base-mission'} → setBaseMission(content)
POST /api/autopilot {action:'set-mission'}      → setMission(content)
```

### `tasks/route.ts` (75 行)

```
imports:
  listTasks, createTask, updateTask, deleteTask  ← @/services/task-api

GET    /api/tasks?projectId&status&assignee&type  → listTasks(filters)
POST   /api/tasks                                  → createTask(body)
PUT    /api/tasks {id, ...updates}                 → updateTask(id, updates)
DELETE /api/tasks?id                               → deleteTask(id)
```

### `agent-tasks/route.ts` (267 行，通过 Facade 间接使用 core/)

```
imports:
  findAllTasks, findTaskById,             ← @/lib/task-storage (Facade → core/)
  updateTaskInPlace, readStandaloneTasks,
  writeStandaloneTasks, readProjectMeta,
  writeProjectMeta

  checkQualityGate, createPipelineTask,   ← @/lib/quality-gate (Facade → core/)
  createReworkTask, persistNewTask,
  getWorkflowForTask

GET  /api/agent-tasks?agent&projectId     → findAllTasks() + filter
POST /api/agent-tasks                      → 创建任务 (inline)
PUT  /api/agent-tasks {taskId,status,...}  → updateTaskInPlace() + 质量门
```

---

## Layer 2: Services

> 职责：业务编排。组合 Lib 模块完成完整业务流程。通过 `core-bridge.ts` 统一访问 core/。

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
        → 创建 workspaces/{id}/ → 注册到 openclaw.json
        → 同步部门配置 → 重启 Gateway

  updateAgent(body) → {ok}
    流程: 读 agent.json → 合并更新 → 重注入 base-rules
        → 同步技能 → 更新 openclaw.json → 重启 Gateway

  deleteAgent(id) → {ok, restarted, archivedTo}
    流程: 移除 openclaw.json → 删除 agents/{id}/
        → 删除 .openclaw-state/agents/{id}/
        → 归档 workspaces/{id}/ → 重启 Gateway
```

### `autopilot-api.ts` (~334 行)

```
imports:
  spawn                          ← child_process
  readFileSync, existsSync,      ← fs
  readdirSync
  resolve, join                  ← path
  logError                       ← @/lib/error-logger
  core                           ← @/lib/core-bridge

内部函数:
  loadState()                    → 委托 core.common.loadState()
  saveState(state)               → 委托 core.common.saveState()
  isProcessRunning(pid)          → process.kill(pid, 0)
  atomicWriteSync(path, data)    → 原子写入 (仅 mission 写入)
  loadDepartments()              → 组合 core.repo.deptConfigRepo/deptStateRepo/missionRepo
  loadBudgetSummary()            → 委托 core.observe.getBudgetSummary()

导出:
  getAutopilotOverview()         → 全局状态 + mission + history
  getDepartments()               → 部门列表 (config + state + report)
  getBudgetSummary()             → 公司 + 部门预算用量
  getKpis()                      → 部门 KPI 数据
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

### `task-api.ts` (280 行)

```
imports:
  existsSync, readFileSync       ← fs
  join, resolve                  ← path
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

导出:
  listTasks({projectId?, status?, assignee?, type?})
    → 合并 readProjectTasks() + readStandaloneTasks()
    → 过滤 → 按 priority + updatedAt 排序

  createTask(body) → {task, ok}
    → 生成 ID → 构造 Task → 写入 project 或 standalone

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

### 关键模块调用关系

```
core-bridge.ts                              ★ 唯一的 core/ 入口
  └──→ require('../../core')  (CJS→TS 桥接)

quality-gate.ts  (薄 Facade，~66 行)
  ├──→ core-bridge.ts          (core.task.checkQualityGate 等)
  ├──→ task-storage.ts         (readProjectMeta)
  └──→ department-workflow.ts  (getDepartmentWorkflow)

task-storage.ts  (薄 Facade，~53 行)
  └──→ core-bridge.ts          (core.repo.taskRepo.*)

department-workflow.ts
  └──→ fs                 (直接读 config/departments/*/config.json)

data-fetchers.ts
  ├──→ gateway-client.ts  (gwCallAsync)
  └──→ core-bridge.ts     (core.repo.taskRepo.findAllTasks)

gateway-manager.ts
  └──→ child_process      (Gateway 进程 spawn/kill)

gateway-client.ts
  └──→ child_process      (execFile gateway-chat.js)
```

### `core-bridge.ts` — CJS↔TS 桥接 (~66 行)

```
require('../../core') → 提供 typed 访问
  core.repo.taskRepo      → 任务 CRUD
  core.repo.configRepo    → openclaw.json 配置
  core.repo.deptConfigRepo / deptStateRepo → 部门配置/状态
  core.repo.missionRepo   → mission 文件读取
  core.task.*             → 质量门、pipeline、rework
  core.observe.*          → 预算汇总
  core.common.*           → Autopilot 状态
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

---

## Layer 4: Autopilot 编排层

> 职责：CEO 主循环 + 部门循环的调度编排。通过 Facade 调用 core/ 模块。

### `index.cjs` — CEO 主循环

```
require('./state.cjs')            → loadState, saveState
require('./gateway.cjs')          → sendToCeo
require('./readers.cjs')          → fetchSessionTokens, readProjectTasks,
                                    readStandaloneTasks, readAgentActivity
require('./directive.cjs')        → buildDirective
require('./sync.cjs')             → syncProjects
require('./memory.cjs')           → buildMemoryContext, compressMemory
require('./department-loop.cjs')  → runDepartmentCycle, autoTransitionTasks
require('./task-bridge.cjs')      → createCycleTask, completeCycleTask, updateTaskStatus
require('./logger.cjs')           → logger
require('./constants.cjs')        → DEFAULT_INTERVAL_SEC, MAX_HISTORY_ENTRIES, ...

主循环流程:
  loadState()
  → buildDirective()                    // 构建 CEO 指令 (readers 读数据)
  → buildMemoryContext('ceo', 'coordination')  // 构建记忆上下文
  → sendToCeo(directive)               // 发送给 CEO Agent
  → compressMemory('ceo', response)    // 压缩响应到记忆
  → autoTransitionTasks(response)      // 根据回复自动更新任务状态
  → syncProjects()                     // 同步项目状态
  → saveState()
  → 如果 --all 模式, 遍历启动各部门 runDepartmentCycle()
```

### `department-loop.cjs` — 部门循环

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

部门循环流程:
  loadDeptConfig(deptId)
  → checkBudget(deptId)                 // 预算检查
  → loadDeptState(deptId)
  → buildDepartmentDirective(...)       // 构建部门指令
  → sendToAgent(headId, directive)      // 发送给部门主管
  → trackTokenUsage(deptId, usage)      // 记录 token 消耗
  → compressMemoryByRole(headId, response, 'leader')  // 压缩记忆
  → autoTransitionTasks(response)       // 自动状态流转
      → 识别 review 状态任务 → processQualityGate(deptId, task)
      → 质量门通过 → updateTaskStatus(taskId, 'completed')
      → 质量门未通过 → updateTaskStatus(taskId, 'rework')
  → saveDeptState(deptId, state)
```

### `directive.cjs` — CEO 指令构建

```
require('./readers.cjs')          → readMission, readCeoWorkspaceFile,
                                    readProjectTasks, readStandaloneTasks,
                                    readAgentActivity, readAllDepartmentReports,
                                    readEscalations
require('./logger.cjs')           → logger

buildDirective() → string
  读取: mission.md + 部门报告 + 项目任务 + Agent 活跃度 + 升级信息
  输出: CEO 需要处理的综合指令文本
```

### `dept-directive.cjs` — 部门指令构建

```
require('./readers.cjs')          → readAgentActivity, readProjectTasks,
                                    readDeptMission, readBaseMission, readAgentMeta
require('./memory.cjs')           → buildMemoryContext
require('./constants.cjs')        → DEPARTMENTS_DIR, PROJECTS_DIR
require('./logger.cjs')           → logger

buildDepartmentDirective(deptId, config, state, transitions) → string
  读取: 部门 mission + base-mission + 项目任务 + Agent 活跃度
  注入: 记忆上下文 + 状态转换结果
  输出: 部门主管需要处理的综合指令文本
```

### `gateway.cjs` — WebSocket 通信 (非 Facade，保持原样)

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

  sendToCeo(message, timeoutMs?)
    → sendToAgent('ceo', 'agent:ceo:autopilot', message, timeoutMs)

  compactSession(sessionKey, timeoutMs)
    → 压缩会话上下文

  killSession(sessionKey, timeoutMs)
    → 关闭会话
```

### `sync.cjs` — 项目同步

```
require('./readers.cjs')          → readCeoWorkspaceFile, fetchSessionTokens
require('./constants.cjs')        → PROJECTS_DIR, CEO_WORKSPACE, PROJECT_ROOT
require('./logger.cjs')           → logger

syncProjects()
  读取 CEO 记忆/响应 → 检测项目阶段变化 → 更新 .project-meta.json
```

---

## Layer 5: Facade 适配层

> 职责：保持 autopilot 调用方的 API 不变，将实现 100% 委托给 core/。每个 Facade ≤ 15 行。

```
┌────────────────────────┬──────────────────────────────────┬──────────────────────┐
│ Facade 文件             │ 委托目标                          │ 导出函数              │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ readers.cjs            │ core/repo/session.cjs            │ readAgentActivity    │
│                        │ core/repo/mission.cjs            │ readMission          │
│                        │ core/repo/task.cjs               │ readProjectTasks     │
│                        │ core/repo/dept-config.cjs        │ loadDeptConfig       │
│                        │ core/repo/dept-state.cjs         │ loadDeptState        │
│                        │ core/repo/agent-meta.cjs         │ readAgentMeta        │
│                        │                                  │ (共 17 个函数)        │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ budget.cjs             │ core/observe/budget.cjs          │ checkBudget          │
│                        │                                  │ trackTokenUsage      │
│                        │                                  │ loadCompanyBudget    │
│                        │                                  │ getBudgetSummary     │
│                        │                                  │ shouldResetDaily     │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ memory.cjs             │ core/agent/memory.cjs            │ buildMemoryContext   │
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
│                        │                                  │ detectDeptStall      │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ task-bridge.cjs        │ core/common/task-bridge.cjs      │ createCycleTask      │
│                        │                                  │ completeCycleTask    │
│                        │                                  │ createWorkTask       │
│                        │                                  │ updateTaskStatus     │
│                        │                                  │ findActiveTaskFor..  │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ state.cjs              │ core/common/autopilot-state.cjs  │ loadState            │
│                        │                                  │ saveState            │
│                        │                                  │ withStateLock        │
│                        │                                  │ DEFAULT_STATE        │
├────────────────────────┼──────────────────────────────────┼──────────────────────┤
│ quality-gate.cjs       │ core/task/quality-orchestrator    │ processQualityGate   │
│  (特殊：DI 注入)       │ + ./gateway.cjs (sendToAgent)    │ selectReviewer       │
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

### 依赖方向 (单向，无循环)

```
common/   ← 无依赖
repo/     ← common/ (validators)
task/     ← (无 core 内部依赖，通过 DI 注入)
agent/    ← (无 core 内部依赖，直接读 fs)
observe/  ← repo/ (lazy require，避免循环)
llm/      ← (无 core 内部依赖)
```

### `core/repo/` — Repository Pattern 数据访问层

```
base.cjs (基类)
  ├── TTL 缓存 (cacheTtlMs: 30000 for Autopilot, 0 for API)
  ├── 原子写入 (tmp + rename)
  └── read(path) / write(path, data) / update(path, mutator) / invalidate()

session.cjs (extends BaseRepository)
  ├── readAgentActivity()
  │     读 .openclaw-state/agents/*/status.json → {[agentId]: {totalTokens, lastActive, idleMins}}
  ├── fetchSessionTokens()
  │     读 .openclaw-state/sessions/*.json → [{sessionKey, totalTokens, ...}]
  └── getSessionTokenInfo(agentId, sessionKey)
        读 .openclaw-state/sessions/{key}.json → {inputTokens, outputTokens, totalTokens}

mission.cjs (extends BaseRepository)
  ├── readMission()           → config/mission.md 全文
  ├── readBaseMission()       → config/base-mission.md 全文
  ├── readDeptMission(deptId) → config/departments/{deptId}/mission.md
  ├── readWorkspaceFile(agentDir, filename)
  ├── readCeoWorkspaceFile(filename) → workspaces/ceo/{filename}
  ├── readAllDepartmentReports() → 遍历 config/departments/*/report.md
  ├── readEscalations()       → config/escalations.json
  └── readMemorySummary(agentId) → agents/{agentId}/MEMORY.md 前 2000 字

task.cjs (extends BaseRepository)
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

dept-config.cjs (extends BaseRepository)
  └── load(deptId) → config/departments/{deptId}/config.json | null

dept-state.cjs (extends BaseRepository)
  ├── load(deptId)  → config/departments/{deptId}/state.json | DEFAULT_STATE
  └── save(deptId, state)

agent-meta.cjs (extends BaseRepository)
  └── readMeta(agentId) → agents/{agentId}/agent.json | null

config.cjs (extends BaseRepository)
  ├── getConfig()   → config/openclaw.json
  ├── updateConfig(mutator)
  ├── addAgent(agentId, workspaceDir, model?)
  └── removeAgent(agentId)

project-meta.cjs (extends BaseRepository)
  ├── read(projectId)  → projects/{id}/.project-meta.json
  └── write(projectId, meta)
```

### `core/task/` — 任务生命周期

```
state-machine.cjs — 任务状态 FSM
  状态: pending → assigned → in_progress → review → completed
                                  ↘ rework ↗       → failed
  ├── canTransition(from, to) → boolean
  ├── getValidTransitions(from) → string[]
  ├── isTerminal(status) → boolean
  ├── normalizeStatus(status) → string     // 'running' → 'in_progress'
  └── transition(task, to, context?) → {ok, task?, error?}

quality-gate.cjs — 质量门 FSM (5 阶段)
  阶段: pending → self_checking → peer_reviewing → head_approving → done
                       ↘               ↘                ↘
                     failed          failed           failed
  ├── canAdvance(from, to) → boolean
  ├── isGateDone(stage) → boolean
  ├── getGateState(task) → {stage, selfCheck?, peerReview?, headApproval?}
  ├── initGate(task) → gate
  ├── advanceGate(task, nextStage, result?) → {ok, error?}
  └── nextAction(task) → string | null

quality-validator.cjs — 质量验证引擎 (Strategy Pattern)
  ├── checkQualityGate(task, pipelineStep) → {passed, errors, shouldRework, escalate}
  │     验证: selfCheck 分数 → peerReview → validators → rework/escalate 判定
  ├── runValidator(name, task, config) → string[]
  │     内置: wordCount / endingKeywords / noEndingKeywords / similarity
  ├── createPipelineTask(completedTask, pipelineStep, taskTypes) → Task | null
  └── createReworkTask(task, errors) → Task

quality-orchestrator.cjs — 评审编排 (DI Pattern)
  constructor({sendFn, readAgentActivity?, loadDeptConfig?, logger?})
  ├── process(deptId, task) → Promise<{passed, reason?}>
  │     流程: loadDeptConfig → requestSelfCheck → selectReviewer
  │          → requestPeerReview → requestHeadApproval
  ├── selectReviewer(deptId, task, config) → agentId | null
  │     策略: REVIEWER_MAP[type] → tag 匹配 → 最空闲 candidate
  └── findTasksInReview(deptId, projects) → Task[]

strategy.cjs — 任务类型策略
  ├── getStrategy(taskType?, deptConfig?) → TaskStrategy
  └── BUILTIN_STRATEGIES — writing/editing/worldbuilding/character/plotting

auto-transition.cjs — 自动状态流转
  ├── parseTaskAssignments(text) → [{agentId, summary}]
  ├── parseTaskCompletions(text) → [taskId]
  └── computeTransitions(opts) → [{taskId, from, to, reason, extras?}]
        opts: {allTasks, agentActivity, chiefResponseText,
               idleOnly?, idleCompleteMins?, staleTaskMins?}
        返回 _quality_gate 伪状态 → 调用方处理异步质量门
```

### `core/observe/` — 可观测性

```
budget.cjs — 预算管理
  lazy require: repo/dept-config.cjs, repo/dept-state.cjs
  ├── checkBudget(deptId) → {allowed, warning?, reason?, ratio}
  │     读 deptConfig.budget.dailyTokenLimit → 对比 deptState.tokensUsedToday
  ├── trackTokenUsage(deptId, usage)
  │     deptState.tokensUsedToday += usage.totalTokens
  ├── loadCompanyBudget() → {company: {dailyTokenLimit, monthlyTokenLimit, alertThreshold}}
  ├── getBudgetSummary() → {company, departments}
  └── shouldResetDaily(lastResetAt) → boolean

kpi.cjs — KPI 计算引擎
  lazy require: repo/dept-config.cjs, repo/task.cjs
  ├── calculateDepartmentKPIs(deptId) → {[metric]: {target, unit, actual, achievement}}
  │     指标: tasks_completed_per_day / quality_score / completion_rate
  ├── calculateMetric(deptId, metric, config)
  ├── saveKPISnapshot(deptId, kpis) → JSONL 追加
  ├── readKPIHistory(deptId, limit=100)
  └── getCompanyKPIs() → 聚合所有部门

stall-detector.cjs — 停滞检测
  lazy require: repo/dept-state.cjs
  ├── detectStalls(deptId) → [{taskId, taskName, stalledCycles, suggestion}]
  │     检查: 最近 3 个 cycle 中重复提及的任务
  └── detectDepartmentStall(deptId) → {stalled, reason?}
        检查: 连续 3 次相同结果 / 连续 3 次 Error

event-bus.cjs — 事件总线 (Singleton)
  └── eventBus: emit(event, data) / on(event, handler)

cost-tracker.cjs — 成本记录
  └── trackCost / queryCosts / getDailySummary (JSONL append-only)
```

### `core/agent/` — Agent 业务逻辑

```
memory.cjs — 结构化记忆管理
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

### `core/common/` — 通用工具

```
task-bridge.cjs — Dashboard API 客户端 (fire-and-forget)
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

autopilot-state.cjs — 全局状态持久化
  无 core/ 内部依赖
  状态文件: config/autopilot-state.json
  ├── loadState() → AutopilotState
  ├── saveState(state) — 原子写入 (tmp + rename + fallback)
  ├── withStateLock(fn) — load → _locked=true → save → fn() → unlock → save
  └── DEFAULT_STATE = {status:'stopped', pid:null, cycleCount:0, ...}

validators.cjs — 输入校验
  ├── validateAgentId(id) → {valid, error?}
  ├── validateTaskStatus(status) → boolean
  └── sanitizePath(p) → string | null

agent-service.cjs — Agent 删除服务
  └── AgentService.deleteAgent(id) → {ok, archivedTo}
```

### `core/llm/` — LLM 通信与决策

```
gateway-pool.cjs      — WebSocket 连接池 (Gateway 通信)
anthropic-client.cjs  — Anthropic API 直连客户端
retry.cjs             — 重试与熔断器 (CircuitBreaker)
chief-tools.cjs       — Chief Agent tool definitions
review-tools.cjs      — 评审 tool definitions (self-check/peer/head)
decision-engine.cjs   — makeChiefDecision / makeCeoDecision
directive-builder.cjs — DirectiveBuilder 指令构建器

注: LLM 模块当前由 core/ 内部测试覆盖，外部消费者待接入。
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
      → addToOpenclawConfig(id, dir, model)   [Layer 2: 内部函数]
        → core.repo.configRepo.addAgent()   [Layer 6: core/]
      → ensureProjectForDepartment(dept, id)  [Layer 2: 内部函数]
        → fs 创建 projects/{dept}/ + .project-meta.json
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
          → fs 读 config/departments/{dept}/config.json
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

### 场景 3: Autopilot 部门循环

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

### 场景 4: Autopilot → Dashboard 回写任务

```
task-bridge.cjs (core/common/)                [Layer 6]
  → HTTP PUT http://localhost:3100/api/agent-tasks
    → agent-tasks/route.ts                    [Layer 1: Route]
      → findTaskById(taskId)                  [Layer 3: task-storage Facade → core/]
      → updateTaskInPlace(taskId, updates)    [Layer 3: task-storage Facade → core/]
      → 如果 status=completed:
        → getWorkflowForTask(task)            [Layer 3: quality-gate Facade]
        → checkQualityGate(task, workflow)    [Layer 3: → core.task.checkQualityGate]
        → createPipelineTask / createReworkTask [Layer 3: → core.task.*]
    ← 200 JSON {task, ok: true}
```

---

## 数据流向总结

```
                    ┌─────────────────┐
                    │   Browser/User  │
                    └────────┬────────┘
                             │ HTTP
                             ▼
               ┌─────────────────────────┐
               │  Dashboard (Next.js)     │
               │  Routes → Services → Lib │
               │           ↓ core-bridge  │
               └─────────────┬───────────┘
                             │ require (core-bridge.ts)
                             │ HTTP (/api/agent-tasks)
               ┌─────────────┼───────────┐
               │             ▼           │
               │  ┌─────────────────┐    │
               │  │  Autopilot 进程  │    │
               │  │  编排 → Facade   │    │
               │  └────────┬────────┘    │
               │           │ require     │
               │           ▼             │
               │  ┌─────────────────┐    │  WebSocket
               │  │  Core 业务内核   │────┼──────────→ Gateway (19100)
               │  │  repo/task/     │    │              │
               │  │  observe/agent/ │    │              ▼
               │  └────────┬────────┘    │         ┌─────────┐
               │           │             │         │  Agent   │
               │  ★ Dashboard + Autopilot│         │ (Claude) │
               │    共用同一 core/ 实例   │         └─────────┘
               │           │ 读写        │
               │           ▼             │
               │    config/departments/  │
               │    .openclaw-state/     │
               │    agents/*/memory/     │
               └─────────────────────────┘
```
