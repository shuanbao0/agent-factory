'use strict'
/**
 * AutoTransition — 自动任务状态流转规则
 *
 * 设计模式：Strategy + DI（注入 updateTaskStatus, processQualityGate）
 *
 * 从 department-loop.cjs 的 autoTransitionTasks 提取纯业务规则
 */

const { IDLE_COMPLETE_MINS, STALE_TASK_MINS } = require('../autopilot/constants.cjs')
const logger = require('../common/logger.cjs')

/**
 * Parse task assignments from chief's response.
 * Supports optional [project: xxx] annotation per line.
 * @param {string} text
 * @returns {Array<{agentId: string, summary: string, projectId?: string}>}
 */
function parseTaskAssignments(text) {
  if (!text) return []
  const match = text.match(/[\[【]任务分配[\]】]\s*\n([\s\S]*?)(?=\n[\[【]|$)/)
  if (!match) return []

  const lines = match[1].split('\n')
  const assignments = []
  for (const line of lines) {
    const m = line.match(/^(?:[-*]|\d+[.)]\s*)\s*(\S+?)[:\uff1a]\s*(.+?)(?:\s*[\(\uff08].*[\)\uff09])?\s*$/)
    if (!m) continue
    const [, agentId, rawSummary] = m
    if (/无需分配|不需要|跳过/.test(rawSummary)) continue
    if (/task-[a-z0-9]/.test(line)) continue

    // Extract optional [project: xxx]
    const projMatch = rawSummary.match(/\[project:\s*([^\]]+)\]/)
    const projectId = projMatch ? projMatch[1].trim() : undefined
    const summary = rawSummary.replace(/\[project:\s*[^\]]+\]\s*/, '').trim()

    const entry = { agentId, summary }
    if (projectId) entry.projectId = projectId
    assignments.push(entry)
  }
  return assignments
}

/**
 * Parse task completions from chief's response.
 * @param {string} text
 * @returns {string[]}
 */
function parseTaskCompletions(text) {
  if (!text) return []
  const completedIds = new Set()
  const completionKeywords = /完成|已完成|已交付|done|finished|completed|100%/i

  const completionMatch = text.match(/[\[【]任务完成[\]】]\s*\n([\s\S]*?)(?=\n[\[【]|$)/)
  if (completionMatch) {
    for (const line of completionMatch[1].split('\n')) {
      const m = line.match(/(task-[a-z0-9-]+)/i)
      if (m && !/无/.test(line.trim())) completedIds.add(m[1])
    }
  }

  const progressMatch = text.match(/[\[【]进展汇报[\]】]\s*\n([\s\S]*?)(?=\n[\[【]|$)/)
  if (progressMatch) {
    for (const line of progressMatch[1].split('\n')) {
      const m = line.match(/(task-[a-z0-9-]+)/i)
      if (m && completionKeywords.test(line)) completedIds.add(m[1])
    }
  }

  return [...completedIds]
}

/**
 * Parse task recovery decisions from chief's response.
 * Chief marks failed tasks as 'completed' (recover) or 'reassign' (re-assign to idle agent).
 * @param {string} text
 * @returns {Array<{taskId: string, action: 'completed' | 'reassign'}>}
 */
function parseTaskRecoveries(text) {
  if (!text) return []
  const match = text.match(/[\[【]任务恢复[\]】]\s*\n([\s\S]*?)(?=\n[\[【]|$)/)
  if (!match) return []

  const recoveries = []
  for (const line of match[1].split('\n')) {
    const m = line.match(/(task-[a-z0-9-]+)/i)
    if (!m) continue
    if (/无/.test(line.trim()) && !/无需/.test(line.trim())) continue
    const taskId = m[1]
    if (/reassign|重新分配|重做|重新指派/i.test(line)) {
      recoveries.push({ taskId, action: 'reassign' })
    } else if (/completed|完成|已完成|恢复|recover/i.test(line)) {
      recoveries.push({ taskId, action: 'completed' })
    }
  }
  return recoveries
}

/**
 * Compute auto-transitions for department tasks.
 *
 * @param {object} opts
 * @param {Array} opts.allTasks - All tasks assigned to department agents
 * @param {Object} opts.agentActivity - {[agentId]: {idleMins, ...}}
 * @param {string} opts.chiefResponseText - Chief's response
 * @param {boolean} [opts.idleOnly=false] - Skip chief completions
 * @param {number} [opts.idleCompleteMins] - Override IDLE_COMPLETE_MINS
 * @param {number} [opts.staleTaskMins] - Override STALE_TASK_MINS
 * @param {boolean} [opts.dualSessionEnabled=false] - Use status query results instead of idle-based logic
 * @param {Object} [opts.statusQueryResults] - {[agentId]: {working?, completed?, idle?, timeout?}}
 * @returns {Array<{taskId, taskName, agentId, from, to, reason, extras?}>}
 */
function computeTransitions(opts) {
  const {
    allTasks,
    agentActivity,
    chiefResponseText,
    idleOnly = false,
    idleCompleteMins = IDLE_COMPLETE_MINS,
    staleTaskMins = STALE_TASK_MINS,
    dualSessionEnabled = false,
    statusQueryResults,
  } = opts

  const transitions = []
  if (!allTasks || allTasks.length === 0) return transitions

  const chiefCompletions = idleOnly ? [] : parseTaskCompletions(chiefResponseText)

  // 1. Chief-reported completions
  if (!idleOnly) {
    for (const taskId of chiefCompletions) {
      const task = allTasks.find(t => t.id === taskId)
      if (task && ['in_progress', 'rework'].includes(task.status)) {
        const assignee = task.assignedAgent || (task.assignees && task.assignees[0])
        if (assignee) {
          transitions.push({ taskId: task.id, taskName: task.name || '', agentId: assignee, from: task.status, to: 'review', reason: 'chief 确认完成，进入质量审核' })
        }
      }
    }
  }

  // 2. Idle-based transitions
  for (const task of allTasks) {
    if (!['in_progress', 'rework', 'assigned', 'review'].includes(task.status)) continue
    if (chiefCompletions.includes(task.id)) continue

    const assignee = task.assignedAgent || (task.assignees && task.assignees[0])
    if (!assignee) continue
    const activity = agentActivity[assignee]
    const idleMins = activity
      ? activity.idleMins
      : Math.floor((Date.now() - new Date(task.updatedAt || task.createdAt).getTime()) / 60000)

    if (task.status === 'assigned') {
      if (idleMins < 5) {
        transitions.push({ taskId: task.id, taskName: task.name || '', agentId: assignee, from: 'assigned', to: 'in_progress', reason: 'agent 活跃，自动提升' })
      } else if (idleMins >= staleTaskMins) {
        transitions.push({ taskId: task.id, taskName: task.name || '', agentId: assignee, from: 'assigned', to: 'failed', reason: `agent 空闲 ${idleMins}m 未开始` })
      }
    } else if (task.status === 'review') {
      if (idleMins >= idleCompleteMins) {
        // Mark as needing quality gate — caller handles async gate execution
        transitions.push({ taskId: task.id, taskName: task.name || '', agentId: assignee, from: 'review', to: '_quality_gate', reason: `agent 空闲 ${idleMins}m, 需要质量审核`, _task: task })
      }
    } else if (task.status === 'in_progress' || task.status === 'rework') {
      if (dualSessionEnabled && statusQueryResults) {
        // Dual-session path: use explicit status query instead of idle guessing
        const status = statusQueryResults[assignee]
        if (status?.working) continue  // worker is running, don't interfere
        if (status?.completed || status?.idle) {
          transitions.push({ taskId: task.id, taskName: task.name || '', agentId: assignee, from: task.status, to: 'review', reason: 'agent 报告完成/空闲' })
        }
        if (status?.timeout) {
          transitions.push({ taskId: task.id, taskName: task.name || '', agentId: assignee, from: task.status, to: '_no_response', reason: 'agent 无响应' })
        }
      } else {
        // Legacy idle-based path
        if (idleMins >= staleTaskMins && (task.progress || 0) < 50) {
          transitions.push({ taskId: task.id, taskName: task.name || '', agentId: assignee, from: task.status, to: 'failed', reason: `agent 空闲 ${idleMins}m 且进度 <50%` })
        } else if (idleMins >= idleCompleteMins) {
          transitions.push({ taskId: task.id, taskName: task.name || '', agentId: assignee, from: task.status, to: 'review', reason: `agent 空闲 ${idleMins}m, 待 chief 确认` })
        }
      }
    }
  }

  for (const t of transitions) {
    logger.info('auto-transition', 'Task auto-transitioned', { taskId: t.taskId, from: t.from, to: t.to, reason: t.reason })
  }

  return transitions
}

module.exports = {
  parseTaskAssignments,
  parseTaskCompletions,
  parseTaskRecoveries,
  computeTransitions,
  IDLE_COMPLETE_MINS,
  STALE_TASK_MINS,
}
