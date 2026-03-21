/**
 * Gateway Client — WebSocket communication with agents
 *
 * Uses GatewayConnectionPool for persistent connection reuse.
 * Public API unchanged: sendToAgent, sendToCeo, compactSession, killSession,
 * queryAgentStatus, parseStatusResponse.
 */
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

/**
 * Send a message to any agent via the connection pool.
 *
 * @param {string} agentId - The agent to talk to (e.g. 'ceo', 'novel-chief')
 * @param {string} sessionKey - Session key (e.g. 'agent:ceo:autopilot')
 * @param {string} message - The directive/message text
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{ok: boolean, text?: string, error?: string, usage?: object, aborted?: boolean}>}
 */
function sendToAgent(agentId, sessionKey, message, timeoutMs = DEFAULT_AGENT_TIMEOUT_MS) {
  return getPool().sendToAgent(agentId, sessionKey, message, timeoutMs)
}

/**
 * Convenience: send to CEO (backward compat)
 */
function sendToCeo(message, timeoutMs = DEFAULT_AGENT_TIMEOUT_MS) {
  return sendToAgent('ceo', 'agent:ceo:autopilot', message, timeoutMs)
}

/**
 * Compact a session via Gateway.
 * @param {string} sessionKey
 * @param {number} timeoutMs
 * @returns {Promise<{ok: boolean, error?: string, payload?: object}>}
 */
function compactSession(sessionKey, timeoutMs = DEFAULT_COMPACT_TIMEOUT_MS) {
  return getPool().sendCommand('sessions.compact', { key: sessionKey }, timeoutMs)
}

/**
 * Kill (reset) a session via Gateway.
 * @param {string} sessionKey
 * @param {number} timeoutMs
 * @returns {Promise<{ok: boolean, error?: string, payload?: object}>}
 */
function killSession(sessionKey, timeoutMs = DEFAULT_COMPACT_TIMEOUT_MS) {
  return getPool().sendCommand('sessions.reset', { key: sessionKey }, timeoutMs)
}

/**
 * Parse a status response from an agent.
 * Expected format: STATUS: working|completed|idle, optionally SUBAGENT: <runId>
 *
 * @param {string} text
 * @returns {{working?: boolean, completed?: boolean, idle?: boolean, timeout?: boolean, subagentRunId?: string|null}}
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
  return { idle: true }  // conservative fallback
}

/**
 * Query an agent's current task status via the chat session.
 * Uses a short timeout to avoid blocking the autopilot loop.
 *
 * @param {string} agentId
 * @param {string} sessionKey
 * @param {number} timeoutMs
 * @returns {Promise<{working?: boolean, completed?: boolean, idle?: boolean, timeout?: boolean, subagentRunId?: string|null}>}
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
