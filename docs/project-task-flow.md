# 多 Agent 条件下 Project 与 Task 完整流程

> 基于 Agent Factory v0.4.49，涵盖项目标准 + 任务标准体系。

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
        例:
        - novel/default — 长篇小说 | 状态: active | 任务: 2进行/5总 | 阶段: 开发
          出口条件: 核心功能已实现，代码可运行，基本自测通过

Chief 看到出口条件 → 判断是否达标 → 达标则向 CEO 汇报推进
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
  └─ createWorkTask(agentId, summary, deptId, { description })
       │
       ├─ buildTaskContext(agentId, summary, options)
       │     生成 enriched description:
       │     ├─ Chief 原始 summary
       │     ├─ 质量标准: 最低 70 分（strategy.minPassingScore）
       │     ├─ 评审关注点: 完成度、文笔质量、情节连贯性（strategy.reviewCriteria）
       │     ├─ 任务标准（← config/task-standards.md 按 task.type 提取）:
       │     │   ├─ 完成定义: "文稿完整，无未完成章节，字数达到要求"
       │     │   ├─ 要求: "参考角色设定和世界观文档，遵循大纲"
       │     │   └─ 禁止: "不偏离大纲，不引入矛盾设定，不重复已写内容"
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
  │     │     ├─ ### writing 类型标准
  │     │     │   完成定义 + 质量检查清单(5条) + DO + DON'T
  │     │     └─ 或 ### 通用标准（未知类型回退）
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
  │   │
  │   │   task.type = 'writing':
  │   │     1. 情节是否连贯，无逻辑断裂？
  │   │     2. 文笔质量是否达标（语言流畅、表达准确）？
  │   │     3. 字数是否达到要求？
  │   │     4. 是否遵循了世界观和角色设定？
  │   │     5. 是否与前文保持一致（人物、地名、时间线）？
  │   │
  │   │   task.type = 'coding':
  │   │     1. 代码是否能编译/运行无错误？
  │   │     2. 核心逻辑是否有单元测试？
  │   │     3. 是否有安全漏洞（注入、XSS 等）？
  │   │     4. 代码风格是否与项目一致？
  │   │     5. 是否有适当的错误处理？
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
  │   │   优先级: preferredReviewers → tag 匹配 → 最空闲的 Agent
  │   │   排除: 任务负责人 + Chief
  │   │
  │   ├─ LLM 评审: sendFn(reviewer, 产出内容 + 评审标准, 60s)
  │   │   → 回复: SCORE: <0-100>, PASSED: <bool>, COMMENTS: <text>
  │   │
  │   └─ 判定: score ≥ threshold → 通过
  │      不通过 → 返回 { passed: false, reason: comments }
  │
  └─ 阶段 3: 主管审批 (Head Approval) ─── 由 Chief 执行
      │
      ├─ LLM 审批: sendFn(chief, 自检分+评审分+评审意见, 60s)
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
  │       ├─ 评审反馈: "情节第3章有逻辑断裂..."
  │       └─ 上次自检评分: 55
  ├─ 5. Agent 调 API: status=completed → 系统转为 review
  └─ 6. 重新进入质量门（用同样的类型专属清单再次自检）
```

### 2.6 任务标准的来源与注入

**`config/task-standards.md`**（两段：`## GENERAL` + `## TYPES`）

| 注入时机 | 目标 | 内容 |
|----------|------|------|
| 任务创建 | `buildTaskContext()` → 任务 description | 完成定义 + DO/DON'T（精简版） |
| Worker 执行 | `buildTaskPrompt()` → 完整 prompt | "## 任务标准" 完整段落 |
| 质量门自检 | `_requestSelfCheck()` → 自检 prompt | 类型专属检查清单（替代通用 4 条） |

**8 种内置类型标准：** writing、coding、research、analysis、editing、worldbuilding、character、plotting

未知类型自动回退 `## GENERAL` 通用标准。mtime 缓存，修改后自动生效。

---

## 三、完整数据流图

```
config/project-standards.md                config/task-standards.md
  │                                           │
  ├─[项目创建]                                ├─[任务创建]
  │  → STANDARDS.md                           │  → buildTaskContext()
  │    (项目目录，Agent 可读)                    │    enriched description 中的
  │                                           │    "完成定义 + DO/DON'T"
  │                                           │
  ├─[部门循环]                                ├─[Worker 执行]
  │  → buildDeptProjects()                    │  → buildTaskPrompt()
  │    Chief 看到阶段+出口条件                   │    完整 "## 任务标准" 段落
  │                                           │
  ├─[手动]                                    └─[质量门自检]
  │  → inject-project-standards.mjs              → _requestSelfCheck()
  │                                                类型专属检查清单
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
| **Fire-and-forget** | base 文件不存在时一切正常，零回归 |
| **mtime 缓存** | task-standards 每次任务都读一次文件太重，缓存后修改即生效 |
| **未知类型回退 GENERAL** | 8 种内置类型之外的任务不会丢失标准，通用清单兜底 |
| **marker 幂等注入** | STANDARDS.md 可反复重新注入不重复，与 base-rules 注入机制一致 |
| **buildTaskContext vs buildTaskPrompt** | context 精简（完成定义+边界），prompt 完整（含检查清单）；前者注入 description，后者直接发 worker |

---

## 附录：涉及模块一览

| 模块 | 文件 | 职责 |
|------|------|------|
| 项目标准解析 | `core/common/project-standards.cjs` | 解析 + 注入 STANDARDS.md + mtime 缓存 |
| 任务标准解析 | `core/common/task-standards.cjs` | 解析 + 按类型提取 + 检查清单提取 + mtime 缓存 |
| 项目创建 | `core/common/project-service.cjs` | 创建时调用 `injectStandardsForProject()` |
| 任务上下文 | `core/autopilot/task-prompt.cjs` | `buildTaskContext()` / `buildTaskPrompt()` 注入标准 |
| 质量门自检 | `core/task/quality-orchestrator.cjs` | `_requestSelfCheck()` 使用类型专属检查清单 |
| 部门指令 | `core/autopilot/dept-directive.cjs` | `buildDeptProjects()` 展示阶段 + 出口条件 |
| 手动注入脚本 | `scripts/inject-project-standards.mjs` | CLI 重新注入所有项目 STANDARDS.md |
| 项目标准 base | `config/project-standards.md` | LIFECYCLE + BOUNDARIES |
| 任务标准 base | `config/task-standards.md` | GENERAL + TYPES (8 种) |

---

*本文档基于 Agent Factory v0.4.49 代码分析生成。*
