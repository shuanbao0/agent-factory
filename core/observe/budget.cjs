'use strict'
/**
 * Budget — token 用量追踪与每日限额管理
 *
 * 设计模式：Repository + Observer
 */
const { readFileSync, writeFileSync, renameSync, existsSync, readdirSync } = require('fs')
const { BUDGET_FILE, DEPARTMENTS_DIR, CONFIG_DIR } = require('../common/paths.cjs')

const logger = require('../common/logger.cjs')

// Lazy require to avoid circular dependencies
let _deptConfigRepo, _deptStateRepo
function getDeptConfigRepo() {
  if (!_deptConfigRepo) _deptConfigRepo = require('../repo/dept-config.cjs').deptConfigRepo
  return _deptConfigRepo
}
function getDeptStateRepo() {
  if (!_deptStateRepo) _deptStateRepo = require('../repo/dept-state.cjs').deptStateRepo
  return _deptStateRepo
}

/**
 * Load company-level budget config.
 */
const { DEFAULT_BUDGET } = require('../../entity/observe/budget.cjs')

function loadCompanyBudget() {
  if (!existsSync(BUDGET_FILE)) return { ...DEFAULT_BUDGET }
  try {
    return JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'))
  } catch {
    return { ...DEFAULT_BUDGET }
  }
}

/**
 * Check if we need to reset the daily budget counter.
 */
function shouldResetDaily(lastResetAt) {
  if (!lastResetAt) return true
  const lastReset = new Date(lastResetAt)
  const now = new Date()
  return lastReset.toDateString() !== now.toDateString()
}

/**
 * Check if a department is within budget.
 * @param {string} deptId
 * @returns {{allowed: boolean, warning?: boolean, reason?: string, ratio: number}}
 */
function checkBudget(deptId) {
  const config = getDeptConfigRepo().load(deptId)
  if (!config || !config.budget || !config.budget.dailyTokenLimit) {
    return { allowed: true, ratio: 0 }
  }

  const state = getDeptStateRepo().load(deptId)

  if (shouldResetDaily(state.budgetResetAt)) {
    logger.info('budget', 'Budget daily reset', { deptId })
    state.tokensUsedToday = 0
    state.budgetResetAt = new Date().toISOString()
    getDeptStateRepo().save(deptId, state)
  }

  const ratio = state.tokensUsedToday / config.budget.dailyTokenLimit
  const threshold = config.budget.alertThreshold || 0.8

  if (ratio >= 1.0) {
    logger.warn('budget', 'Budget exceeded', { deptId, used: state.tokensUsedToday, limit: config.budget.dailyTokenLimit })
    // Emit budget blocked event (fire-and-forget)
    try {
      const { eventBus } = require('./event-bus.cjs')
      eventBus.fire('budget.dept_blocked', { deptId, reason: 'daily budget exceeded', ratio })
    } catch { /* event bus not available */ }
    return { allowed: false, reason: 'daily budget exceeded', ratio }
  }
  if (ratio >= threshold) {
    logger.warn('budget', 'Budget threshold reached', { deptId, ratio })
    // Emit budget warning event (fire-and-forget)
    try {
      const { eventBus } = require('./event-bus.cjs')
      eventBus.fire('budget.dept_warning', { deptId, ratio, threshold })
    } catch { /* event bus not available */ }
    return { allowed: true, warning: true, ratio }
  }
  return { allowed: true, ratio }
}

/**
 * Track token usage for a department after a cycle.
 * @param {string} deptId
 * @param {object} usage - { totalTokens, ... }
 */
function trackTokenUsage(deptId, usage) {
  const state = getDeptStateRepo().load(deptId)
  const tokens = usage?.totalTokens || usage?.total_tokens || 0
  state.tokensUsedToday = (state.tokensUsedToday || 0) + tokens
  getDeptStateRepo().save(deptId, state)
}

/**
 * Get budget summary across all departments.
 */
function getBudgetSummary() {
  const companyBudget = loadCompanyBudget()
  const departments = {}
  let totalUsed = 0

  if (existsSync(DEPARTMENTS_DIR)) {
    try {
      const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const dir of dirs) {
        const config = getDeptConfigRepo().load(dir.name)
        const state = getDeptStateRepo().load(dir.name)
        const limit = config?.budget?.dailyTokenLimit || 0
        const used = state.tokensUsedToday || 0
        departments[dir.name] = { limit, used, ratio: limit > 0 ? used / limit : 0 }
        totalUsed += used
      }
    } catch { /* skip */ }
  }

  return {
    company: {
      dailyLimit: companyBudget.company?.dailyTokenLimit || 0,
      used: totalUsed,
      ratio: companyBudget.company?.dailyTokenLimit
        ? totalUsed / companyBudget.company.dailyTokenLimit
        : 0,
    },
    departments,
  }
}

/**
 * Save company-level budget config (atomic write).
 * @param {object} config - Budget config object
 */
function saveCompanyBudget(config) {
  if (!existsSync(CONFIG_DIR)) { const { mkdirSync } = require('fs'); mkdirSync(CONFIG_DIR, { recursive: true }) }
  const json = JSON.stringify(config, null, 2) + '\n'
  const tmp = BUDGET_FILE + '.tmp.' + process.pid
  writeFileSync(tmp, json)
  renameSync(tmp, BUDGET_FILE)
}

/**
 * Estimate tokens per cycle based on historical average.
 * @param {string} deptId
 * @returns {number}
 */
function estimateTokensPerCycle(deptId) {
  const state = getDeptStateRepo().load(deptId)
  if (state.cycleCount > 0 && state.tokensUsedToday > 0) {
    return Math.ceil(state.tokensUsedToday / state.cycleCount)
  }
  return 5000
}

/**
 * Reserve budget tokens before sending LLM request.
 * @param {string} deptId
 * @param {number} tokens
 * @returns {{reserved: number, blocked?: boolean, reason?: string}}
 */
function reserveBudget(deptId, tokens) {
  const config = getDeptConfigRepo().load(deptId)
  if (!config?.budget?.dailyTokenLimit) return { reserved: 0 }
  const state = getDeptStateRepo().load(deptId)
  const projected = (state.tokensUsedToday || 0) + tokens
  if (projected > config.budget.dailyTokenLimit) {
    return { reserved: 0, blocked: true, reason: `预扣后将超出限额 (${projected}/${config.budget.dailyTokenLimit})` }
  }
  state.tokensUsedToday = projected
  getDeptStateRepo().save(deptId, state)
  return { reserved: tokens }
}

/**
 * Reconcile budget: replace reserved amount with actual usage.
 * @param {string} deptId
 * @param {number} reserved
 * @param {number} actual
 */
function reconcileBudget(deptId, reserved, actual) {
  const state = getDeptStateRepo().load(deptId)
  state.tokensUsedToday = (state.tokensUsedToday || 0) - reserved + actual
  getDeptStateRepo().save(deptId, state)
}

module.exports = { checkBudget, trackTokenUsage, loadCompanyBudget, saveCompanyBudget, getBudgetSummary, shouldResetDaily, estimateTokensPerCycle, reserveBudget, reconcileBudget }
