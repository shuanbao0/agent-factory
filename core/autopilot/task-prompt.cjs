'use strict'
/**
 * TaskPrompt — Build self-contained task prompts for Worker Sessions
 *
 * Pure function module. Assembles all context an agent needs to execute
 * a task in an isolated worker session (clean context, no history).
 */
const { agentMetaRepo } = require('../repo/agent-meta.cjs')
const { missionRepo } = require('../repo/mission.cjs')
const { buildMemoryContext, loadTaskMemories } = require('../agent/memory.cjs')
const { getStrategy } = require('../task/strategy.cjs')
const { getStandardsForType } = require('../common/task-standards.cjs')
const { MAX_TASK_MEMORIES, MEMORY_MAX_CHARS } = require('./constants.cjs')

/**
 * Read agent meta and extract display fields.
 */
function readAgentMeta(agentId) {
  const meta = agentMetaRepo.readMeta(agentId)
  if (!meta) return null
  return { description: meta.description || '', role: meta.role || agentId, name: meta.name || agentId }
}

/**
 * Build a self-contained prompt for a worker session to execute a task.
 *
 * @param {string} agentId - The agent executing the task
 * @param {object} task - Task object { id, name, description, type, reworkCount, quality }
 * @param {object} [options]
 * @param {string} [options.deptId] - Department ID for project context
 * @param {object} [options.deptConfig] - Department config for strategy lookup
 * @param {number} [options.maxMemories] - Max task memories to include
 * @param {number} [options.maxChars] - Max chars for memory context
 * @returns {string} - Complete prompt for the worker session
 */
function buildTaskPrompt(agentId, task, options = {}) {
  const {
    deptId,
    deptConfig,
    maxMemories = MAX_TASK_MEMORIES,
    maxChars = MEMORY_MAX_CHARS,
  } = options

  const sections = []

  // 1. Agent identity
  const meta = readAgentMeta(agentId)
  if (meta) {
    sections.push(`## 你的身份\n你是 ${meta.name || agentId}。${meta.description || ''}`)
  }

  // 2. Agent memory summary
  const memCtx = buildMemoryContext(agentId, 'department')
  if (memCtx.summary) {
    const trimmed = memCtx.summary.slice(0, maxChars)
    sections.push(`## 记忆摘要\n${trimmed}`)
  }

  // 3. Project background
  if (deptId) {
    const mission = missionRepo.readDeptMission(deptId)
    if (mission) {
      sections.push(`## 项目背景\n${mission.slice(0, 1000)}`)
    }
  }

  // 4. Task description + quality standards
  const strategy = getStrategy(task.type, deptConfig)
  const taskSection = [
    `## 任务指令`,
    '',
    `**[Task: ${task.id}]** ${task.name || ''}`,
    '',
    task.description || '（无详细描述）',
    '',
    `- 类型: ${task.type || 'unknown'}`,
    `- 质量标准: 最低 ${strategy.minPassingScore} 分`,
    strategy.reviewCriteria ? `- 评审关注点: ${strategy.reviewCriteria}` : '',
  ].filter(Boolean).join('\n')
  sections.push(taskSection)

  // 4b. Task standards (from config/task-standards.md)
  try {
    const standards = getStandardsForType(task.type)
    if (standards.typeStandards || standards.generalStandards) {
      const stdParts = ['## 任务标准']
      if (standards.typeStandards) {
        stdParts.push(`\n### ${task.type} 类型标准\n${standards.typeStandards}`)
      }
      if (standards.generalStandards && !standards.typeStandards) {
        stdParts.push(`\n### 通用标准\n${standards.generalStandards}`)
      }
      sections.push(stdParts.join('\n'))
    }
  } catch { /* skip if standards unavailable */ }

  // 5. Rework info
  if (task.reworkCount > 0) {
    const reworkSection = [`## 返工信息（第 ${task.reworkCount} 次返工）`]
    if (task.quality?.peerReview?.comments) {
      reworkSection.push(`\n评审反馈:\n${task.quality.peerReview.comments.slice(0, 800)}`)
    }
    if (task.quality?.selfCheck?.score != null) {
      reworkSection.push(`上次自检评分: ${task.quality.selfCheck.score}`)
    }
    reworkSection.push('\n请针对以上反馈进行修正，确保本次产出有实质性改进。')
    sections.push(reworkSection.join('\n'))
  }

  // 6. Related task memories
  const memories = loadTaskMemories(agentId, { limit: maxMemories })
  if (memories.length > 0) {
    const memSection = ['## 相关任务记忆']
    for (const mem of memories) {
      memSection.push(`\n### ${mem.taskId}\n${mem.content.slice(0, 500)}`)
    }
    sections.push(memSection.join('\n'))
  }

  // 7. Execution instructions
  sections.push([
    '## 执行要求',
    '',
    '1. 完成任务后，通过任务 API 更新状态为 completed，附带自检评分和产出路径。',
    '2. 所有产出写入 workspaces/ 目录。',
    '3. 如遇阻塞，立即通过 peer-send 通知部门主管。',
  ].join('\n'))

  return sections.join('\n\n')
}

/**
 * Build lightweight supplementary context for a task description.
 *
 * Unlike buildTaskPrompt (full self-contained prompt), this only returns
 * context the worker sub-session wouldn't otherwise have: quality standards,
 * rework feedback, project background, and task memories.
 * Agent identity and execution instructions are omitted (already in AGENTS.md / base-rules).
 *
 * @param {string} agentId
 * @param {string} summary - Chief's one-line task summary
 * @param {object} [options]
 * @param {string} [options.deptId]
 * @param {object} [options.deptConfig]
 * @param {string} [options.taskType]
 * @param {number} [options.reworkCount]
 * @param {object} [options.quality] - Previous quality gate results
 * @returns {string}
 */
function buildTaskContext(agentId, summary, options = {}) {
  const { deptId, deptConfig, taskType, reworkCount, quality } = options
  const parts = [summary]

  // Quality standards from strategy
  try {
    const strategy = getStrategy(taskType, deptConfig)
    parts.push(`\n质量标准: 最低 ${strategy.minPassingScore} 分`)
    if (strategy.reviewCriteria) {
      parts.push(`评审关注点: ${strategy.reviewCriteria}`)
    }
  } catch { /* skip if strategy unavailable */ }

  // Task standards (completion definition + boundaries)
  try {
    const standards = getStandardsForType(taskType)
    if (standards.typeStandards) {
      // Extract just completion definition and DO/DON'T from type standards
      const completionMatch = standards.typeStandards.match(/\*\*完成定义[：:]\*\*\s*(.+)/)
      if (completionMatch) parts.push(`完成定义: ${completionMatch[1]}`)
      const doMatch = standards.typeStandards.match(/\*\*DO[：:]\*\*\s*(.+)/)
      if (doMatch) parts.push(`要求: ${doMatch[1]}`)
      const dontMatch = standards.typeStandards.match(/\*\*DON'T[：:]\*\*\s*(.+)/)
      if (dontMatch) parts.push(`禁止: ${dontMatch[1]}`)
    }
  } catch { /* skip */ }

  // Project background
  if (deptId) {
    try {
      const mission = missionRepo.readDeptMission(deptId)
      if (mission) {
        parts.push(`\n项目背景: ${mission.slice(0, 500)}`)
      }
    } catch { /* skip */ }
  }

  // Rework feedback
  if (reworkCount > 0 && quality) {
    const reworkParts = [`\n返工信息（第 ${reworkCount} 次）:`]
    if (quality.peerReview?.comments) {
      reworkParts.push(`评审反馈: ${quality.peerReview.comments.slice(0, 500)}`)
    }
    if (quality.selfCheck?.score != null) {
      reworkParts.push(`上次自检评分: ${quality.selfCheck.score}`)
    }
    parts.push(reworkParts.join('\n'))
  }

  // Related task memories
  try {
    const memories = loadTaskMemories(agentId, { limit: MAX_TASK_MEMORIES })
    if (memories.length > 0) {
      const memLines = memories.map(m => `- ${m.taskId}: ${m.content.slice(0, 200)}`).join('\n')
      parts.push(`\n相关任务经验:\n${memLines}`)
    }
  } catch { /* skip */ }

  return parts.join('\n')
}

module.exports = { buildTaskPrompt, buildTaskContext }
