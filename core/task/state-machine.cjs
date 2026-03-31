'use strict'
/**
 * TaskStateMachine — 任务状态有限状态机
 *
 * 设计模式：State Machine（显式状态转换表）
 *
 * 常量与纯谓词函数来自 entity/task/task.cjs（单一来源）。
 * 本模块保留 transition()（修改 task 对象的业务逻辑）。
 */

const {
  STATUSES, TRANSITIONS, TERMINAL,
  canTransition, getValidTransitions,
  isTerminal, isValidStatus, normalizeStatus,
} = require('../../entity/task/task.cjs')
const logger = require('../common/logger.cjs')

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
    logger.warn('state-machine', 'Invalid transition rejected', { taskId: task.id, from, to })
    return {
      ok: false,
      error: `Invalid transition: ${from} → ${to}`,
      reason: `Allowed: ${getValidTransitions(from).join(', ') || 'none (terminal)'}`,
    }
  }

  task.status = to
  task.updatedAt = new Date().toISOString()

  // 完成时记录完成时间
  if (to === 'completed') {
    task.completedAt = new Date().toISOString()
    delete task.failureReason
  }
  // 失败时记录失败原因
  if (to === 'failed' && context.reason) task.failureReason = context.reason
  // 合并额外字段
  if (context.extras) Object.assign(task, context.extras)

  // 记录转换历史到 DB
  try {
    const { insertTransition } = require('../db/queries/task-queries.cjs')
    insertTransition({
      taskId: task.id,
      from, to,
      actor: context.actor || 'system',
      reason: context.reason || '',
      at: task.updatedAt,
    })
  } catch (err) {
    logger.debug('state-machine', 'Transition DB insert failed (non-fatal)', { taskId: task.id, error: err.message })
  }

  logger.info('state-machine', 'Task transition', { taskId: task.id, from, to, actor: context?.actor, reason: context?.reason })
  return { ok: true, task }
}

module.exports = {
  STATUSES, TRANSITIONS, TERMINAL,
  canTransition, getValidTransitions, isTerminal, isValidStatus,
  normalizeStatus, transition,
}
