'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { execSync } = require('child_process')
const { join } = require('path')

const { shouldSkip, isGatewayRunning, getRegisteredAgents, ROOT } = require('./_helpers/env-loader.cjs')

const skip = shouldSkip()
if (skip.skip) {
  describe('(skipped) Gateway Connection', () => {
    it(skip.reason, () => {})
  })
  return
}

describe('Gateway Connection — real MiniMax model', () => {
  let agentId
  let sendToAgent, closePool

  before(async () => {
    const running = await isGatewayRunning()
    if (!running) {
      console.log('Gateway not running — skipping')
      process.exit(0)
    }

    const agents = getRegisteredAgents()
    assert.ok(agents.length > 0, 'No registered agents in openclaw.json')
    agentId = agents[0]

    const gwClient = require(join(ROOT, 'core', 'autopilot', 'gateway-client.cjs'))
    sendToAgent = gwClient.sendToAgent
    closePool = gwClient.closePool
  })

  after(() => {
    if (closePool) closePool()
  })

  it('sends a message to a registered Agent and receives a valid response', async () => {
    const sessionKey = `agent:${agentId}:e2e-test-${Date.now()}`
    const result = await sendToAgent(agentId, sessionKey, '请用一句话介绍你自己', 30000)

    assert.equal(result.ok, true, `sendToAgent failed: ${result.error}`)
    assert.ok(typeof result.text === 'string', 'response text should be a string')
    assert.ok(result.text.length > 5, `response too short: "${result.text}"`)
    assert.ok(!result.text.includes('(no response)'), 'Got OpenClaw empty response bug')
  })

  it('response includes usage data when provider supports it', async () => {
    const sessionKey = `agent:${agentId}:e2e-usage-${Date.now()}`
    const result = await sendToAgent(agentId, sessionKey, '说"OK"', 30000)

    assert.equal(result.ok, true, `sendToAgent failed: ${result.error}`)
    // usage may or may not be present depending on provider/OpenClaw version
    if (result.usage) {
      assert.ok(typeof result.usage === 'object', 'usage should be an object')
      console.log('  usage data:', JSON.stringify(result.usage))
    } else {
      console.log('  usage not returned by provider (acceptable for MiniMax)')
    }
    // Always verify we got a valid text response
    assert.ok(result.text && result.text.length > 0, 'should have text response')
  })

  it('unregistered Agent ID is handled by Gateway (auto-provision)', async () => {
    // OpenClaw auto-creates agents that aren't pre-registered,
    // so we verify the registered agent list from config vs an unknown ID
    const agents = getRegisteredAgents()
    assert.ok(!agents.includes('zzz-nonexistent-e2e-agent'),
      'zzz-nonexistent-e2e-agent should not be in registered agents')
    assert.ok(agents.includes(agentId),
      `${agentId} should be in registered agents`)

    // Gateway will still respond for unknown agents (auto-provision),
    // so we just verify the call doesn't crash
    const result = await sendToAgent(
      'zzz-nonexistent-e2e-agent',
      'agent:zzz-nonexistent:e2e-test',
      'hello',
      15000
    )
    // Result can be ok or not — just verify structure
    assert.ok(typeof result.ok === 'boolean', 'result.ok should be boolean')
  })

  it('gateway-chat.js subprocess communication', () => {
    const chatScript = join(ROOT, 'ui', 'scripts', 'gateway-chat.js')
    const sessionKey = `agent:${agentId}:e2e-sub-${Date.now()}`
    const input = JSON.stringify({ sessionKey, message: '说OK' })

    let stdout
    try {
      stdout = execSync(`node "${chatScript}"`, {
        env: { ...process.env, CHAT_INPUT: input, AGENT_FACTORY_DIR: ROOT },
        timeout: 60000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err) {
      // execSync throws on non-zero exit; stderr may contain debug logs
      stdout = err.stdout || ''
    }

    // stdout should contain SSE events
    assert.ok(
      stdout.includes('event: final') || stdout.includes('event: delta'),
      `Expected SSE events in stdout, got: "${stdout.slice(0, 200)}"`
    )
  })
})
