'use strict'
/**
 * TaskStateMachine — 任务状态有限状态机
 *
 * 设计模式：State Machine（显式状态转换表）
 *
 * 职责：
 * - 定义任务生命周期的 7 种状态和合法转换路径
 * - 校验状态转换是否合法（canTransition）
 * - 执行状态转换并记录时间戳和历史（transition）
 * - 标准化非标准状态名（如 'running' → 'in_progress'）
 *
 * 状态流转图：
 *   pending → assigned → in_progress → review → completed
 *                    ↘                ↗    ↘
 *                     → in_progress        rework → in_progress
 *   任何非终态 → failed
 *
 * 终态：completed, failed（不可再转换）
 */

/** 所有合法任务状态 */
const STATUSES = ['pending', 'assigned', 'in_progress', 'review', 'completed', 'failed', 'rework']

/** 状态转换表：每个状态允许转换到哪些目标状态 */
const TRANSITIONS = {
  pending:     ['assigned', 'in_progress', 'completed', 'failed'],
  assigned:    ['in_progress', 'completed', 'failed'],
  in_progress: ['review', 'completed', 'rework', 'failed'],
  review:      ['completed', 'rework', 'in_progress', 'failed'],
  rework:      ['in_progress', 'review', 'completed', 'failed'],
  completed:   [],  // 终态，不可转换
  failed:      [],  // 终态，不可转换
}

/** 终态集合（不可再转换的状态） */
const TERMINAL = new Set(['completed', 'failed'])

/**
 * 检查从 from 到 to 的状态转换是否合法
 * @param {string} from - 当前状态
 * @param {string} to - 目标状态
 * @returns {boolean}
 */
function canTransition(from, to) {
  const allowed = TRANSITIONS[from]
  if (!allowed) return false
  return allowed.includes(to)
}

/**
 * 获取某状态的所有合法目标状态
 * @param {string} from - 当前状态
 * @returns {string[]} 允许转换到的状态列表
 */
function getValidTransitions(from) {
  return TRANSITIONS[from] || []
}

/**
 * 判断是否为终态（completed 或 failed）
 * @param {string} status
 * @returns {boolean}
 */
function isTerminal(status) {
  return TERMINAL.has(status)
}

/**
 * 判断是否为合法的任务状态
 * @param {string} status
 * @returns {boolean}
 */
function isValidStatus(status) {
  return STATUSES.includes(status)
}

/**
 * 标准化非标准状态名
 * 兼容旧版：'running' → 'in_progress'
 * @param {string} status
 * @returns {string}
 */
function normalizeStatus(status) {
  if (status === 'running') return 'in_progress'
  return status
}

/**
 * 执行状态转换
 *
 * 会直接修改 task 对象（mutate），设置 status、updatedAt 等字段
 * 如果转换非法则返回错误信息，不修改 task
 *
 * @param {object} task - 任务对象（会被修改）
 * @param {string} to - 目标状态
 * @param {object} [context={}] - 上下文信息
 * @param {string} [context.actor] - 执行者（agent ID 或 'system'）
 * @param {string} [context.reason] - 转换原因
 * @param {object} [context.extras] - 额外字段，会合并到 task 上
 * @param {boolean} [context.recordHistory] - 是否记录转换历史到 task._transitions
 * @returns {{ ok: boolean, task?: object, error?: string, reason?: string }}
 */
function transition(task, to, context = {}) {
  const from = task.status
  if (!canTransition(from, to)) {
    return {
      ok: false,
      error: `Invalid transition: ${from} → ${to}`,
      reason: `Allowed: ${getValidTransitions(from).join(', ') || 'none (terminal)'}`,
    }
  }

  task.status = to
  task.updatedAt = new Date().toISOString()

  // 完成时记录完成时间
  if (to === 'completed') task.completedAt = new Date().toISOString()
  // 合并额外字段
  if (context.extras) Object.assign(task, context.extras)

  // 可选：记录转换历史（用于审计和调试）
  if (context.recordHistory) {
    if (!task._transitions) task._transitions = []
    task._transitions.push({
      from, to,
      actor: context.actor || 'system',
      reason: context.reason || '',
      at: task.updatedAt,
    })
  }

  return { ok: true, task }
}

module.exports = {
  STATUSES, TRANSITIONS, TERMINAL,
  canTransition, getValidTransitions, isTerminal, isValidStatus,
  normalizeStatus, transition,
}
