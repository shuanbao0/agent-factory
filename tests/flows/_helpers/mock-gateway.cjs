'use strict'

/**
 * Create a mock sendFn for QualityOrchestrator / gateway-client
 * @param {Object} responseMap - { [agentId]: 'response text' }
 * @returns {Function} async (agentId, sessionKey, message, timeoutMs) => {ok, text}
 */
function createMockSendFn(responseMap = {}) {
  const defaultResponse = 'SCORE: 85\nPASSED: true\nISSUES: none'
  const calls = []

  const fn = async (agentId, sessionKey, message, timeoutMs) => {
    calls.push({ agentId, sessionKey, message, timeoutMs })
    const text = responseMap[agentId] || defaultResponse
    return { ok: true, text }
  }

  fn.calls = calls
  return fn
}

/**
 * Create mock agent activity data
 * @param {Object} activityMap - { [agentId]: { idleMins, totalTokens, lastActive } }
 * @returns {Function} () => activityMap
 */
function createMockAgentActivity(activityMap = {}) {
  return () => activityMap
}

/**
 * Create mock hooks for AgentService
 * @returns {{ calls: Object, hooks: Object }}
 */
function createMockHooks() {
  const calls = { baseRules: 0, skillsSync: 0, gateway: 0 }
  const hooks = {
    onBaseRulesInject: () => { calls.baseRules++ },
    onSkillsSync: () => { calls.skillsSync++ },
    onGatewaySync: () => { calls.gateway++; return true },
  }
  return { calls, hooks }
}

module.exports = { createMockSendFn, createMockAgentActivity, createMockHooks }
