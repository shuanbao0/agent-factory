'use strict'
/**
 * event-queries.cjs — 事件日志 DB 查询
 *
 * 替代 autopilot-events.jsonl 的全文件扫描。
 */
const { getDb } = require('../connection.cjs')

/**
 * 插入一条事件记录
 *
 * @param {{ type: string, ts: string, [key: string]: any }} event
 */
function insertEvent(event) {
  const db = getDb()
  const { type, ts, ...rest } = event
  db.prepare(`
    INSERT INTO events (type, ts, payload) VALUES (?, ?, ?)
  `).run(type, ts, JSON.stringify(rest))
}

/**
 * 查询事件记录
 *
 * @param {Object} [opts]
 * @param {string} [opts.type] - 事件类型过滤
 * @param {string} [opts.from] - 起始时间（含）
 * @param {string} [opts.to] - 结束时间（含）
 * @param {number} [opts.limit=500] - 返回条数限制
 * @returns {Array<{ id: number, type: string, ts: string, payload: Object }>}
 */
function queryEvents(opts = {}) {
  const db = getDb()
  const conditions = []
  const params = []

  if (opts.type) {
    conditions.push('type = ?')
    params.push(opts.type)
  }
  if (opts.from) {
    conditions.push('ts >= ?')
    params.push(opts.from)
  }
  if (opts.to) {
    conditions.push('ts <= ?')
    params.push(opts.to)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = opts.limit || 500

  const rows = db.prepare(`
    SELECT id, type, ts, payload FROM events ${where}
    ORDER BY ts DESC LIMIT ?
  `).all(...params, limit)

  return rows.map(r => ({
    id: r.id,
    type: r.type,
    ts: r.ts,
    ...JSON.parse(r.payload),
  }))
}

module.exports = { insertEvent, queryEvents }
