'use strict'
/**
 * cost-queries.cjs — 成本记录 DB 查询
 *
 * 替代 autopilot-costs.jsonl 的全文件扫描，
 * 使用索引查询实现毫秒级聚合。
 */
const { getDb } = require('../connection.cjs')

/**
 * 插入一条成本记录
 *
 * @param {{ ts: string, date: string, model: string, inputTokens: number, outputTokens: number, cost: number, source: string, agentId?: string }} entry
 */
function insertCostEntry(entry) {
  const db = getDb()
  db.prepare(`
    INSERT INTO cost_entries (ts, date, model, input_tokens, output_tokens, cost, source, agent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.ts, entry.date, entry.model,
    entry.inputTokens, entry.outputTokens, entry.cost,
    entry.source, entry.agentId || null
  )
}

/**
 * 查询成本记录（替代 JSONL 全文件扫描）
 *
 * @param {Object} [opts]
 * @param {string} [opts.date] - 精确日期 YYYY-MM-DD
 * @param {string} [opts.from] - 起始日期（含）
 * @param {string} [opts.to] - 结束日期（含）
 * @param {string} [opts.source] - 来源过滤
 * @returns {{ entries: Array, totalCost: number, totalInputTokens: number, totalOutputTokens: number }}
 */
function queryCostEntries(opts = {}) {
  const db = getDb()
  const conditions = []
  const params = []

  if (opts.date) {
    conditions.push('date = ?')
    params.push(opts.date)
  }
  if (opts.from) {
    conditions.push('date >= ?')
    params.push(opts.from)
  }
  if (opts.to) {
    conditions.push('date <= ?')
    params.push(opts.to)
  }
  if (opts.source) {
    conditions.push('source = ?')
    params.push(opts.source)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const entries = db.prepare(`
    SELECT ts, date, model, input_tokens AS inputTokens, output_tokens AS outputTokens,
           cost, source, agent_id AS agentId
    FROM cost_entries ${where}
    ORDER BY ts ASC
  `).all(...params)

  // 聚合统计用 SQL 一次算出
  const totals = db.prepare(`
    SELECT COALESCE(SUM(cost), 0) AS totalCost,
           COALESCE(SUM(input_tokens), 0) AS totalInputTokens,
           COALESCE(SUM(output_tokens), 0) AS totalOutputTokens
    FROM cost_entries ${where}
  `).get(...params)

  return {
    entries,
    totalCost: Math.round(totals.totalCost * 1_000_000) / 1_000_000,
    totalInputTokens: totals.totalInputTokens,
    totalOutputTokens: totals.totalOutputTokens,
  }
}

/**
 * 按天+来源聚合成本摘要（替代内存 groupBy）
 *
 * @param {number} [days=7] - 回溯天数
 * @returns {Array<{ date: string, source: string, cost: number, inputTokens: number, outputTokens: number, calls: number }>}
 */
function getDailySummaryFromDb(days = 7) {
  const db = getDb()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const from = cutoff.toISOString().slice(0, 10)

  return db.prepare(`
    SELECT date, source,
           ROUND(SUM(cost), 6) AS cost,
           SUM(input_tokens) AS inputTokens,
           SUM(output_tokens) AS outputTokens,
           COUNT(*) AS calls
    FROM cost_entries
    WHERE date >= ?
    GROUP BY date, source
    ORDER BY date, source
  `).all(from)
}

module.exports = { insertCostEntry, queryCostEntries, getDailySummaryFromDb }
