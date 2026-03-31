'use strict'
/**
 * message-queries.cjs — 消息追踪 DB 查询
 *
 * 记录所有 Agent 通信的 request/response 对，
 * 支持按 agent/类型/通道过滤和分页查询。
 */
const { getDb } = require('../connection.cjs')

/** content 最大存储长度 */
const MAX_CONTENT_LENGTH = 10240

/**
 * 从 sessionKey 推导消息类型
 * @param {string} sessionKey
 * @param {string} [message]
 * @returns {string}
 */
function deriveMessageType(sessionKey, message) {
  const parts = sessionKey.split(':')
  const suffix = parts.slice(2).join(':')
  if (suffix === 'autopilot' || suffix === 'dept-autopilot') return 'directive'
  if (suffix.startsWith('quality-check:')) return 'quality-check'
  if (suffix.startsWith('peer-review:')) return 'peer-review'
  if (suffix.startsWith('approval:')) return 'approval'
  if (message && message.startsWith('[系统查询]')) return 'status-query'
  return 'chat'
}

/**
 * 从 sessionKey 推导 cost source 标签
 * @param {string} agentId
 * @param {string} sessionKey
 * @returns {string}
 */
function deriveSource(agentId, sessionKey) {
  if (sessionKey === 'agent:ceo:autopilot') return 'ceo'
  if (sessionKey.endsWith(':dept-autopilot')) return `dept:${agentId}`
  return agentId
}

/**
 * 插入一条消息记录
 * @param {Object} entry
 */
function insertMessage(entry) {
  const db = getDb()
  db.prepare(`
    INSERT INTO messages (
      ts, agent_id, session_key, message_type, direction, channel,
      content, ok, error, model, input_tokens, output_tokens, total_tokens,
      cost, source, from_agent, pair_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.ts || new Date().toISOString(),
    entry.agentId || 'unknown',
    entry.sessionKey || '',
    entry.messageType || 'chat',
    entry.direction || 'request',
    entry.channel || 'gateway-pool',
    entry.content ? entry.content.slice(0, MAX_CONTENT_LENGTH) : null,
    entry.ok ?? null,
    entry.error || null,
    entry.model || null,
    entry.inputTokens || 0,
    entry.outputTokens || 0,
    entry.totalTokens || 0,
    entry.cost || 0,
    entry.source || null,
    entry.fromAgent || null,
    entry.pairId || null,
  )
}

/**
 * 查询消息（支持过滤 + 分页）
 *
 * @param {Object} [opts]
 * @param {string} [opts.agentId]
 * @param {string} [opts.messageType]
 * @param {string} [opts.channel]
 * @param {string} [opts.direction]
 * @param {string} [opts.from] - 起始时间
 * @param {string} [opts.to] - 结束时间
 * @param {number} [opts.limit=200]
 * @param {number} [opts.offset=0]
 * @returns {{ messages: Array, total: number }}
 */
function queryMessages(opts = {}) {
  const db = getDb()
  const conditions = []
  const params = []

  if (opts.agentId) {
    conditions.push('agent_id = ?')
    params.push(opts.agentId)
  }
  if (opts.messageType) {
    conditions.push('message_type = ?')
    params.push(opts.messageType)
  }
  if (opts.channel) {
    conditions.push('channel = ?')
    params.push(opts.channel)
  }
  if (opts.direction) {
    conditions.push('direction = ?')
    params.push(opts.direction)
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
  const limit = opts.limit || 200
  const offset = opts.offset || 0

  const messages = db.prepare(`
    SELECT id, ts, agent_id AS agentId, session_key AS sessionKey,
           message_type AS messageType, direction, channel,
           content, ok, error, model,
           input_tokens AS inputTokens, output_tokens AS outputTokens,
           total_tokens AS totalTokens, cost, source,
           from_agent AS fromAgent, pair_id AS pairId
    FROM messages ${where}
    ORDER BY ts DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM messages ${where}`).get(...params).cnt

  return { messages, total }
}

/**
 * 获取某个 Agent 的最近消息
 * @param {string} agentId
 * @param {number} [limit=50]
 * @returns {Array}
 */
function getAgentMessages(agentId, limit = 50) {
  const db = getDb()
  return db.prepare(`
    SELECT id, ts, agent_id AS agentId, session_key AS sessionKey,
           message_type AS messageType, direction, channel,
           content, ok, error, model,
           input_tokens AS inputTokens, output_tokens AS outputTokens,
           total_tokens AS totalTokens, cost, source,
           from_agent AS fromAgent, pair_id AS pairId
    FROM messages
    WHERE agent_id = ? OR from_agent = ?
    ORDER BY ts DESC LIMIT ?
  `).all(agentId, agentId, limit)
}

/**
 * 按 pair_id 聚合请求/回复对
 * @param {Object} [opts]
 * @param {string} [opts.agentId]
 * @param {number} [opts.limit=50]
 * @returns {Array<{ request: Object|null, response: Object|null }>}
 */
function getMessagePairs(opts = {}) {
  const db = getDb()
  const conditions = ['pair_id IS NOT NULL']
  const params = []

  if (opts.agentId) {
    conditions.push('agent_id = ?')
    params.push(opts.agentId)
  }

  const limit = opts.limit || 50
  const where = `WHERE ${conditions.join(' AND ')}`

  // 取最近的 pair_id
  const pairIds = db.prepare(`
    SELECT DISTINCT pair_id FROM messages ${where}
    ORDER BY ts DESC LIMIT ?
  `).all(...params, limit).map(r => r.pair_id)

  if (pairIds.length === 0) return []

  const placeholders = pairIds.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT id, ts, agent_id AS agentId, session_key AS sessionKey,
           message_type AS messageType, direction, channel,
           content, ok, error, model,
           input_tokens AS inputTokens, output_tokens AS outputTokens,
           total_tokens AS totalTokens, cost, source,
           from_agent AS fromAgent, pair_id AS pairId
    FROM messages WHERE pair_id IN (${placeholders})
    ORDER BY ts ASC
  `).all(...pairIds)

  // 按 pair_id 分组
  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.pairId)) groups.set(row.pairId, { request: null, response: null })
    const pair = groups.get(row.pairId)
    if (row.direction === 'request') pair.request = row
    else pair.response = row
  }

  return Array.from(groups.values())
}

/**
 * 消息统计（按 agent/type 聚合）
 * @param {Object} [opts]
 * @param {string} [opts.from] - 起始时间
 * @param {string} [opts.to] - 结束时间
 * @returns {{ byAgent: Object, byType: Object, totalCost: number, totalMessages: number }}
 */
function getMessageStats(opts = {}) {
  const db = getDb()
  const conditions = ["direction = 'response'"]
  const params = []

  if (opts.from) { conditions.push('ts >= ?'); params.push(opts.from) }
  if (opts.to) { conditions.push('ts <= ?'); params.push(opts.to) }

  const where = `WHERE ${conditions.join(' AND ')}`

  const byAgent = db.prepare(`
    SELECT agent_id AS agentId, COUNT(*) AS count,
           SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens,
           ROUND(SUM(cost), 6) AS cost
    FROM messages ${where}
    GROUP BY agent_id ORDER BY cost DESC
  `).all(...params)

  const byType = db.prepare(`
    SELECT message_type AS messageType, COUNT(*) AS count,
           SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens,
           ROUND(SUM(cost), 6) AS cost
    FROM messages ${where}
    GROUP BY message_type ORDER BY count DESC
  `).all(...params)

  const totals = db.prepare(`
    SELECT COUNT(*) AS totalMessages, ROUND(COALESCE(SUM(cost), 0), 6) AS totalCost
    FROM messages ${where}
  `).get(...params)

  return { byAgent, byType, ...totals }
}

/**
 * 查询已记录的 worker session keys（用于增量追踪）
 * @param {string} agentId
 * @returns {Set<string>} 已记录过的 session_key 集合
 */
function getTrackedWorkerSessions(agentId) {
  const db = getDb()
  const rows = db.prepare(`
    SELECT DISTINCT session_key FROM messages
    WHERE agent_id = ? AND message_type = 'worker-execution' AND direction = 'response'
  `).all(agentId)
  return new Set(rows.map(r => r.session_key))
}

module.exports = {
  insertMessage, queryMessages, getAgentMessages, getMessagePairs, getMessageStats,
  deriveMessageType, deriveSource, getTrackedWorkerSessions, MAX_CONTENT_LENGTH,
}
