'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const WebSocket = require('ws')
const { GatewayConnectionPool } = require('../../../core/llm/gateway-pool.cjs')

// Mock WebSocket server for testing
let server
let serverPort

function createMockServer() {
  return new Promise((resolve) => {
    server = new WebSocket.Server({ port: 0 }, () => {
      serverPort = server.address().port

      server.on('connection', (ws) => {
        // Send challenge on connect
        ws.send(JSON.stringify({ type: 'event', event: 'connect.challenge' }))

        ws.on('message', (data) => {
          const frame = JSON.parse(data.toString())

          // Handle connect
          if (frame.method === 'connect') {
            ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: {} }))
            return
          }

          // Handle chat.send — simulate delta + final
          if (frame.method === 'chat.send') {
            const runId = frame.params.idempotencyKey || 'test-run'
            ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: { runId } }))

            // Send delta
            ws.send(JSON.stringify({
              type: 'event', event: 'chat',
              payload: {
                sessionKey: frame.params.sessionKey,
                runId,
                state: 'delta',
                message: { content: [{ type: 'text', text: 'Hello from mock' }] },
              }
            }))

            // Send final
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: 'event', event: 'chat',
                payload: {
                  sessionKey: frame.params.sessionKey,
                  runId,
                  state: 'final',
                  message: { content: [{ type: 'text', text: 'Hello from mock' }], usage: { input: 50, output: 50, totalTokens: 100 }, model: 'test-model' },
                }
              }))
            }, 10)
            return
          }

          // Handle session commands
          if (frame.method === 'sessions.compact' || frame.method === 'sessions.reset') {
            ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: {} }))
            return
          }

          // Echo other requests
          ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: { echo: frame.params } }))
        })
      })

      resolve()
    })
  })
}

describe('GatewayConnectionPool', () => {
  beforeEach(async () => {
    await createMockServer()
  })

  afterEach(() => {
    return new Promise((resolve) => {
      if (server) server.close(resolve)
      else resolve()
    })
  })

  it('connects and completes handshake', async () => {
    const pool = new GatewayConnectionPool({ port: serverPort, token: 'test' })
    try {
      const result = await pool.sendCommand('sessions.compact', { key: 'test:key' })
      assert.ok(result.ok)
    } finally {
      pool.close()
    }
  })

  it('sendCommand returns response', async () => {
    const pool = new GatewayConnectionPool({ port: serverPort, token: 'test' })
    try {
      const result = await pool.sendCommand('sessions.reset', { key: 'agent:ceo:main' })
      assert.ok(result.ok)
    } finally {
      pool.close()
    }
  })

  it('reuses connection for multiple commands', async () => {
    const pool = new GatewayConnectionPool({ port: serverPort, token: 'test' })
    try {
      const r1 = await pool.sendCommand('sessions.compact', { key: 'k1' })
      const r2 = await pool.sendCommand('sessions.compact', { key: 'k2' })
      assert.ok(r1.ok)
      assert.ok(r2.ok)
      assert.strictEqual(pool.getStats().connected, true)
    } finally {
      pool.close()
    }
  })

  it('handles timeout gracefully', async () => {
    const pool = new GatewayConnectionPool({ port: serverPort, token: 'test' })
    // Create a server that doesn't respond to this specific method
    try {
      // Close the real server and create one that doesn't respond
      await new Promise(r => server.close(r))
      await new Promise((resolve) => {
        server = new WebSocket.Server({ port: serverPort }, () => {
          server.on('connection', (ws) => {
            ws.send(JSON.stringify({ type: 'event', event: 'connect.challenge' }))
            ws.on('message', (data) => {
              const frame = JSON.parse(data.toString())
              if (frame.method === 'connect') {
                ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: {} }))
              }
              // Don't respond to other requests — will timeout
            })
          })
          resolve()
        })
      })

      await assert.rejects(
        () => pool._request('test.method', {}, 200),
        { message: /Timeout/ }
      )
    } finally {
      pool.close()
    }
  })

  it('sendToAgent completes chat flow', async () => {
    const pool = new GatewayConnectionPool({ port: serverPort, token: 'test' })
    try {
      const result = await pool.sendToAgent('ceo', 'agent:ceo:test', 'Hello')
      assert.ok(result.ok)
      assert.strictEqual(result.text, 'Hello from mock')
      assert.ok(result.usage)
    } finally {
      pool.close()
    }
  })

  it('getStats reports connection state', async () => {
    const pool = new GatewayConnectionPool({ port: serverPort, token: 'test' })
    assert.strictEqual(pool.getStats().connected, false)
    await pool.sendCommand('sessions.compact', { key: 'test' })
    assert.strictEqual(pool.getStats().connected, true)
    pool.close()
    assert.strictEqual(pool.getStats().connected, false)
  })

  it('retries on empty response and returns second response', async () => {
    // Close default server, create one that sends empty first, then real content
    await new Promise(r => server.close(r))
    let chatSendCount = 0
    await new Promise((resolve) => {
      server = new WebSocket.Server({ port: serverPort }, () => {
        server.on('connection', (ws) => {
          ws.send(JSON.stringify({ type: 'event', event: 'connect.challenge' }))
          ws.on('message', (data) => {
            const frame = JSON.parse(data.toString())
            if (frame.method === 'connect') {
              ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: {} }))
              return
            }
            if (frame.method === 'sessions.reset') {
              ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: {} }))
              return
            }
            if (frame.method === 'chat.send') {
              chatSendCount++
              const runId = frame.params.idempotencyKey || 'run-' + chatSendCount
              ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: { runId } }))
              if (chatSendCount === 1) {
                // First: empty final
                ws.send(JSON.stringify({
                  type: 'event', event: 'chat',
                  payload: { sessionKey: frame.params.sessionKey, runId, state: 'final',
                    message: { content: [{ type: 'text', text: '' }], usage: { totalTokens: 10 } } }
                }))
              } else {
                // Second (retry): real content
                ws.send(JSON.stringify({
                  type: 'event', event: 'chat',
                  payload: { sessionKey: frame.params.sessionKey, runId, state: 'final',
                    message: { content: [{ type: 'text', text: 'Retry success' }], usage: { totalTokens: 200 } } }
                }))
              }
              return
            }
          })
        })
        resolve()
      })
    })

    const pool = new GatewayConnectionPool({ port: serverPort, token: 'test' })
    try {
      const result = await pool.sendToAgent('ceo', 'agent:ceo:retry-test', 'Hello', 10000)
      assert.ok(result.ok)
      assert.strictEqual(result.text, 'Retry success')
      assert.strictEqual(chatSendCount, 2)
    } finally {
      pool.close()
    }
  })

  it('discards old runId frames after retry', async () => {
    // Close default server, create one that leaks old runId frames after retry
    await new Promise(r => server.close(r))
    let chatSendCount = 0
    let oldRunId = null
    await new Promise((resolve) => {
      server = new WebSocket.Server({ port: serverPort }, () => {
        server.on('connection', (ws) => {
          ws.send(JSON.stringify({ type: 'event', event: 'connect.challenge' }))
          ws.on('message', (data) => {
            const frame = JSON.parse(data.toString())
            if (frame.method === 'connect') {
              ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: {} }))
              return
            }
            if (frame.method === 'sessions.reset') {
              ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: {} }))
              return
            }
            if (frame.method === 'chat.send') {
              chatSendCount++
              const runId = frame.params.idempotencyKey || 'run-' + chatSendCount
              ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: { runId } }))
              if (chatSendCount === 1) {
                oldRunId = runId
                // First: empty final
                ws.send(JSON.stringify({
                  type: 'event', event: 'chat',
                  payload: { sessionKey: frame.params.sessionKey, runId, state: 'final',
                    message: { content: [{ type: 'text', text: '' }], usage: { totalTokens: 10 } } }
                }))
              } else {
                // After retry: send old runId delta (should be discarded), then new final
                ws.send(JSON.stringify({
                  type: 'event', event: 'chat',
                  payload: { sessionKey: frame.params.sessionKey, runId: oldRunId, state: 'delta',
                    message: { content: [{ type: 'text', text: 'OLD LEAKED DATA' }] } }
                }))
                setTimeout(() => {
                  ws.send(JSON.stringify({
                    type: 'event', event: 'chat',
                    payload: { sessionKey: frame.params.sessionKey, runId, state: 'final',
                      message: { content: [{ type: 'text', text: 'Clean retry' }], usage: { totalTokens: 100 } } }
                  }))
                }, 10)
              }
              return
            }
          })
        })
        resolve()
      })
    })

    const pool = new GatewayConnectionPool({ port: serverPort, token: 'test' })
    try {
      const result = await pool.sendToAgent('ceo', 'agent:ceo:leak-test', 'Hello', 10000)
      assert.ok(result.ok)
      assert.strictEqual(result.text, 'Clean retry')
      assert.ok(!result.text.includes('OLD LEAKED DATA'))
    } finally {
      pool.close()
    }
  })
})
