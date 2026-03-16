'use strict'
/**
 * Config Validator — validate budget.json and openclaw.json structures.
 *
 * Returns { valid: boolean, errors: string[] } for each config type.
 */

/**
 * Validate a budget configuration object.
 *
 * @param {unknown} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateBudgetConfig(config) {
  const errors = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a non-null object'] }
  }

  // company section
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
    if (dailyTokenLimit && monthlyTokenLimit && dailyTokenLimit > monthlyTokenLimit) {
      errors.push('company.dailyTokenLimit should not exceed monthlyTokenLimit')
    }
  }

  // agentDailyLimit
  if (config.agentDailyLimit !== undefined) {
    if (typeof config.agentDailyLimit !== 'number' || config.agentDailyLimit < 0) {
      errors.push('agentDailyLimit must be a non-negative number')
    }
  }

  // overBudgetAction
  const validActions = ['pause_and_notify', 'notify_only', 'hard_stop']
  if (config.overBudgetAction !== undefined) {
    if (!validActions.includes(config.overBudgetAction)) {
      errors.push(`overBudgetAction must be one of: ${validActions.join(', ')}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate an openclaw.json configuration object.
 *
 * @param {unknown} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateOpenclawConfig(config) {
  const errors = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a non-null object'] }
  }

  // Port
  if (config.port !== undefined) {
    if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
      errors.push('port must be a number between 1 and 65535')
    }
  }

  // Agents array
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
