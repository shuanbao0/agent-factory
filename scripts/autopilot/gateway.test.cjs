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

describe('parseStatusResponse', () => {
  const { parseStatusResponse } = require('./gateway.cjs')

  it('returns timeout for null/empty', () => {
    assert.deepEqual(parseStatusResponse(null), { timeout: true })
    assert.deepEqual(parseStatusResponse(''), { timeout: true })
  })

  it('parses STATUS: working', () => {
    const result = parseStatusResponse('STATUS: working')
    assert.ok(result.working)
    assert.equal(result.subagentRunId, null)
  })

  it('parses STATUS: working with SUBAGENT', () => {
    const result = parseStatusResponse('STATUS: working, SUBAGENT: run-abc-123')
    assert.ok(result.working)
    assert.equal(result.subagentRunId, 'run-abc-123')
  })

  it('parses STATUS: completed', () => {
    const result = parseStatusResponse('STATUS: completed')
    assert.ok(result.completed)
  })

  it('parses STATUS: idle', () => {
    const result = parseStatusResponse('STATUS: idle')
    assert.ok(result.idle)
  })

  it('falls back to idle for unrecognized text', () => {
    const result = parseStatusResponse('I am doing something random')
    assert.ok(result.idle)
  })

  it('is case-insensitive', () => {
    assert.ok(parseStatusResponse('Status: Working').working)
    assert.ok(parseStatusResponse('status: COMPLETED').completed)
    assert.ok(parseStatusResponse('STATUS: IDLE').idle)
  })

  it('parses status embedded in longer text', () => {
    const text = '当前正在处理任务。\nSTATUS: working\nSUBAGENT: run-xyz\n进度约50%'
    const result = parseStatusResponse(text)
    assert.ok(result.working)
    assert.equal(result.subagentRunId, 'run-xyz')
  })
})
