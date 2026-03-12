/**
 * Department Directive — build directives for department heads
 */
const { join } = require('path')
const { readFileSync, existsSync } = require('fs')
const { DEPARTMENTS_DIR, PROJECTS_DIR } = require('./constants.cjs')
const { readAgentActivity, readProjectTasks, readDeptMission, readBaseMission, readAgentMeta } = require('./readers.cjs')
const { buildMemoryContext } = require('./memory.cjs')
const logger = require('./logger.cjs')

/**
 * Read CEO directives for a specific department
 */
function readCeoDirectives(deptId) {
  const dirPath = join(DEPARTMENTS_DIR, deptId, 'ceo-directives.json')
  if (!existsSync(dirPath)) return '(无 CEO 特别指令)'
  try {
    const data = JSON.parse(readFileSync(dirPath, 'utf-8'))
    return (data.directives || []).map(d => `- ${d}`).join('\n') || '(无)'
  } catch (err) {
    logger.debug('dept-directive', `Failed to read CEO directives for ${deptId}`, err)
    return '(读取失败)'
  }
}

/**
 * Build team status for agents in a department
 */
function buildTeamStatus(agentIds, agentActivity, projects) {
  if (!agentIds || agentIds.length === 0) return '(无团队成员)'

  // Count in_progress tasks per agent
  const inProgressCount = {}
  for (const proj of projects) {
    for (const t of (proj.tasks || [])) {
      if (t.status !== 'in_progress') continue
      const assignees = [t.assignedAgent, ...(t.assignees || [])].filter(Boolean)
      for (const a of assignees) {
        if (agentIds.includes(a)) {
          inProgressCount[a] = (inProgressCount[a] || 0) + 1
        }
      }
    }
  }

  let result = ''
  for (const agentId of agentIds) {
    const a = agentActivity[agentId]
    const meta = readAgentMeta(agentId)
    const roleSuffix = meta && meta.description ? ` | 职责: ${meta.description}` : ''
    const taskCount = inProgressCount[agentId] || 0
    const taskSuffix = taskCount > 0 ? `, ${taskCount}个进行中任务` : ''
    if (a) {
      const status = a.idleMins < 5 ? '🔴 忙碌' : a.idleMins < 30 ? '🟡 刚完成' : '🟢 空闲'
      result += `- ${agentId}: ${status}（${a.idleMins}分钟无活动, ${a.totalTokens} tokens${taskSuffix}）${roleSuffix}\n`
    } else {
      result += `- ${agentId}: ⚪ 无记录${taskSuffix ? `（${taskSuffix.slice(2)}）` : ''}${roleSuffix}\n`
    }
  }
  return result
}

/**
 * Build department tasks from project data
 */
function buildDeptTasks(deptId, config, projects) {
  const agentIds = config.agents || []
  let result = ''

  for (const proj of projects) {
    const tasks = (proj.tasks || []).filter(t =>
      agentIds.includes(t.assignedAgent) || (t.assignees || []).some(a => agentIds.includes(a))
    )
    if (tasks.length === 0) continue

    result += `\n### ${proj.name}\n`

    // Group by task type if available
    const byType = {}
    const untyped = []
    for (const t of tasks) {
      if (t.type) {
        if (!byType[t.type]) byType[t.type] = []
        byType[t.type].push(t)
      } else {
        untyped.push(t)
      }
    }

    const typeKeys = Object.keys(byType)
    if (typeKeys.length > 0) {
      for (const type of typeKeys) {
        const typeTasks = byType[type]
        const running = typeTasks.filter(t => t.status === 'in_progress')
        const review = typeTasks.filter(t => t.status === 'review')
        const pending = typeTasks.filter(t => t.status === 'pending' || t.status === 'assigned')
        const completed = typeTasks.filter(t => t.status === 'completed')
        result += `**[${type}]** 进行中: ${running.length}, 待确认: ${review.length}, 待办: ${pending.length}, 完成: ${completed.length}/${typeTasks.length}\n`
        if (running.length > 0) {
          result += `  进行中: ${running.map(t => `[${t.id}] ${t.name} (${t.progress || 0}%)`).join(', ')}\n`
        }
        if (review.length > 0) {
          result += `  ⏳ 待确认: ${review.map(t => `[${t.id}] ${t.name} → ${t.assignedAgent || (t.assignees && t.assignees[0]) || '?'}`).join(', ')}\n`
        }
      }
    }

    if (untyped.length > 0) {
      const running = untyped.filter(t => t.status === 'in_progress')
      const review = untyped.filter(t => t.status === 'review')
      const pending = untyped.filter(t => t.status === 'pending' || t.status === 'assigned')
      const completed = untyped.filter(t => t.status === 'completed')
      if (running.length > 0) {
        result += `进行中: ${running.map(t => `[${t.id}] ${t.name} (${t.progress || 0}%)`).join(', ')}\n`
      }
      if (review.length > 0) {
        result += `⏳ 待确认: ${review.map(t => `[${t.id}] ${t.name} → ${t.assignedAgent || (t.assignees && t.assignees[0]) || '?'}`).join(', ')}\n`
      }
      if (pending.length > 0) {
        result += `待办: ${pending.map(t => `[${t.id}] ${t.name}`).join(', ')}\n`
      }
      result += `完成: ${completed.length}/${untyped.length}\n`
    }
  }

  return result || '(无部门任务)'
}

/**
 * Build KPI status display
 */
function buildKpiStatus(deptId, kpiDefs) {
  if (!kpiDefs || Object.keys(kpiDefs).length === 0) return '(无 KPI 定义)'

  let result = ''
  for (const [metric, def] of Object.entries(kpiDefs)) {
    result += `- ${metric}: 目标 ${def.target} ${def.unit || ''}\n`
  }
  return result
}

/**
 * Build a complete directive for a department head.
 *
 * @param {string} deptId - Department ID
 * @param {object} config - Department config
 * @param {object} state - Department state
 * @param {Array<{taskId: string, taskName: string, agentId: string, from: string, to: string, reason: string}>} [transitions] - Task transitions from pre-send auto-transition
 * @returns {string} The directive text
 */
function buildDepartmentDirective(deptId, config, state, transitions) {
  const agentActivity = readAgentActivity()
  const projects = readProjectTasks()

  // Try to get structured memory for the department head
  let memorySection = ''
  try {
    const memCtx = buildMemoryContext(config.head, 'department')
    if (memCtx.summary) memorySection = `\n## 你的记忆\n${memCtx.summary}\n`
  } catch {
    // No memory available
  }

  const budgetInfo = config.budget
    ? `今日已用: ${state.tokensUsedToday || 0} / ${config.budget.dailyTokenLimit} tokens`
    : '(无预算限制)'

  // Read base mission + department mission
  const baseMission = readBaseMission()
  const deptMission = readDeptMission(deptId)

  let missionSection = ''
  if (baseMission || deptMission) {
    missionSection = '\n## 部门使命\n'
    if (baseMission) {
      missionSection += `### 通用准则\n${baseMission}\n\n`
    }
    if (deptMission) {
      missionSection += `### 本部门使命\n${deptMission}\n`
    }
  }

  // Build transitions summary (from pre-send auto-transition)
  let transitionSection = ''
  if (transitions && transitions.length > 0) {
    transitionSection = '\n## ⚡ 本轮任务自动变化（系统检测）\n'
    transitionSection += '以下任务在本轮开始前被系统自动流转，请注意处理：\n'
    for (const t of transitions) {
      const statusLabels = {
        review: '⏳ 待确认完成',
        completed: '✅ 已完成',
        failed: '❌ 已失败',
        in_progress: '🔄 进行中',
      }
      const label = statusLabels[t.to] || t.to
      transitionSection += `- [${t.taskId}] ${t.taskName} → ${t.agentId}: ${t.from} → ${label}（${t.reason}）\n`
    }
    // Highlight review tasks that need chief action
    const reviewTasks = transitions.filter(t => t.to === 'review')
    if (reviewTasks.length > 0) {
      transitionSection += `\n> 🔔 有 ${reviewTasks.length} 个任务等待你确认完成。请检查产出质量后在 [任务完成] 中确认，或通过 peer-send 要求 agent 继续完善。\n`
    }
    const failedTasks = transitions.filter(t => t.to === 'failed')
    if (failedTasks.length > 0) {
      transitionSection += `> ⚠️ 有 ${failedTasks.length} 个任务因长时间无进展被标记为失败。请决定是否重新分配。\n`
    }
  }

  return `[Department Loop: ${deptId} Cycle #${(state.cycleCount || 0) + 1}]

你是 ${config.head}，${config.name || deptId} 部门主管。
${memorySection}${missionSection}
## CEO 指令
${readCeoDirectives(deptId)}

## 部门预算
${budgetInfo}
${transitionSection}
## 团队状态
${buildTeamStatus(config.agents, agentActivity, projects)}

## 部门任务
${buildDeptTasks(deptId, config, projects)}

## 部门 KPI
${buildKpiStatus(deptId, config.kpis)}

## 行动要求

### ⛔ 分配决策原则（按优先级）

**第一步：审视全局状态**
分配任务前，先审视上方「部门任务」和「团队状态」：
- 哪些项目有待办(pending)任务尚未被认领？
- 哪些进行中任务卡住了（进度长期无变化）？需要换人或换方式吗？
- 哪些任务已完成？是否释放了后续依赖任务？
- 项目整体进度如何？是否需要调整优先级？

**第二步：判断 agent 是否可分配**
- agent 已有进行中(in_progress)任务 → **不要**分配新任务，让他专注完成现有工作
- agent 无进行中任务且 🟢 空闲 或 ⚪ 无记录 → 可以分配
- agent 🟡 刚完成但无进行中任务 → 可以分配

**第三步：选择合适的任务**
- 优先分配已有的 pending/assigned 待办任务，而非凭空创建新任务
- 如果有卡住的任务，考虑让空闲 agent 协助或接手
- 任务分配要匹配 agent 的职责（参考状态行中的「职责」字段）
- 只有当所有待办任务都已分配时，才根据项目需要创建新任务

### ⚠️ 执行分配
确认可以分配后，使用 peer-send 给 agent 发送具体任务指令。

**调用方式（直接在 bash 中执行）：**
\`\`\`bash
node skills/peer-status/scripts/peer-send.mjs --from ${config.head} --to <目标agent-id> --message "具体任务指令" --no-wait
\`\`\`

**示例：**
\`\`\`bash
node skills/peer-status/scripts/peer-send.mjs --from ${config.head} --to novel-writer --message "请继续写作第3章，参考 projects/novel/ 下的大纲" --no-wait
\`\`\`

### 📋 任务追踪
分配任务前，**先通过任务 API 创建任务**，再发 peer-send。
- \`agent\` = 你自己的 ID（创建者）
- \`assignees\` = **实际执行任务的 agent ID 列表**（⚠️ 不是你自己！）

\`\`\`bash
curl -X POST -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" -H "Content-Type: application/json" \\
  -d '{"agent":"${config.head}","name":"任务名","projectId":"${deptId}","type":"dept-work","assignees":["实际执行的agent-id"]}' \\
  "http://127.0.0.1:3100/api/agent-tasks"
\`\`\`
peer-send 消息中引用任务 ID：\`[Task: task-xxx] 具体指令...\`

> 即使你忘记创建任务，department-loop 会自动从你的响应中补建。但主动创建可提供更准确的描述。

### 📝 确认完成（review 任务）
如果「本轮任务自动变化」或「部门任务」中有 review 状态的任务：
1. 检查 agent 的工作产出（在 workspaces/{agent-id}/ 中）
2. 如果质量合格 → 在 [任务完成] 中列出该 task ID
3. 如果需要修改 → 通过 peer-send 要求修改，**消息中必须包含 [Task: task-xxx]**（系统会自动将任务回退到 in_progress）：
\`\`\`bash
node skills/peer-status/scripts/peer-send.mjs --from ${config.head} --to <agent-id> --message "[Task: task-xxx] 请修改：<具体修改意见>" --no-wait
\`\`\`

### 其他行动
1. **检查进行中任务的产出质量** — 确保输出符合标准
2. **处理失败的任务** — 如果有任务被系统标记为失败，决定是否重新分配给其他 agent
3. **向 CEO 汇报关键进展** — 将重要信息写入部门报告
4. **更新你的 MEMORY.md** — 记录本轮做了什么
5. **如果部门方向、工作重点发生变化，更新部门使命文件** — 写入 config/departments/${deptId}/mission.md

## 行动原则
- **先完成再开始** — 已有进行中任务的 agent 不派新活，专注完成现有工作
- **待办优先于新建** — 优先分配已存在的 pending 任务，减少任务膨胀
- **无任务的空闲 agent 必须有事做** — 发现无任务的空闲 agent 不分配是失职
- 卡住超过 2 轮的任务要换方式推进或换人
- 重要进展和阻塞立即上报

## 输出格式要求
请在响应中包含以下结构化总结：
\`\`\`
[任务分配]
- <agent-id>: <分配的任务摘要> (peer-send 已发送/无需分配)
[任务完成]
- <task-id>: <完成情况> 或 "无"
[进展汇报]
- <关键进展>
[阻塞项]
- <如有>
\`\`\`
`
}

module.exports = { buildDepartmentDirective, readCeoDirectives, buildTeamStatus, buildDeptTasks, buildKpiStatus }
