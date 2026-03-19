'use strict'
/**
 * GatewayClient — Autopilot Gateway 通信客户端单元测试
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const SOURCE_PATH = require('path').join(__dirname, '..', '..', '..', 'core', 'autopilot', 'gateway-client.cjs')

describe('gateway-client module exports', () => {
  it('exports expected functions', () => {
    const mod = require('../../../core/autopilot/gateway-client.cjs')
    const expectedExports = [
      'sendToAgent',
      'sendToCeo',
      'compactSession',
      'killSession',
      'parseStatusResponse',
      'queryAgentStatus',
      'closePool',
    ]

    for (const name of expectedExports) {
      assert.equal(typeof mod[name], 'function', `Expected export: ${name}`)
    }
  })

  it('sendToAgent signature includes timeout parameter', () => {
    const { readFileSync } = require('fs')
    const source = readFileSync(SOURCE_PATH, 'utf-8')
    assert.ok(source.includes('sendToAgent(agentId, sessionKey, message, timeoutMs'))
    assert.ok(source.includes('DEFAULT_AGENT_TIMEOUT_MS'))
  })

  it('sendToCeo uses ceo agent and autopilot session key', () => {
    const { readFileSync } = require('fs')
    const source = readFileSync(SOURCE_PATH, 'utf-8')
    assert.ok(source.includes("sendToAgent('ceo', 'agent:ceo:autopilot'"))
  })

  it('compactSession sends sessions.compact command', () => {
    const { readFileSync } = require('fs')
    const source = readFileSync(SOURCE_PATH, 'utf-8')
    assert.ok(source.includes("'sessions.compact'"))
  })

  it('killSession sends sessions.reset command', () => {
    const { readFileSync } = require('fs')
    const source = readFileSync(SOURCE_PATH, 'utf-8')
    assert.ok(source.includes("'sessions.reset'"))
  })

  it('uses GatewayConnectionPool internally', () => {
    const { readFileSync } = require('fs')
    const source = readFileSync(SOURCE_PATH, 'utf-8')
    assert.ok(source.includes('GatewayConnectionPool'))
    assert.ok(source.includes('getPool()'))
  })
})

describe('parseStatusResponse', () => {
  const { parseStatusResponse } = require('../../../core/autopilot/gateway-client.cjs')

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
