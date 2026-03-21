'use strict'
/**
 * CostTracker — Token 消耗 → USD 成本计算与追踪
 *
 * 设计模式：Repository（JSONL 追加日志）+ Calculation Engine
 *
 * 职责：
 * - calculateCost()：将模型 + Token 用量换算为 USD 成本
 * - trackCost()：追加一条成本记录到 config/autopilot-costs.jsonl（append-only 审计日志）
 * - queryCosts()：按日期/来源查询成本记录
 * - getDailySummary()：按天+来源聚合成本（供图表展示）
 *
 * 设计决策：
 * - 使用 JSONL（每行一条 JSON）而非 JSON 数组，支持并发追加，不需要读-改-写
 * - 成本追踪失败静默降级（console.error），绝不阻断 Autopilot 主流程
 * - 追踪后会通过 EventBus 发射 cost.tracked 事件，触发 CostAlertReactor
 */
const { existsSync, appendFileSync, readFileSync, mkdirSync } = require('fs')
const { dirname } = require('path')
const { COSTS_FILE } = require('../common/paths.cjs')

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
  // 先精确匹配，再子串匹配，最后回退到 sonnet 定价
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
 * 追加一行 JSON 到 autopilot-costs.jsonl，然后通过 EventBus 发射事件
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
    date: new Date().toISOString().slice(0, 10),   // YYYY-MM-DD
    model: model || 'unknown',
    inputTokens: usage.inputTokens || 0,
    outputTokens: usage.outputTokens || 0,
    cost: Math.round(cost * 1_000_000) / 1_000_000, // 保留 6 位小数
    source: source || 'unknown',
    agentId: agentId || undefined,
  }

  // 追加到 JSONL 文件（静默失败）
  try {
    const dir = dirname(COSTS_FILE)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(COSTS_FILE, JSON.stringify(entry) + '\n')
  } catch (err) {
    console.error(`[cost-tracker] Failed to write cost entry: ${err.message}`)
  }

  // 发射成本事件（懒加载 event-bus，避免循环依赖）
  try {
    const { eventBus } = require('./event-bus.cjs')
    eventBus.fire('cost.tracked', { model: entry.model, cost: entry.cost, source: entry.source })
  } catch {}
}

/**
 * 查询成本记录
 *
 * 支持按日期范围和来源过滤，返回匹配的记录及汇总统计
 *
 * @param {Object} [opts]
 * @param {string} [opts.date] - 精确日期（YYYY-MM-DD）
 * @param {string} [opts.from] - 起始日期（含）
 * @param {string} [opts.to] - 结束日期（含）
 * @param {string} [opts.source] - 按来源过滤
 * @returns {{ entries: Array, totalCost: number, totalInputTokens: number, totalOutputTokens: number }}
 */
function queryCosts(opts = {}) {
  if (!existsSync(COSTS_FILE)) {
    return { entries: [], totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0 }
  }

  try {
    const lines = readFileSync(COSTS_FILE, 'utf-8').split('\n').filter(Boolean)
    let entries = lines.map(line => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)

    // 应用过滤条件
    if (opts.date) {
      entries = entries.filter(e => e.date === opts.date)
    }
    if (opts.from) {
      entries = entries.filter(e => e.date >= opts.from)
    }
    if (opts.to) {
      entries = entries.filter(e => e.date <= opts.to)
    }
    if (opts.source) {
      entries = entries.filter(e => e.source === opts.source)
    }

    // 汇总统计
    const totalCost = entries.reduce((sum, e) => sum + (e.cost || 0), 0)
    const totalInputTokens = entries.reduce((sum, e) => sum + (e.inputTokens || 0), 0)
    const totalOutputTokens = entries.reduce((sum, e) => sum + (e.outputTokens || 0), 0)

    return {
      entries,
      totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
      totalInputTokens,
      totalOutputTokens,
    }
  } catch (err) {
    return { entries: [], totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, error: err.message }
  }
}

/**
 * 获取按天+来源聚合的成本摘要
 *
 * @param {number} [days=7] - 回溯天数
 * @returns {Array<{ date: string, source: string, cost: number, inputTokens: number, outputTokens: number, calls: number }>}
 */
function getDailySummary(days = 7) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const from = cutoff.toISOString().slice(0, 10)

  const { entries } = queryCosts({ from })
  /** @type {Record<string, {date, source, cost, inputTokens, outputTokens, calls}>} */
  const byKey = {}

  for (const e of entries) {
    const key = `${e.date}:${e.source || 'unknown'}`
    if (!byKey[key]) {
      byKey[key] = { date: e.date, source: e.source || 'unknown', cost: 0, inputTokens: 0, outputTokens: 0, calls: 0 }
    }
    byKey[key].cost += e.cost || 0
    byKey[key].inputTokens += e.inputTokens || 0
    byKey[key].outputTokens += e.outputTokens || 0
    byKey[key].calls++
  }

  // 按日期+来源排序
  return Object.values(byKey).sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source))
}

module.exports = { calculateCost, trackCost, queryCosts, getDailySummary, PRICING, COSTS_FILE }
