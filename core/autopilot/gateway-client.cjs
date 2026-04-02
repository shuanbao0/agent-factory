/**
 * Gateway Client — WebSocket communication with agents
 *
 * 设计模式：Decorator（拦截器）
 *
 * sendToAgent 自动记录所有消息到 messages 表 + cost_entries 表，
 * 无需在每个调用点手动 trackCost()。
 *
 * Uses GatewayConnectionPool for persistent connection reuse.
 */
const { randomUUID } = require('crypto')
const { DEFAULT_AGENT_TIMEOUT_MS, DEFAULT_COMPACT_TIMEOUT_MS } = require('./constants.cjs')
const { GatewayConnectionPool } = require('../llm/gateway-pool.cjs')
const { missionRepo } = require('../repo/mission.cjs')
const logger = require('../common/logger.cjs')

// Lazy singleton pool
let _pool = null

function getPool() {
  if (!_pool) {
    _pool = new GatewayConnectionPool()
    _pool.setLogger(logger)
    _pool.setMemoryReader((agentId) => missionRepo.readMemorySummary(agentId))
  }
  return _pool
}

// Lazy requires to avoid circular deps
let _insertMessage, _insertCostEntry, _calculateCost
function getMessageInsert() {
  if (!_insertMessage) _insertMessage = require('../db/queries/message-queries.cjs').insertMessage
  return _insertMessage
}
function getCostInsert() {
  if (!_insertCostEntry) _insertCostEntry = require('../db/queries/cost-queries.cjs').insertCostEntry
  return _insertCostEntry
}
function getCalcCost() {
  if (!_calculateCost) _calculateCost = require('../observe/cost-tracker.cjs').calculateCost
  return _calculateCost
}

const { deriveMessageType, deriveSource } = require('../db/queries/message-queries.cjs')
const USAGE_FALLBACK_TIMEOUT_MS = 15000
const SESSIONS_LIST_LIMIT = 200

function _toNumber(value) {
  return (typeof value === 'number' && Number.isFinite(value)) ? value : 0
}

function _normalizeUsage(rawUsage, modelHint) {
  const usage = (rawUsage && typeof rawUsage === 'object') ? rawUsage : {}
  const inputTokens = _toNumber(usage.input ?? usage.inputTokens ?? usage.input_tokens)
  const outputTokens = _toNumber(usage.output ?? usage.outputTokens ?? usage.output_tokens)
  const cacheRead = _toNumber(usage.cacheRead ?? usage.cache_read ?? usage.cache_read_input_tokens)
  const cacheWrite = _toNumber(usage.cacheWrite ?? usage.cache_write ?? usage.cache_creation_input_tokens)
  const totalFromPayload = _toNumber(usage.totalTokens ?? usage.total ?? usage.total_tokens)
  const totalTokens = totalFromPayload || (inputTokens + outputTokens + cacheRead + cacheWrite)
  const model = (typeof usage.model === 'string' && usage.model.trim()) ? usage.model : (modelHint || 'unknown')
  const nestedCost = (usage.cost && typeof usage.cost === 'object')
    ? _toNumber(usage.cost.total ?? usage.cost.usd ?? usage.cost.value)
    : 0
  const flatCost = _toNumber(usage.cost)
  const costUsd = nestedCost || flatCost
  const hasUsage = totalTokens > 0 || inputTokens > 0 || outputTokens > 0 || costUsd > 0

  return { inputTokens, outputTokens, totalTokens, model, costUsd, hasUsage }
}

function _extractUsageFromSessionMessages(messages) {
  if (!Array.isArray(messages)) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.role !== 'assistant') continue
    const normalized = _normalizeUsage(msg.usage, msg.model)
    if (normalized.hasUsage) return normalized
  }
  return null
}

async function _fetchUsageFromSessionsGet(sessionKey) {
  try {
    const res = await getPool().sendCommand('sessions.get', { key: sessionKey }, USAGE_FALLBACK_TIMEOUT_MS)
    if (!res.ok) return null
    return _extractUsageFromSessionMessages(res.payload?.messages)
  } catch (err) {
    logger.debug('gateway-client', 'sessions.get usage fallback failed', { sessionKey, error: err.message })
    return null
  }
}

async function _fetchUsageFromSessionsList(sessionKey) {
  try {
    const res = await getPool().sendCommand('sessions.list', { limit: SESSIONS_LIST_LIMIT }, USAGE_FALLBACK_TIMEOUT_MS)
    if (!res.ok) return null
    const sessions = Array.isArray(res.payload?.sessions) ? res.payload.sessions : []
    const session = sessions.find(s => s && s.key === sessionKey)
    if (!session) return null
    const inputTokens = _toNumber(session.inputTokens)
    const outputTokens = _toNumber(session.outputTokens)
    const totalTokens = _toNumber(session.totalTokens) || (inputTokens + outputTokens)
    const costUsd = _toNumber(session.estimatedCostUsd)
    if (totalTokens <= 0 && inputTokens <= 0 && outputTokens <= 0 && costUsd <= 0) return null
    const model = (typeof session.model === 'string' && session.model.trim()) ? session.model : 'unknown'
    return { inputTokens, outputTokens, totalTokens, model, costUsd, hasUsage: true }
  } catch (err) {
    logger.debug('gateway-client', 'sessions.list usage fallback failed', { sessionKey, error: err.message })
    return null
  }
}

async function _resolveUsage(result, sessionKey) {
  const direct = _normalizeUsage(result.usage, result.model)
  if (direct.hasUsage || !result.ok) return direct

  const fromSession = await _fetchUsageFromSessionsGet(sessionKey)
  if (fromSession) return fromSession

  const fromList = await _fetchUsageFromSessionsList(sessionKey)
  if (fromList) return fromList

  return direct
}

/**
 * Send a message to any agent via the connection pool.
 * Automatically records message pairs and cost to DB (fire-and-forget).
 *
 * @param {string} agentId - The agent to talk to
 * @param {string} sessionKey - Session key (e.g. 'agent:ceo:autopilot')
 * @param {string} message - The directive/message text
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{ok: boolean, text?: string, error?: string, usage?: object, aborted?: boolean}>}
 */
function sendToAgent(agentId, sessionKey, message, timeoutMs = DEFAULT_AGENT_TIMEOUT_MS) {
  const pairId = randomUUID()
  const messageType = deriveMessageType(sessionKey, message)

  // 记录 request（fire-and-forget）
  try {
    getMessageInsert()({
      ts: new Date().toISOString(),
      agentId, sessionKey, messageType,
      direction: 'request',
      channel: 'gateway-pool',
      content: message.slice(0, 10240),
      pairId,
    })
  } catch (err) {
    logger.debug('gateway-client', 'Message insert (request) failed', { error: err.message })
  }

  // 调用实际 pool 方法，返回后记录 response + cost
  return getPool().sendToAgent(agentId, sessionKey, message, timeoutMs).then(result => {
    // Keep DB/cost tracking off the critical path.
    Promise.resolve().then(async () => {
      try {
        const usage = await _resolveUsage(result, sessionKey)
        const inputTokens = usage.inputTokens
        const outputTokens = usage.outputTokens
        const model = result.model || usage.model || 'unknown'
        const computedCost = getCalcCost()(model, { inputTokens, outputTokens })
        const rawCost = usage.costUsd > 0 ? usage.costUsd : computedCost
        const roundedCost = Math.round(rawCost * 1_000_000) / 1_000_000
        const source = deriveSource(agentId, sessionKey)

        // 记录 response 消息
        getMessageInsert()({
          ts: new Date().toISOString(),
          agentId, sessionKey, messageType,
          direction: 'response',
          channel: 'gateway-pool',
          content: (result.text || result.error || '').slice(0, 10240),
          ok: result.ok ? 1 : 0,
          error: result.error || null,
          model, inputTokens, outputTokens,
          totalTokens: usage.totalTokens || (inputTokens + outputTokens),
          cost: roundedCost,
          source, pairId,
        })

        // 记录 cost（替代各处的 trackCost 调用）
        if (inputTokens > 0 || outputTokens > 0 || roundedCost > 0) {
          getCostInsert()({
            ts: new Date().toISOString(),
            date: new Date().toISOString().slice(0, 10),
            model, inputTokens, outputTokens,
            cost: roundedCost,
            source, agentId,
          })

          // 发射 cost.tracked 事件
          try {
            const { eventBus } = require('../observe/event-bus.cjs')
            eventBus.fire('cost.tracked', { model, cost: roundedCost, source })
          } catch { /* event bus not available */ }
        }
      } catch (err) {
        logger.debug('gateway-client', 'Message/cost insert (response) failed', { error: err.message })
      }
    })

    return result  // 原样返回，不影响主流程
  })
}

/**
 * Convenience: send to CEO (backward compat)
 */
function sendToCeo(message, timeoutMs = DEFAULT_AGENT_TIMEOUT_MS) {
  return sendToAgent('ceo', 'agent:ceo:autopilot', message, timeoutMs)
}

/**
 * Compact a session via Gateway.
 */
function compactSession(sessionKey, timeoutMs = DEFAULT_COMPACT_TIMEOUT_MS) {
  return getPool().sendCommand('sessions.compact', { key: sessionKey }, timeoutMs)
}

/**
 * Reset a session via Gateway (keep session entry, clear context).
 */
function resetSession(sessionKey, timeoutMs = DEFAULT_COMPACT_TIMEOUT_MS) {
  return getPool().sendCommand('sessions.reset', { key: sessionKey }, timeoutMs)
}

/**
 * Delete a session via Gateway (remove session entry).
 */
function deleteSession(sessionKey, timeoutMs = DEFAULT_COMPACT_TIMEOUT_MS) {
  return getPool().sendCommand('sessions.delete', { key: sessionKey, deleteTranscript: false }, timeoutMs)
}

/**
 * Backward compatibility: existing callers expect killSession to reset context.
 */
function killSession(sessionKey, timeoutMs = DEFAULT_COMPACT_TIMEOUT_MS) {
  return resetSession(sessionKey, timeoutMs)
}

/**
 * Parse a status response from an agent.
 */
function parseStatusResponse(text) {
  if (!text) return { timeout: true }
  const subagentMatch = text.match(/SUBAGENT:\s*(\S+)/i)
  if (/status:\s*working/i.test(text))
    return { working: true, subagentRunId: subagentMatch?.[1] || null }
  if (/status:\s*completed/i.test(text))
    return { completed: true }
  if (/status:\s*idle/i.test(text))
    return { idle: true }
  return { idle: true }
}

/**
 * Query an agent's current task status via the chat session.
 */
async function queryAgentStatus(agentId, sessionKey, timeoutMs) {
  try {
    const result = await sendToAgent(agentId, sessionKey, '[系统查询] 当前任务状态？', timeoutMs)
    if (!result.ok) return { timeout: true }
    return parseStatusResponse(result.text)
  } catch {
    return { timeout: true }
  }
}

/**
 * Close the connection pool (for graceful shutdown).
 */
function closePool() {
  if (_pool) {
    _pool.close()
    _pool = null
  }
}

module.exports = {
  sendToAgent,
  sendToCeo,
  compactSession,
  resetSession,
  deleteSession,
  killSession,
  parseStatusResponse,
  queryAgentStatus,
  closePool,
}
