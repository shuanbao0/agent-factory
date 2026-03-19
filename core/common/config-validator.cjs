'use strict'
/**
 * ConfigValidator — 配置文件结构化校验
 *
 * 设计模式：Validation / Guard Clause
 *
 * 职责：
 * - 校验 budget.json 的结构和业务规则
 * - 校验 openclaw.json 的结构完整性
 * - 返回 { valid, errors[] } 格式，方便 API 返回具体错误信息
 */

/**
 * 校验预算配置对象（budget.json）
 *
 * 检查项：
 * - config 必须为非空对象
 * - company.dailyTokenLimit / monthlyTokenLimit 必须为非负数
 * - company.alertThreshold 必须在 0~1 之间
 * - dailyTokenLimit 不应超过 monthlyTokenLimit
 * - agentDailyLimit 必须为非负数
 * - overBudgetAction 必须为合法枚举值
 *
 * @param {unknown} config - 待校验的配置对象
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateBudgetConfig(config) {
  const errors = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a non-null object'] }
  }

  // ── company 部分 ──
  if (!config.company || typeof config.company !== 'object') {
    errors.push('Missing or invalid "company" section')
  } else {
    const { dailyTokenLimit, monthlyTokenLimit, alertThreshold } = config.company

    if (dailyTokenLimit !== undefined) {
      if (typeof dailyTokenLimit !== 'number' || dailyTokenLimit < 0) {
        errors.push('company.dailyTokenLimit must be a non-negative number')
      }
    }
    if (monthlyTokenLimit !== undefined) {
      if (typeof monthlyTokenLimit !== 'number' || monthlyTokenLimit < 0) {
        errors.push('company.monthlyTokenLimit must be a non-negative number')
      }
    }
    if (alertThreshold !== undefined) {
      if (typeof alertThreshold !== 'number' || alertThreshold < 0 || alertThreshold > 1) {
        errors.push('company.alertThreshold must be a number between 0 and 1')
      }
    }
    // 逻辑校验：日限额不应超过月限额
    if (dailyTokenLimit && monthlyTokenLimit && dailyTokenLimit > monthlyTokenLimit) {
      errors.push('company.dailyTokenLimit should not exceed monthlyTokenLimit')
    }
  }

  // ── agentDailyLimit ──
  if (config.agentDailyLimit !== undefined) {
    if (typeof config.agentDailyLimit !== 'number' || config.agentDailyLimit < 0) {
      errors.push('agentDailyLimit must be a non-negative number')
    }
  }

  // ── overBudgetAction 枚举校验 ──
  const validActions = ['pause_and_notify', 'notify_only', 'hard_stop']
  if (config.overBudgetAction !== undefined) {
    if (!validActions.includes(config.overBudgetAction)) {
      errors.push(`overBudgetAction must be one of: ${validActions.join(', ')}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 校验 OpenClaw 配置对象（openclaw.json）
 *
 * 检查项：
 * - config 必须为非空对象
 * - port 必须在 1~65535 范围内
 * - agents 必须为数组，每个元素需有 id 和 workspace 字段
 *
 * @param {unknown} config - 待校验的配置对象
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateOpenclawConfig(config) {
  const errors = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a non-null object'] }
  }

  // ── 端口校验 ──
  if (config.port !== undefined) {
    if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
      errors.push('port must be a number between 1 and 65535')
    }
  }

  // ── Agent 列表校验 ──
  if (config.agents !== undefined) {
    if (!Array.isArray(config.agents)) {
      errors.push('agents must be an array')
    } else {
      for (let i = 0; i < config.agents.length; i++) {
        const agent = config.agents[i]
        if (!agent.id || typeof agent.id !== 'string') {
          errors.push(`agents[${i}].id must be a non-empty string`)
        }
        if (!agent.workspace || typeof agent.workspace !== 'string') {
          errors.push(`agents[${i}].workspace must be a non-empty string`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

module.exports = { validateBudgetConfig, validateOpenclawConfig }
