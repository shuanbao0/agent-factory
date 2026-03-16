'use strict'
/**
 * Cost Tracker — token → USD conversion and daily cost aggregation.
 *
 * Stores daily cost entries in config/autopilot-costs.jsonl (append-only).
 * Provides query functions for the /api/costs endpoint.
 */
const { existsSync, appendFileSync, readFileSync, mkdirSync } = require('fs')
const { join, dirname } = require('path')

const CONFIG_DIR = join(require('path').resolve(__dirname, '..', '..'), 'config')
const COSTS_FILE = join(CONFIG_DIR, 'autopilot-costs.jsonl')

/**
 * Pricing per 1M tokens (USD).
 * Updated 2026-03-15.  Add new models as needed.
 */
const PRICING = {
  'claude-sonnet-4-6':   { input: 3.0,  output: 15.0 },
  'claude-opus-4-6':     { input: 15.0, output: 75.0 },
  'claude-haiku-4-5':    { input: 0.80, output: 4.0 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
  'MiniMax-M2.5':        { input: 0.0,  output: 0.0 },
  'MiniMax-M2.1':        { input: 0.0,  output: 0.0 },
}

/**
 * Calculate cost in USD for a single API call.
 *
 * @param {string} model - Model ID
 * @param {{ inputTokens: number, outputTokens: number }} usage
 * @returns {number} Cost in USD
 */
function calculateCost(model, usage) {
  if (!usage) return 0
  // Try exact match first, then prefix match
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
 * Track a single API call's cost.  Appends a JSONL line to the costs file.
 *
 * @param {Object} opts
 * @param {string} opts.model        - Model ID
 * @param {{ inputTokens: number, outputTokens: number }} opts.usage
 * @param {string} [opts.source]     - Source identifier (e.g. 'dept:novel', 'ceo')
 * @param {string} [opts.agentId]    - Agent that incurred the cost
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
    cost: Math.round(cost * 1_000_000) / 1_000_000, // 6 decimal places
    source: source || 'unknown',
    agentId: agentId || undefined,
  }

  try {
    const dir = dirname(COSTS_FILE)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(COSTS_FILE, JSON.stringify(entry) + '\n')
  } catch (err) {
    // Silently fail — cost tracking should never break the main flow
    console.error(`[cost-tracker] Failed to write cost entry: ${err.message}`)
  }

  // Emit cost event (lazy-require to avoid circular dependency)
  try {
    const { eventBus } = require('./event-bus.cjs')
    eventBus.fire('cost.tracked', { model: entry.model, cost: entry.cost, source: entry.source })
  } catch {}
}

/**
 * Query cost entries for a given period.
 *
 * @param {Object} [opts]
 * @param {string} [opts.date]    - Specific date (YYYY-MM-DD)
 * @param {string} [opts.from]    - Start date (inclusive)
 * @param {string} [opts.to]      - End date (inclusive)
 * @param {string} [opts.source]  - Filter by source
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

    // Apply filters
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
 * Get daily summary (aggregated by date and source).
 *
 * @param {number} [days=7] - Number of days to look back
 * @returns {Array<{ date: string, source: string, cost: number, inputTokens: number, outputTokens: number, calls: number }>}
 */
function getDailySummary(days = 7) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const from = cutoff.toISOString().slice(0, 10)

  const { entries } = queryCosts({ from })
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

  return Object.values(byKey).sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source))
}

module.exports = { calculateCost, trackCost, queryCosts, getDailySummary, PRICING, COSTS_FILE }
