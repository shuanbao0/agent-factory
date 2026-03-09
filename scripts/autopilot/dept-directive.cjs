/**
 * Department Directive — build directives for department heads
 */
const { join } = require('path')
const { readFileSync, existsSync } = require('fs')
const { DEPARTMENTS_DIR, PROJECTS_DIR } = require('./constants.cjs')
const { readAgentActivity, readProjectTasks, readDeptMission } = require('./readers.cjs')
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
function buildTeamStatus(agentIds, agentActivity) {
  if (!agentIds || agentIds.length === 0) return '(无团队成员)'
  let result = ''
  for (const agentId of agentIds) {
    const a = agentActivity[agentId]
    if (a) {
      const status = a.idleMins < 5 ? '🔴 忙碌' : a.idleMins < 30 ? '🟡 刚完成' : '🟢 空闲'
      result += `- ${agentId}: ${status}（${a.idleMins}分钟无活动, ${a.totalTokens} tokens）\n`
    } else {
      result += `- ${agentId}: ⚪ 无记录\n`
    }
  }
  return result
}

/**
 * Build department tasks from project data
 */
function buildDeptTasks(deptId, config) {
  const projects = readProjectTasks()
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
        const running = typeTasks.filter(t => t.status === 'running' || t.status === 'in_progress')
        const pending = typeTasks.filter(t => t.status === 'pending' || t.status === 'assigned')
        const completed = typeTasks.filter(t => t.status === 'completed')
        result += `**[${type}]** 进行中: ${running.length}, 待办: ${pending.length}, 完成: ${completed.length}/${typeTasks.length}\n`
        if (running.length > 0) {
          result += `  ${running.map(t => `[${t.id}] ${t.name} (${t.progress || 0}%)`).join(', ')}\n`
        }
      }
    }

    if (untyped.length > 0) {
      const running = untyped.filter(t => t.status === 'running' || t.status === 'in_progress')
      const pending = untyped.filter(t => t.status === 'pending' || t.status === 'assigned')
      const completed = untyped.filter(t => t.status === 'completed')
      if (running.length > 0) {
        result += `进行中: ${running.map(t => `[${t.id}] ${t.name} (${t.progress || 0}%)`).join(', ')}\n`
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
 * @returns {string} The directive text
 */
function buildDepartmentDirective(deptId, config, state) {
  const agentActivity = readAgentActivity()

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

  // Read department mission
  const deptMission = readDeptMission(deptId)
  const missionSection = deptMission ? `\n## 部门使命\n${deptMission}\n` : ''

  return `[Department Loop: ${deptId} Cycle #${(state.cycleCount || 0) + 1}]

你是 ${config.head}，${config.name || deptId} 部门主管。
${memorySection}${missionSection}
## CEO 指令
${readCeoDirectives(deptId)}

## 部门预算
${budgetInfo}

## 团队状态
${buildTeamStatus(config.agents, agentActivity)}

## 部门任务
${buildDeptTasks(deptId, config)}

## 部门 KPI
${buildKpiStatus(deptId, config.kpis)}

## 行动要求
1. **分配/调整团队任务** — 根据团队空闲状态和任务优先级重新分配工作
2. **检查进行中任务的产出质量** — 确保输出符合标准
3. **向 CEO 汇报关键进展** — 将重要信息写入部门报告
4. **更新你的 MEMORY.md** — 记录本轮做了什么
5. **如果部门方向、工作重点发生变化，更新部门使命文件** — 写入 config/departments/${deptId}/mission.md

## 行动原则
- 空闲 agent 必须有事做
- 卡住超过 2 轮的任务要换方式推进
- 重要进展和阻塞立即上报
`
}

module.exports = { buildDepartmentDirective, readCeoDirectives, buildTeamStatus, buildDeptTasks, buildKpiStatus }
