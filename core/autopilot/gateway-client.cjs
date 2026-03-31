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
    try {
      const usage = result.usage || {}
      const inputTokens = usage.input || usage.inputTokens || 0
      const outputTokens = usage.output || usage.outputTokens || 0
      const model = result.model || usage.model || 'unknown'
      const cost = getCalcCost()(model, { inputTokens, outputTokens })
      const roundedCost = Math.round(cost * 1_000_000) / 1_000_000
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
      if (inputTokens > 0 || outputTokens > 0) {
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
 * Kill (reset) a session via Gateway.
 */
function killSession(sessionKey, timeoutMs = DEFAULT_COMPACT_TIMEOUT_MS) {
  return getPool().sendCommand('sessions.reset', { key: sessionKey }, timeoutMs)
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

module.exports = { sendToAgent, sendToCeo, compactSession, killSession, parseStatusResponse, queryAgentStatus, closePool }
