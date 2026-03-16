/**
 * Gateway — WebSocket communication with agents
 *
 * Thin wrapper over GatewayConnectionPool (shared/gateway-pool.cjs).
 * Preserves the original module.exports API for zero-impact migration.
 */
'use strict'
const { GatewayConnectionPool } = require('../../shared/gateway-pool.cjs')
const { configRepo } = require('../../shared/config-repository.cjs')
const { readMemorySummary } = require('./readers.cjs')
const { DEFAULT_AGENT_TIMEOUT_MS, DEFAULT_COMPACT_TIMEOUT_MS } = require('./constants.cjs')
const logger = require('./logger.cjs')

const pool = new GatewayConnectionPool()
pool.setMemoryReader(readMemorySummary)
pool.setLogger(logger)

function getGatewayConfig() {
  return configRepo.getGatewayConfig()
}

function sendToAgent(agentId, sessionKey, message, timeoutMs = DEFAULT_AGENT_TIMEOUT_MS) {
  return pool.sendToAgent(agentId, sessionKey, message, timeoutMs)
}

function sendToCeo(message, timeoutMs = DEFAULT_AGENT_TIMEOUT_MS) {
  return sendToAgent('ceo', 'agent:ceo:autopilot', message, timeoutMs)
}

function compactSession(sessionKey, timeoutMs = DEFAULT_COMPACT_TIMEOUT_MS) {
  return pool.sendCommand('sessions.compact', { key: sessionKey }, timeoutMs)
}

function killSession(sessionKey, timeoutMs = DEFAULT_COMPACT_TIMEOUT_MS) {
  return pool.sendCommand('sessions.reset', { key: sessionKey }, timeoutMs)
}

/**
 * Send a message directly to Anthropic API with tool definitions.
 * Bypasses OpenClaw Gateway — used for chief/CEO decisions that need
 * structured tool_use responses.
 *
 * @param {Object} opts - Options passed to anthropic-client.sendWithTools
 * @returns {Promise<import('../../shared/anthropic-client.cjs').SendResult>}
 */
function sendDirectToAnthropic(opts) {
  const { sendWithTools } = require('../../shared/anthropic-client.cjs')
  return sendWithTools(opts)
}

module.exports = { getGatewayConfig, sendToAgent, sendToCeo, compactSession, killSession, sendDirectToAnthropic }
