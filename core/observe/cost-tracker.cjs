'use strict'
/**
 * CostTracker — Token 消耗 → USD 成本计算与追踪
 *
 * 设计模式：Repository（SQLite 持久化）+ Calculation Engine
 *
 * 职责：
 * - calculateCost()：将模型 + Token 用量换算为 USD 成本
 * - trackCost()：插入一条成本记录到 DB cost_entries 表
 * - queryCosts()：按日期/来源查询成本记录（索引查询）
 * - getDailySummary()：按天+来源聚合成本（SQL GROUP BY）
 *
 * 设计决策：
 * - 使用 SQLite 替代 JSONL，支持索引查询和聚合统计
 * - 成本追踪失败静默降级，绝不阻断 Autopilot 主流程
 * - 追踪后通过 EventBus 发射 cost.tracked 事件，触发 CostAlertReactor
 */
const logger = require('../common/logger.cjs')
const { insertCostEntry, queryCostEntries, getDailySummaryFromDb } = require('../db/queries/cost-queries.cjs')

/** 模型定价表（来自 entity/observe — 单一来源） */
const { PRICING } = require('../../entity/observe/cost.cjs')

/**
 * 计算单次 API 调用的 USD 成本
 *
 * 匹配优先级：精确匹配 → 子串匹配 → 回退到 sonnet 定价
 *
 * @param {string} model - 模型 ID
 * @param {{ inputTokens: number, outputTokens: number }} usage - Token 用量
 * @returns {number} USD 成本
 */
function calculateCost(model, usage) {
  if (!usage) return 0
  let pricing = PRICING[model]
  if (!pricing) {
    const key = Object.keys(PRICING).find(k => model?.includes(k))
    pricing = key ? PRICING[key] : PRICING['claude-sonnet-4-6']
  }
  const inputCost = (usage.inputTokens || 0) * pricing.input / 1_000_000
  const outputCost = (usage.outputTokens || 0) * pricing.output / 1_000_000
  return inputCost + outputCost
}

/**
 * 追踪一次 API 调用的成本
 *
 * 插入一条记录到 DB cost_entries 表，然后通过 EventBus 发射事件
 *
 * @param {Object} opts
 * @param {string} opts.model - 模型 ID
 * @param {{ inputTokens: number, outputTokens: number }} opts.usage - Token 用量
 * @param {string} [opts.source] - 来源标识（如 'dept:novel', 'ceo'）
 * @param {string} [opts.agentId] - 产生费用的 Agent ID
 */
function trackCost({ model, usage, source, agentId }) {
  if (!usage) return

  const cost = calculateCost(model, usage)
  const entry = {
    ts: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
    model: model || 'unknown',
    inputTokens: usage.inputTokens || 0,
    outputTokens: usage.outputTokens || 0,
    cost: Math.round(cost * 1_000_000) / 1_000_000,
    source: source || 'unknown',
    agentId: agentId || undefined,
  }

  // 写入 DB（静默失败）
  try {
    insertCostEntry(entry)
    logger.debug('cost-tracker', 'Cost recorded', { model: entry.model, inputTokens: entry.inputTokens, outputTokens: entry.outputTokens, cost: entry.cost })
  } catch (err) {
    logger.error('cost-tracker', 'Cost DB insert failed', { error: err.message })
  }

  // 发射成本事件（懒加载 event-bus，避免循环依赖）
  try {
    const { eventBus } = require('./event-bus.cjs')
    eventBus.fire('cost.tracked', { model: entry.model, cost: entry.cost, source: entry.source })
  } catch {
    logger.debug('cost-tracker', 'Event bus unavailable for cost event')
  }
}

/**
 * 查询成本记录
 *
 * @param {Object} [opts]
 * @param {string} [opts.date] - 精确日期（YYYY-MM-DD）
 * @param {string} [opts.from] - 起始日期（含）
 * @param {string} [opts.to] - 结束日期（含）
 * @param {string} [opts.source] - 按来源过滤
 * @returns {{ entries: Array, totalCost: number, totalInputTokens: number, totalOutputTokens: number }}
 */
function queryCosts(opts = {}) {
  try {
    return queryCostEntries(opts)
  } catch (err) {
    logger.error('cost-tracker', 'Cost query failed', { error: err.message })
    return { entries: [], totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0 }
  }
}

/**
 * 获取按天+来源聚合的成本摘要
 *
 * @param {number} [days=7] - 回溯天数
 * @returns {Array<{ date: string, source: string, cost: number, inputTokens: number, outputTokens: number, calls: number }>}
 */
function getDailySummary(days = 7) {
  try {
    return getDailySummaryFromDb(days)
  } catch (err) {
    logger.error('cost-tracker', 'Daily summary query failed', { error: err.message })
    return []
  }
}

module.exports = { calculateCost, trackCost, queryCosts, getDailySummary, PRICING }
