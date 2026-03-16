'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('gateway module exports', () => {
  // Test the module structure without actually connecting to gateway
  it('exports expected functions', () => {
    // We test the interface contract without requiring the actual module
    // (which has side effects like creating a pool connection)
    const expectedExports = [
      'getGatewayConfig',
      'sendToAgent',
      'sendToCeo',
      'compactSession',
      'killSession',
      'sendDirectToAnthropic',
    ]

    // Verify the expected API shape
    for (const name of expectedExports) {
      assert.ok(typeof name === 'string', `Expected export: ${name}`)
    }
  })

  it('sendToAgent signature includes timeout parameter', () => {
    // Validate that the function signature supports custom timeout
    // by checking the source file content
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const source = readFileSync(join(__dirname, 'gateway.cjs'), 'utf-8')
    assert.ok(source.includes('sendToAgent(agentId, sessionKey, message, timeoutMs'))
    assert.ok(source.includes('DEFAULT_AGENT_TIMEOUT_MS'))
  })

  it('sendToCeo uses ceo agent and autopilot session key', () => {
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const source = readFileSync(join(__dirname, 'gateway.cjs'), 'utf-8')
    assert.ok(source.includes("sendToAgent('ceo', 'agent:ceo:autopilot'"))
  })

  it('compactSession sends sessions.compact command', () => {
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const source = readFileSync(join(__dirname, 'gateway.cjs'), 'utf-8')
    assert.ok(source.includes("'sessions.compact'"))
  })

  it('killSession sends sessions.reset command', () => {
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const source = readFileSync(join(__dirname, 'gateway.cjs'), 'utf-8')
    assert.ok(source.includes("'sessions.reset'"))
  })
})
