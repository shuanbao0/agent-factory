# 多 Agent 条件下 Project 与 Task 完整流程

> 基于 Agent Factory v0.4.49，涵盖项目标准 + 任务标准体系。
>
> **本文档描述的是适用于所有部门的通用流程。** 无论是技术部门（coding/analysis）、创作部门（writing/worldbuilding/character/plotting/editing）、研究部门（research/analysis）还是其他任何部门，项目创建、任务分发、质量门评审的流程和机制完全一致——差异仅在于 `task.type` 驱动的标准内容不同。

## 目录

- [一、项目生命周期](#一项目生命周期)
- [二、任务生命周期](#二任务生命周期)
- [三、完整数据流图](#三完整数据流图)
- [四、关键设计决策](#四关键设计决策)

---

## 一、项目生命周期

### 1.1 项目创建

```
用户/CEO 决策创建项目
  │
  ▼
Chief 通过 project-api skill 调用 POST /api/projects
  │
  ▼
project-service.createProject()
  ├─ 1. 生成 slug → 复合 ID: {dept}/{slug}
  ├─ 2. ensureProjectDirs() — 按 workflow 创建子目录
  ├─ 3. 写入 .project-meta.json（status: planning, currentPhase: 1, phases, tasks: []）
  ├─ 4. 生成 BRIEF.md（项目描述 + 阶段 + 目录约定）
  ├─ 5. injectStandardsForProject() — 从 config/project-standards.md 生成 STANDARDS.md
  │     ├─ 解析 LIFECYCLE（5阶段：requirements→design→development→testing→delivery）
  │     ├─ 解析 BOUNDARIES（DO/DON'T）
  │     ├─ 标注当前阶段（> 当前阶段: **需求**）
  │     └─ marker 幂等写入 projects/{dept}/{slug}/STANDARDS.md
  └─ 返回 { ok, project }
```

**项目目录结构：**

```
projects/{dept}/{slug}/
  ├── .project-meta.json   ← 元数据（阶段、任务、状态）
  ├── BRIEF.md             ← 项目简介
  ├── STANDARDS.md         ← 项目执行标准（自动注入）
  └── {workflow dirs}/     ← 按部门工作流的子目录
```

### 1.2 项目阶段推进

```
CEO 协调周期 (30min)
  └─ syncProjects() — 解析 CEO 响应中的 "【项目: xxx, 阶段推进】"
     → 更新 .project-meta.json.currentPhase++

部门执行周期 (10min)
  └─ buildDepartmentDirective()
     └─ buildDeptProjects() — 展示项目列表时读取 project-standards.md
        → 每个项目显示: 名称 | 状态 | 任务数 | 当前阶段 | 出口条件
        例（不同部门）:
        - tech/api-gateway — API 网关重构 | 状态: active | 任务: 3进行/8总 | 阶段: 开发
          出口条件: 核心功能已实现，代码可运行，基本自测通过
        - novel/volume-1 — 长篇小说第一卷 | 状态: active | 任务: 2进行/5总 | 阶段: 需求
          出口条件: 需求文档完成，所有关键需求已确认，验收标准已定义
        - research/market-q1 — Q1 市场分析 | 状态: planning | 任务: 0进行/3总 | 阶段: 设计
          出口条件: 设计方案已确定，技术选型完成，接口/结构已定义

Chief 看到出口条件 → 判断当前阶段是否达标 → 达标则向 CEO 汇报推进
```

### 1.3 项目标准的来源与注入

**`config/project-standards.md`**（两段：`## LIFECYCLE` + `## BOUNDARIES`）

| 注入时机 | 目标 | 方式 |
|----------|------|------|
| 项目创建 | `projects/{dept}/{slug}/STANDARDS.md` | `injectStandardsForProject()` 自动调用 |
| 部门循环 | Chief 指令中的项目列表 | `buildDeptProjects()` 读取阶段出口条件 |
| 手动重注入 | 所有已有项目 | `node scripts/inject-project-standards.mjs` |

Marker 幂等机制：`<!-- PROJECT-STANDARDS:BEGIN -->` / `<!-- PROJECT-STANDARDS:END -->`，可反复注入不重复。

---

## 二、任务生命周期

### 2.1 任务创建

```
来源 A: Chief 响应中的 [任务分配] 段（系统自动解析创建）
来源 B: Chief 通过 task-api skill 主动调用 API
来源 C: 用户通过 Dashboard 手动创建

  │
  ▼
department-loop.cjs parseTaskAssignments()
  ├─ 提取 { agentId, summary, projectId }
  ├─ 跳过 🔵工作中 的 Agent（不分配）
  ├─ inferTaskType(summary, agentMeta) — 自动推断任务类型
  │     优先级: 摘要关键词 > Agent templateId/role > 兜底 dept-work
  └─ createWorkTask(agentId, summary, deptId, { type, description, projectId })
       │
       ├─ buildTaskContext(agentId, summary, options)
       │     生成 enriched description:
       │     ├─ Chief 原始 summary
       │     ├─ 质量标准: 最低 N 分（strategy.minPassingScore，按类型不同：coding=80, writing=70, research=65...）
       │     ├─ 评审关注点: strategy.reviewCriteria（如有）
       │     ├─ 任务标准（← config/task-standards.md 按 task.type 提取）:
       │     │   例 coding:
       │     │   ├─ 完成定义: "代码可运行，有基本测试，无明显安全漏洞"
       │     │   ├─ 要求: "遵循项目编码规范，编写测试，处理边界情况"
       │     │   └─ 禁止: "不引入未经审批的第三方依赖，不硬编码敏感信息"
       │     │   例 writing:
       │     │   ├─ 完成定义: "文稿完整，无未完成章节，字数达到要求"
       │     │   ├─ 要求: "参考角色设定和世界观文档，遵循大纲"
       │     │   └─ 禁止: "不偏离大纲，不引入矛盾设定"
       │     │   例 research:
       │     │   ├─ 完成定义: "研究报告完整，数据来源可靠，结论有据可依"
       │     │   ├─ 要求: "标注数据来源，区分事实与推断，提供多角度分析"
       │     │   └─ 禁止: "不编造数据，不遗漏关键信息源"
       │     ├─ 项目阶段标准（← config/project-standards.md）:
       │     │   └─ 项目阶段: 开发 | 出口条件: 核心功能已实现，代码可运行，基本自测通过
       │     ├─ 项目背景（部门使命摘要 ≤500字符）
       │     ├─ 返工反馈（如有: 评审意见 + 上次自检分数）
       │     └─ 相关任务记忆（最近 5 个类似任务经验）
       │
       └─ POST /api/agent-tasks → 任务创建, status: in_progress
```

### 2.2 任务分发与执行

```
Chief peer-send --to agent-id --message "[Task: task-xxx] 具体指令..."
  │
  ▼
Agent :main session 收到任务
  │
  ├─ 1. 查询任务 API → 获得 enriched description（含任务标准）
  ├─ 2. sessions_spawn(mode: "run") → 创建 worker 子会话
  │     ├─ worker 继承 AGENTS.md + SOUL.md（含 base-rules）
  │     ├─ worker 获得任务 description（含类型专属标准）
  │     ├─ 如果用 buildTaskPrompt() 完整 prompt:
  │     │     额外包含 "## 任务标准" 完整段落:
  │     │     ├─ ### {task.type} 类型标准
  │     │     │   完成定义 + 质量检查清单 + DO + DON'T
  │     │     │   （8 种内置类型各有专属标准）
  │     │     └─ 或 ### 通用标准（未知类型回退 GENERAL）
  │     └─ worker 在隔离环境执行 → 产出写入 workspaces/{agentId}/
  │
  ├─ 3. :main 保持响应
  │     └─ 收到 [系统查询] → "STATUS: working, SUBAGENT: {runId}"
  │
  ├─ 4. worker 完成 → auto-announce → :main 感知
  │
  └─ 5. Agent 调 API: PUT status=completed, output=产出路径
```

### 2.3 状态机流转

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

**自动转换（autoTransitionTasks，每轮部门循环执行）：**

| 条件 | 转换 | 说明 |
|------|------|------|
| assigned + 活跃(<5min) | → in_progress | Agent 开始工作 |
| assigned + idle ≥ 30min | → failed | 分配后无动作 |
| in_progress + 🔵工作中 | → 不干预 | worker session 活跃 |
| in_progress + ✅已完成/空闲 | → review | 推定完成 |
| in_progress + 多次无响应 | → failed | 卡死 |
| review | → 进入质量门三阶段 | 见 2.4 |

### 2.4 质量门三阶段评审

```
task.status = 'review' → Scheduler 5s 延迟触发质量门
  │
  ▼
qualityOrchestrator.process(deptId, task)
  │
  ├─ 阶段 1: 自检 (Self-Check) ─── 由任务负责人执行
  │   │
  │   ├─ 硬校验（不经 LLM）:
  │   │   ├─ task.output 文件存在？
  │   │   ├─ 内容 ≥ 500 字符？
  │   │   └─ 无未渲染模板 ${...}？
  │   │
  │   ├─ 构建类型专属检查清单（← config/task-standards.md）:
  │   │   按 task.type 自动匹配，8 种内置类型各有专属清单。示例:
  │   │
  │   │   task.type = 'coding':
  │   │     1. 代码是否能编译/运行无错误？
  │   │     2. 核心逻辑是否有单元测试？
  │   │     3. 是否有安全漏洞（注入、XSS 等）？
  │   │     4. 代码风格是否与项目一致？
  │   │     5. 是否有适当的错误处理？
  │   │
  │   │   task.type = 'writing':
  │   │     1. 情节是否连贯，无逻辑断裂？
  │   │     2. 文笔质量是否达标？
  │   │     3. 字数是否达到要求？
  │   │     4. 是否遵循了世界观和角色设定？
  │   │     5. 是否与前文保持一致？
  │   │
  │   │   task.type = 'research':
  │   │     1. 数据来源是否可靠且已标注？
  │   │     2. 分析是否全面覆盖了研究问题？
  │   │     3. 结论是否有数据支撑？
  │   │     4. 是否提供了可操作的建议？
  │   │
  │   │   task.type = 'analysis':
  │   │     1. 数据是否准确无误？
  │   │     2. 分析框架是否合理？
  │   │     3. 洞察是否有实际价值？
  │   │     4. 可视化/表格是否清晰？
  │   │
  │   │   （另有 editing/worldbuilding/character/plotting 各自专属清单）
  │   │
  │   │   未知类型 → 回退通用 4 条:
  │   │     1. 是否完成了任务要求的所有内容？
  │   │     2. 是否有明显的错误或遗漏？
  │   │     3. 格式和表述是否规范？
  │   │     4. 是否可以交付给下一环节？
  │   │
  │   ├─ LLM 自检: sendFn(assignee, prompt + checklist, 60s)
  │   │   → 回复: SCORE: <0-100>, PASSED: <bool>, ISSUES: <list>
  │   │
  │   └─ 判定: score ≥ strategy.minPassingScore → 通过
  │      不通过 → 返回 { passed: false }, 流程终止
  │
  ├─ 阶段 2: 同行评审 (Peer Review) ─── 由其他 Agent 执行
  │   │
  │   ├─ 选择评审人:
  │   │   selectReviewer(deptId, task, config)
  │   │   优先级: preferredReviewers（部门配置）→ tag 匹配 → 最空闲的 Agent
  │   │   排除: 任务负责人 + Chief
  │   │
  │   ├─ 注入上下文（← task-standards.md + project-standards.md）:
  │   │   ├─ 任务类型标准全文（完成定义 + 检查清单 + DO/DON'T）
  │   │   └─ 项目阶段 + 出口条件
  │   │
  │   ├─ LLM 评审: sendFn(reviewer, 产出内容 + 类型标准 + 项目上下文, 60s)
  │   │   → 回复: SCORE: <0-100>, PASSED: <bool>, COMMENTS: <text>
  │   │
  │   └─ 判定: score ≥ threshold → 通过
  │      不通过 → 返回 { passed: false, reason: comments }
  │
  └─ 阶段 3: 主管审批 (Head Approval) ─── 由 Chief 执行
      │
      ├─ 注入上下文:
      │   ├─ 完成定义（← task-standards.md）
      │   └─ 项目阶段 + 出口条件（← project-standards.md）
      │
      ├─ LLM 审批: sendFn(chief, 完成定义+项目上下文+自检分+评审分+评审意见, 60s)
      │
      └─ 判定:
         ├─ APPROVED → review → completed ✅
         ├─ REJECTED + reworkCount < 3 → review → rework（返工）
         └─ REJECTED + reworkCount ≥ 3 → review → failed ❌

所有临时 Session (quality-check / peer-review / approval) fire-and-forget 销毁
```

### 2.5 返工循环

```
质量门 REJECTED → task.status = 'rework', reworkCount++
  │
  ├─ 1. 反馈写入 task.quality.peerReview.comments
  ├─ 2. Chief 下轮周期发现 rework 任务
  ├─ 3. Chief peer-send: "[Task: task-xxx] 请修改：<评审反馈>"
  ├─ 4. Agent :main 收到 → spawn worker 修改产出
  │     buildTaskContext 自动注入返工信息:
  │       ├─ 返工信息（第 N 次）
  │       ├─ 评审反馈: "<具体的评审意见>"
  │       └─ 上次自检评分: 55
  ├─ 5. Agent 调 API: status=completed → 系统转为 review
  └─ 6. 重新进入质量门（用同样的类型专属清单再次自检）
```

### 2.6 任务标准的来源与注入

**`config/task-standards.md`**（两段：`## GENERAL` + `## TYPES`）

**标准注入覆盖表（所有 Agent 触点）：**

| 触点 | 谁 | task-standards.md | project-standards.md |
|------|-----|-------------------|---------------------|
| Chief 部门指令 | Chief | ✅ 任务类型完成定义摘要 | ✅ 项目阶段+出口条件 |
| 任务创建 (dept-loop) | 系统 | ✅ 完成定义+DO/DON'T | ✅ 项目阶段出口条件 |
| 任务创建 (API) | 系统 | ✅ 完成定义+DO/DON'T | ✅ 项目阶段出口条件 |
| Worker 执行 (prompt) | Agent | ✅ 完整类型标准段落 | ✅ 阶段标准+边界 |
| Worker 执行 (context) | Agent | ✅ 完成定义+DO/DON'T | ✅ 阶段出口条件 |
| 质量门自检 | Agent | ✅ 类型专属检查清单 | ✅ 项目阶段+出口条件 |
| 质量门同行评审 | Reviewer | ✅ 类型标准全文 | ✅ 项目阶段+出口条件 |
| 质量门主管审批 | Chief | ✅ 完成定义 | ✅ 项目阶段+出口条件 |

**任务类型自动推断（`type-inference.cjs`）：**
- 优先级: 摘要关键词（中英文）→ Agent templateId/role（65 模板映射）→ 兜底 `dept-work`
- 两条创建路径均已接入: department-loop + POST /api/agent-tasks

**14 种内置类型标准与适用场景：**

| 类型 | 适用场景 | minPassingScore |
|------|----------|-----------------|
| `coding` | 技术部门：后端/前端/数据工程/AI 研发 | 80 |
| `research` | 研究部门：市场调研、竞品分析、文献研究 | 65 |
| `analysis` | 研究/金融部门：数据分析、风险评估、策略评估 | 65 |
| `design` | 技术/产品部门：系统设计、架构、方案 | 70 |
| `marketing` | 营销/品牌部门：营销策划、文案、推广 | 65 |
| `tutorial` | 教程部门：教程撰写、课程设计 | 70 |
| `operations` | 运营部门：流程设计、合规、执行方案 | 70 |
| `finance` | 财务部门：财务分析、预算、报表 | 75 |
| `review` | 所有部门：评审、审查、复核 | 70 |
| `writing` | 创作部门：小说写作、教程撰写、内容创作 | 70 |
| `editing` | 创作部门：文稿修订、风格校对 | 75 |
| `worldbuilding` | 创作部门：世界观设定、背景构建 | 65 |
| `character` | 创作部门：角色设计、人物关系 | 65 |
| `plotting` | 创作部门：情节设计、大纲规划 | 65 |

部门可通过 `deptConfig.workflow.strategies[taskType]` 覆盖任何策略字段（浅合并，部门值优先）。
`preferredReviewers` 全部留空，由部门配置覆盖。

未知类型自动回退 `## GENERAL` 通用标准 + `_fallback` 策略（minPassingScore=60）。mtime 缓存，修改后自动生效。

---

## 三、完整数据流图

```
config/project-standards.md                config/task-standards.md
  │                                           │
  ├─[项目创建]                                ├─[Chief 指令]
  │  → STANDARDS.md                           │  → buildTaskStandardsSummary()
  │    (项目目录，Agent 可读)                    │    任务类型完成定义摘要
  │                                           │
  ├─[部门循环]                                ├─[任务创建] ← inferTaskType() 自动推断
  │  → buildDeptProjects()                    │  → buildTaskContext() + API enrichment
  │    Chief 看到阶段+出口条件                   │    完成定义 + DO/DON'T + 项目阶段
  │                                           │
  ├─[任务创建/执行/评审]                       ├─[Worker 执行]
  │  → buildTaskContext/Prompt               │  → buildTaskPrompt()
  │    项目阶段标准 + 边界                      │    完整 "## 任务标准" + "## 项目阶段标准"
  │                                           │
  ├─[质量门三阶段]                             ├─[质量门自检]
  │  → _getProjectContext()                   │  → 类型专属检查清单 + 项目上下文
  │    自检/评审/审批均含                        │
  │    项目阶段+出口条件                        ├─[质量门同行评审]
  │                                           │  → 类型标准全文 + 项目上下文
  └─[手动]                                    │
     → inject-project-standards.mjs           └─[质量门主管审批]
                                                 → 完成定义 + 项目上下文
  ▼
projects/{dept}/{slug}/
  ├── .project-meta.json    ← 阶段、任务、状态
  ├── BRIEF.md              ← 项目简介
  ├── STANDARDS.md          ← 生命周期标准 + 边界
  └── workspaces/{agent}/   ← Agent 产出
```

**strategy.cjs 与 task-standards.md 的关系：**

```
┌──────────────────┐
│  strategy.cjs    │
│  minPassingScore │  ← 数值阈值（机器判定，硬门槛）
│  reviewCriteria  │
└────────┬─────────┘
         │ 补充（不替代）
┌────────▼─────────┐
│ task-standards   │
│ 检查清单          │  ← 具体检查项（LLM 参考，软指引）
│ 完成定义          │
│ DO / DON'T      │
└──────────────────┘
```

---

## 四、关键设计决策

| 决策 | 理由 |
|------|------|
| **双 Base 文件分离**（project-standards / task-standards） | 项目标准面向阶段管理，任务标准面向执行质量，职责不同 |
| **标准补充 strategy 不替代** | strategy.cjs 的 minPassingScore 是硬阈值（机器判定），标准是软指引（LLM 参考） |
| **全触点覆盖** | 每个 Agent 交互点（Chief 指令/创建/执行/自检/评审/审批）均注入双标准，确保信息对称 |
| **类型自动推断** | 摘要关键词 + Agent 角色推断，替代硬编码 dept-work，使类型专属标准真正生效 |
| **preferredReviewers 留空** | 硬编码 Agent ID 只适用于特定部门，改为由部门 deptConfig 覆盖，真正通用 |
| **Fire-and-forget** | base 文件不存在时一切正常，零回归 |
| **mtime 缓存** | task-standards 每次任务都读一次文件太重，缓存后修改即生效 |
| **未知类型回退 GENERAL** | 14 种内置类型之外的任务不会丢失标准，通用清单兜底 |
| **marker 幂等注入** | STANDARDS.md 可反复重新注入不重复，与 base-rules 注入机制一致 |
| **buildTaskContext vs buildTaskPrompt** | context 精简（完成定义+边界+阶段），prompt 完整（含检查清单+项目边界）；前者注入 description，后者直接发 worker |

---

## 附录：涉及模块一览

| 模块 | 文件 | 职责 |
|------|------|------|
| 项目标准解析 | `core/common/project-standards.cjs` | 解析 + 注入 STANDARDS.md + mtime 缓存 |
| 任务标准解析 | `core/common/task-standards.cjs` | 解析 + 按类型提取 + 检查清单提取 + mtime 缓存 |
| 任务类型推断 | `core/task/type-inference.cjs` | 摘要关键词 + Agent 角色 → 任务类型（替代硬编码 dept-work） |
| 项目创建 | `core/common/project-service.cjs` | 创建时调用 `injectStandardsForProject()` |
| 任务上下文 | `core/autopilot/task-prompt.cjs` | `buildTaskContext()` / `buildTaskPrompt()` 注入双标准 |
| 质量门编排 | `core/task/quality-orchestrator.cjs` | 三阶段均注入任务标准 + 项目标准（`_getProjectContext()`） |
| 部门指令 | `core/autopilot/dept-directive.cjs` | 项目阶段+出口条件 + 任务类型完成定义摘要 |
| API 路由 | `ui/src/app/api/agent-tasks/route.ts` | POST 创建时自动推断类型 + 注入双标准 |
| 手动注入脚本 | `scripts/inject-project-standards.mjs` | CLI 重新注入所有项目 STANDARDS.md |
| 任务策略 | `core/task/strategy.cjs` | 14 种内置策略（通用 9 + 创作 5），preferredReviewers 留空由部门覆盖 |
| 项目标准 base | `config/project-standards.md` | LIFECYCLE + BOUNDARIES |
| 任务标准 base | `config/task-standards.md` | GENERAL + TYPES (14 种) |

---

*本文档基于 Agent Factory v0.4.49 代码分析生成。*
