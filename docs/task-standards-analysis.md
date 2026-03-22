# 任务标准与质量评估体系分析

> 2026-03-20

---

## 一、核心问题

当前系统中，**任务的执行标准和质量评估标准是脱钩的**。任务没有明确的验收条件，质量评估用的是硬编码的通用清单，评分由 LLM 自由发挥。标准散落在 5 个文件中，互相不引用。

---

## 二、标准在哪里 — 完整数据流追踪

### 任务从创建到评审，经历 9 个阶段，标准在每个阶段的状态：

```
创建 → Chief 分配 → Worker 执行 → 自检 → 同行评审 → 主管审批
  │         │            │          │         │           │
  │         │            │          │         │           │
  无标准    无标准     有部分标准   通用清单   通用清单    无标准
```

### 阶段 1: 任务创建

**文件**: `entity/task/task.ts:65-89`, `ui/src/services/task-api.ts:93-133`

Task 接口的字段：

```typescript
interface Task {
  id: string
  name: string              // ← 唯一的"需求描述"
  description?: string      // ← 可选的详细描述
  type?: string             // ← 关联策略（writing/coding/...）
  priority: 'P0' | 'P1' | 'P2'
  assignees: string[]
  output?: string           // ← 产出文件路径
  quality?: TaskQuality     // ← 质量评估结果（评审后填充）
  // ...其他状态字段
}
```

**缺失字段**：
- 无 `acceptanceCriteria`（验收条件）
- 无 `deliverables`（交付物清单）
- 无 `requirements`（具体要求）
- 无 `qualityStandards`（质量标准）

### 阶段 2: Chief 分配任务

**文件**: `core/autopilot/dept-directive.cjs:189-352`

Chief 收到的 directive 包含团队状态和任务列表，但**不包含任何任务级标准**。Chief 的分配决策输出格式：

```
[任务分配]
- novel-writer: 写第三章，主角进入森林
```

**文件**: `core/task/auto-transition.cjs:17-33`

`parseTaskAssignments()` 提取 `{ agentId, summary }`，summary 直接成为新任务的 `name`。

**文件**: `core/common/task-bridge.cjs:63-79`

```javascript
// Chief 的一句话摘要 → 成为任务的 name
createWorkTask(assignee, taskName, deptId, { type: 'dept-work' })
```

**问题**: Chief 的简短摘要是任务唯一的需求描述，没有结构化的验收条件。

### 阶段 3: Worker 执行任务

**文件**: `core/autopilot/task-prompt.cjs:35-114`

Worker 收到的 prompt 包含：

```
## 任务指令
**[Task: {task.id}]** {task.name}
{task.description}

- 类型: {task.type}
- 质量标准: 最低 {strategy.minPassingScore} 分
- 评审关注点: {strategy.reviewCriteria}     ← 仅 writing/editing 有
```

**这是标准信息最完整的阶段**，但也只有一个分数线和一句评审关注点。Worker 不知道：
- 具体要交付什么格式的产出
- 字数/长度要求是多少
- 哪些内容是必须包含的
- 什么算"完成"

### 阶段 4: 自检（Self-Check）

**文件**: `quality-orchestrator.cjs:225`

发给执行者的自检 prompt：

```
请检查你的任务产出质量：

任务: {task.name}
描述: {task.description}
产出内容: {output前5000字符}

请按以下清单自检，给出 0-100 的质量评分：
1. 是否完成了任务要求的所有内容？
2. 是否有明显的错误或遗漏？
3. 格式和表述是否规范？
4. 是否可以交付给下一环节？
```

**问题**:
- 4 条清单是硬编码的，不区分任务类型
- "任务要求"指的是 `task.name` 里那一句话
- 没有注入 `strategy.reviewCriteria`
- 没有注入任何具体的验收条件

### 阶段 5: 同行评审（Peer Review）

**文件**: `quality-orchestrator.cjs:257`

```
请 review 以下任务的产出：

任务: {task.name}
描述: {task.description}
执行者: {task.assignedAgent}
产出内容: {output前5000字符}

评审标准：
1. 完成度 — 是否满足任务要求？
2. 质量 — 是否有错误或可改进之处？
3. 一致性 — 是否与项目整体风格一致？
```

**问题**: 同样是 3 条通用清单，评审人不知道这个任务的具体要求是什么。

### 阶段 6: 主管审批（Head Approval）

**文件**: `quality-orchestrator.cjs:289`

```
作为部门主管，请审批以下任务：

任务: {task.name}
执行者: {assignee}
自检评分: {selfCheck.score}
同行评审评分: {peerReview.score}
评审意见: {peerReview.comments}

是否批准完成？回复 APPROVED 或 REJECTED + 原因
```

**问题**: 主管只看到分数和意见，看不到产出内容，也没有验收标准可参照。

---

## 三、标准散落地图

当前系统中与"标准"相关的配置分布在 5 个不相关的位置：

| 位置 | 文件 | 标准内容 | 谁用 | 谁不用 |
|------|------|---------|------|--------|
| **策略分数线** | `strategy.cjs:22-80` | `minPassingScore`: coding≥80, writing≥70... | self-check/peer-review 的阈值判定 | — |
| **策略评审关注点** | `strategy.cjs:28,35` | `reviewCriteria`: 仅 writing 和 editing 有 | Worker 执行 prompt（task-prompt.cjs:77） | self-check、peer-review、head-approval 都不用 |
| **硬校验规则** | `quality-orchestrator.cjs:206-216` | 产出存在、≥500字符、无模板变量 | self-check 前置校验 | — |
| **可插拔 validators** | `quality-validator.cjs:101-147` | wordCount、similarity、endingKeywords... | UI/API 任务完成时 | autopilot 质量门完全不调用 |
| **pipeline 质量门配置** | `entity/task/quality-validator.ts:5-27` | minScore、requireSelfCheck、validators[] | UI/API 的 `checkQualityGate()` | autopilot 走另一套逻辑 |

### 断裂点

```
strategy.reviewCriteria ──→ 只给 Worker 看，质量门评审时不用
                              ↑
                              断裂 1: 执行标准 ≠ 评估标准

quality-validator.cjs ──→ 只被 UI/API 调用，autopilot 不调用
                              ↑
                              断裂 2: UI 路径 ≠ autopilot 路径

500 字符硬编码 ──→ 不区分任务类型（小说章节 vs 配置文件）
                              ↑
                              断裂 3: 通用规则 ≠ 任务特定规则
```

---

## 四、额外发现的 Bug

### Bug 1: `peerReview.feedback` 字段名不匹配

**文件**: `core/autopilot/task-prompt.cjs:84`

```javascript
// task-prompt.cjs:84 — 引用 feedback 字段
if (task.quality?.peerReview?.feedback) {
  prompt += `\n\n## 上次评审反馈\n${task.quality.peerReview.feedback}`
}
```

但 `quality-orchestrator.cjs:267` 存的是 `comments`：

```javascript
// quality-orchestrator.cjs:267
const comments = result.text.match(/COMMENTS:\s*([\s\S]*?)$/)?.[1]?.trim() || ''
return { reviewer: reviewerId, passed, score, comments, at: ... }
//                                             ^^^^^^^^ 是 comments 不是 feedback
```

`entity/task/task.ts:55` 类型定义也是 `comments`：

```typescript
peerReview?: {
  reviewer: string
  passed: boolean
  score: number
  comments: string    // ← 不是 feedback
  at: string
}
```

**后果**: rework 任务的 Worker 永远看不到上次评审的反馈意见。

### Bug 2: 自检评分 OR 逻辑可能放行低分

**文件**: `quality-orchestrator.cjs:233-234`

```javascript
const passed = score >= threshold
  || (explicitPassed ? explicitPassed[1].toLowerCase() === 'true' : false)
```

Agent 可以给自己打 30 分但写 `PASSED: true`，依然通过自检。评分和 PASSED 字段是 OR 关系而非 AND。

---

## 五、与 common-utils guardrails 的对比

| 维度 | common-utils | Agent Factory |
|------|-------------|---------------|
| 标准定义位置 | 每个 checker 类内，声明式 | 散落在 5 个文件，部分硬编码 |
| 标准与任务的关联 | checklist 绑定到具体检查项 | 任务只有 name+description，无结构化标准 |
| 分级 | L0-L3（阻塞/告警/达标/超标） | 全有全无（通过/失败） |
| 可插拔性 | BaseGuardrail 抽象基类 + 具体实现 | validators 存在但 autopilot 不调用 |
| 标准可配置 | YAML 声明 | 硬编码在代码里 |
| 评估一致性 | 同一套 checker 不管从哪里调用 | UI 走 validators，autopilot 走 LLM prompt，结果不同 |

---

## 六、优化方案

### 方案概述：标准跟着任务走

```
┌───────────────────────────────────────────────────────────┐
│ 任务定义（Task Entity）                                    │
│                                                           │
│  name: "写第三章"                                          │
│  description: "主角进入森林..."                             │
│  type: "writing"                                          │
│  acceptanceCriteria: [              ← 新增                 │
│    "字数 ≥ 3000",                                         │
│    "包含主角与反派的对话",                                   │
│    "结尾设置悬念",                                         │
│  ]                                                        │
└──────────────┬────────────────────────────────────────────┘
               │ 标准传递
               ▼
┌───────────────────────────────────────────────────────────┐
│ Worker 执行 prompt                                         │
│                                                           │
│  任务: 写第三章                                             │
│  验收条件:                             ← 新增              │
│    1. 字数 ≥ 3000                                         │
│    2. 包含主角与反派的对话                                   │
│    3. 结尾设置悬念                                         │
│  评审关注点: 完成度、文笔质量、情节连贯性  ← 已有但断裂       │
│  最低分数: 70                                              │
└──────────────┬────────────────────────────────────────────┘
               │ 同一份标准
               ▼
┌───────────────────────────────────────────────────────────┐
│ 质量评估                                                   │
│                                                           │
│ L0 硬校验（不走 LLM，秒级完成）:                             │
│   ✓ 产出文件存在                                           │
│   ✓ 字数 ≥ 3000（来自 acceptanceCriteria，非全局 500）      │
│   ✓ 无模板变量                                             │
│   ✓ 调用 validators（wordCount, similarity...）            │
│                                                           │
│ L1 自检（走 LLM）:                                         │
│   prompt 注入 acceptanceCriteria + reviewCriteria          │
│   → "请逐条检查是否满足验收条件..."                          │
│   → 分数 ≥ strategy.minPassingScore                       │
│                                                           │
│ L2 同行评审（走 LLM，可与 L3 并行）:                        │
│   prompt 同样注入 acceptanceCriteria + reviewCriteria       │
│   → 评审人按具体标准评分，而非通用 3 条                      │
│                                                           │
│ L3 主管审批:                                               │
│   → 看到前面所有阶段结果 + 验收条件达成情况                   │
└───────────────────────────────────────────────────────────┘
```

### 具体改动

#### 改动 1: Task 实体加 `acceptanceCriteria` 字段

**文件**: `entity/task/task.ts`

```typescript
interface Task {
  // ...existing fields...
  acceptanceCriteria?: string[]    // 验收条件列表
}
```

**来源**:
- 用户手动创建任务时填写
- Chief 分配任务时，从 directive prompt 引导 Chief 输出结构化的验收条件
- Pipeline 任务从 workflow 配置继承

#### 改动 2: 质量门 prompt 注入任务级标准

**文件**: `quality-orchestrator.cjs`

Self-check prompt 从：
```
请按以下清单自检：
1. 是否完成了任务要求的所有内容？
2. 是否有明显的错误或遗漏？
3. 格式和表述是否规范？
4. 是否可以交付给下一环节？
```

改为：
```
请按以下验收条件逐条自检：
{task.acceptanceCriteria.map((c, i) => `${i+1}. ${c}`).join('\n')}

{strategy.reviewCriteria
  ? `评审关注点: ${strategy.reviewCriteria}`
  : ''}

对每条验收条件标注 ✓ 达成 或 ✗ 未达成，然后给出 0-100 的综合评分。
```

Peer-review prompt 同理。

#### 改动 3: 硬校验对齐 validators

**文件**: `quality-orchestrator.cjs:206-216`

在 `_requestSelfCheck` 的硬校验阶段，调用 `runValidator()`：

```javascript
// 当前: 硬编码 500 字符
if (content.length < 500) { return { passed: false, ... } }

// 改为: 从策略或 acceptanceCriteria 提取
const minLength = this._getMinLength(task)  // 解析 acceptanceCriteria 中的字数要求
if (content.length < minLength) { return { passed: false, ... } }

// 同时调用 validators（当前只在 UI 路径调用）
const gateConfig = this._getGateConfig(deptId, task.type)
for (const v of (gateConfig.validators || [])) {
  const errors = runValidator(v, task, gateConfig.validatorConfig?.[v] || {})
  if (errors.length > 0) {
    return { passed: false, score: 0, checklist: errors, at: new Date().toISOString() }
  }
}
```

#### 改动 4: Chief 分配时引导输出验收条件

**文件**: `core/autopilot/dept-directive.cjs`

在 directive 中加指引，让 Chief 输出结构化的任务分配：

```
[任务分配]
- agent-id: 任务摘要
  验收条件:
  1. 具体条件 1
  2. 具体条件 2
```

对应 `parseTaskAssignments` 也需要扩展，提取验收条件作为 task 的 `acceptanceCriteria`。

#### 改动 5: 修复 feedback/comments 字段名不匹配

**文件**: `core/autopilot/task-prompt.cjs:84`

```javascript
// 修复: feedback → comments
if (task.quality?.peerReview?.comments) {
  prompt += `\n\n## 上次评审反馈\n${task.quality.peerReview.comments}`
}
```

---

## 七、改动量评估

| 改动 | 文件 | 行数 | 风险 |
|------|------|------|------|
| Task 加 acceptanceCriteria | entity/task/task.ts + .cjs | ~5 行 | 低 |
| Self-check prompt 注入标准 | quality-orchestrator.cjs:225 | ~15 行 | 低 |
| Peer-review prompt 注入标准 | quality-orchestrator.cjs:257 | ~10 行 | 低 |
| Head-approval prompt 加验收条件 | quality-orchestrator.cjs:289 | ~5 行 | 低 |
| 硬校验调用 validators | quality-orchestrator.cjs:206 | ~20 行 | 中 |
| Chief directive 引导结构化输出 | dept-directive.cjs | ~10 行 | 中 |
| parseTaskAssignments 提取验收条件 | auto-transition.cjs:17-33 | ~20 行 | 中 |
| 修复 feedback→comments | task-prompt.cjs:84 | 1 行 | 低 |
| 自检评分 OR→AND | quality-orchestrator.cjs:233 | 1 行 | 低 |

---

## 八、当前标准断裂全景图

```
┌─ strategy.cjs ──────────────────────────────────┐
│ reviewCriteria: "完成度、文笔质量、情节连贯性"    │
│ minPassingScore: 70                              │
└──────┬──────────────────────────────┬────────────┘
       │                              │
       ▼                              ✗ 不传递
  task-prompt.cjs:77               quality-orchestrator.cjs
  (Worker 看到)                    (评审人看不到)


┌─ quality-validator.cjs ─────────────────────────┐
│ validators: wordCount, similarity, ending...     │
└──────┬──────────────────────────────┬────────────┘
       │                              │
       ▼                              ✗ 不调用
  UI/API 路径                      autopilot 路径
  (checkQualityGate)               (QualityOrchestrator)


┌─ quality-orchestrator.cjs:206-216 ──────────────┐
│ 硬校验: 存在 + ≥500字符 + 无模板变量              │
└──────┬──────────────────────────────┬────────────┘
       │                              │
       ▼                              ✗ 不可配置
  所有任务类型                      coding 50字符就够
  一律 500 字符                     novel 需要 3000+


┌─ quality-orchestrator.cjs:225,257 ──────────────┐
│ LLM 评估 prompt: 通用 4 条 / 3 条清单             │
└──────┬──────────────────────────────┬────────────┘
       │                              │
       ▼                              ✗ 不关联
  所有任务类型                      task.name 是唯一
  同一套清单                        的"需求描述"


┌─ task-prompt.cjs:84 ────────────────────────────┐
│ rework 时显示上次评审反馈                         │
│ 引用: task.quality?.peerReview?.feedback          │
└──────┬──────────────────────────────┬────────────┘
       │                              │
       ✗ 永远 undefined              实际字段名
                                     是 comments
```

**修复后的目标状态**:

```
┌─ Task Entity ───────────────────────────────────┐
│ acceptanceCriteria: ["字数≥3000", "含对话", ...]  │
│ type: "writing"                                  │
└──────┬──────────────────────────────┬────────────┘
       │                              │
       ▼                              ▼
  Worker 执行 prompt              质量门 prompt
  (注入验收条件)                  (注入同一份验收条件)
       │                              │
       ▼                              ▼
  strategy.reviewCriteria         strategy.reviewCriteria
  (注入评审关注点)                (注入同一份评审关注点)
       │                              │
       ▼                              ▼
  strategy.minPassingScore        strategy.minPassingScore
  (告知分数线)                    (评分阈值判定)
                                      │
                                      ▼
                                  validators
                                  (autopilot 也调用)
```
