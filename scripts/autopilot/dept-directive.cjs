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
function buildTeamStatus(agentIds, agentActivity) {
  if (!agentIds || agentIds.length === 0) return '(无团队成员)'
  let result = ''
  for (const agentId of agentIds) {
    const a = agentActivity[agentId]
    const meta = readAgentMeta(agentId)
    const roleSuffix = meta && meta.description ? ` | 职责: ${meta.description}` : ''
    if (a) {
      const status = a.idleMins < 5 ? '🔴 忙碌' : a.idleMins < 30 ? '🟡 刚完成' : '🟢 空闲'
      result += `- ${agentId}: ${status}（${a.idleMins}分钟无活动, ${a.totalTokens} tokens）${roleSuffix}\n`
    } else {
      result += `- ${agentId}: ⚪ 无记录${roleSuffix}\n`
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

### ⚠️ 最重要：分配任务给空闲 agent
如果团队中有 🟢 空闲 或 ⚪ 无记录的 agent，你**必须**立即使用 peer-send 给他们分配任务。

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

### 其他行动
1. **检查进行中任务的产出质量** — 确保输出符合标准
2. **向 CEO 汇报关键进展** — 将重要信息写入部门报告
3. **更新你的 MEMORY.md** — 记录本轮做了什么
4. **如果部门方向、工作重点发生变化，更新部门使命文件** — 写入 config/departments/${deptId}/mission.md

## 行动原则
- **空闲 agent 必须有事做** — 发现空闲 agent 不分配任务是严重失职
- 卡住超过 2 轮的任务要换方式推进
- 重要进展和阻塞立即上报
- 每轮 cycle 至少执行一次 peer-send（如果有空闲 agent）

## 输出格式要求
请在响应中包含以下结构化总结：
\`\`\`
[任务分配]
- <agent-id>: <分配的任务摘要> (peer-send 已发送/无需分配)
[进展汇报]
- <关键进展>
[阻塞项]
- <如有>
\`\`\`
`
}

module.exports = { buildDepartmentDirective, readCeoDirectives, buildTeamStatus, buildDeptTasks, buildKpiStatus }
