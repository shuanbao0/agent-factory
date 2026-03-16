'use strict'
const WebSocket = require('ws')
const { randomUUID } = require('crypto')

class GatewayConnectionPool {
  constructor({ port, token, idleTimeoutMs = 300000, heartbeatMs = 30000 } = {}) {
    this._port = port
    this._token = token
    this._idleTimeoutMs = idleTimeoutMs
    this._heartbeatMs = heartbeatMs
    this._ws = null
    this._connected = false
    this._connecting = null
    this._pendingRequests = new Map() // requestId → { resolve, reject, timer }
    this._chatListeners = new Map()  // sessionKey → { resolve, fullText, ... }
    this._idleTimer = null
    this._heartbeatTimer = null
    this._reconnectDelay = 1000
    this._readMemorySummary = null
    this._logger = null
  }

  /** Set logger (optional, defaults to console) */
  setLogger(logger) { this._logger = logger }

  /** Set memory reader callback for empty-response retry */
  setMemoryReader(fn) { this._readMemorySummary = fn }

  /** Ensure WebSocket connection is ready (lazy connect + auto-reconnect) */
  async _ensureConnected() {
    if (this._connected && this._ws?.readyState === WebSocket.OPEN) return
    if (this._connecting) return this._connecting

    this._connecting = new Promise((resolve, reject) => {
      const config = this._getConfig()
      const ws = new WebSocket(`ws://127.0.0.1:${config.port}`, {
        headers: { Origin: `http://127.0.0.1:${config.port}` }
      })

      const connectFrame = JSON.stringify({
        type: 'req', id: '__connect__', method: 'connect',
        params: {
          minProtocol: 3, maxProtocol: 3,
          client: { id: 'openclaw-control-ui', mode: 'backend', version: '1.0.0', platform: process.platform },
          caps: [],
          auth: { token: config.token },
          role: 'operator',
          scopes: ['operator.admin', 'operator.read', 'operator.write'],
        }
      })

      ws.on('message', (data) => {
        let f
        try { f = JSON.parse(data.toString()) } catch { return }

        // Connect handshake
        if (f.type === 'event' && f.event === 'connect.challenge') {
          ws.send(connectFrame)
          return
        }
        if (f.type === 'res' && f.id === '__connect__') {
          if (f.ok) {
            this._ws = ws
            this._connected = true
            this._connecting = null
            this._reconnectDelay = 1000
            this._startHeartbeat()
            resolve()
          } else {
            this._connecting = null
            reject(new Error(`Connect failed: ${f.error?.message}`))
          }
          return
        }

        // Route to handlers
        this._handleFrame(f)
      })

      ws.on('error', (err) => {
        this._connected = false
        this._connecting = null
        reject(err)
      })

      ws.on('close', () => {
        this._connected = false
        this._connecting = null
        this._stopHeartbeat()
        if (this._pendingRequests.size > 0 || this._chatListeners.size > 0) {
          this._scheduleReconnect()
        }
      })
    })

    return this._connecting
  }

  /** Route response frames to pending requests or chat listeners */
  _handleFrame(f) {
    // Normal request response
    if (f.type === 'res' && this._pendingRequests.has(f.id)) {
      const pending = this._pendingRequests.get(f.id)
      this._pendingRequests.delete(f.id)
      clearTimeout(pending.timer)
      pending.resolve(f)
      return
    }

    // Chat events — route by sessionKey
    if (f.type === 'event' && f.event === 'chat') {
      const p = f.payload
      for (const [key, listener] of this._chatListeners) {
        if (p.sessionKey === key || p.runId === listener.runId) {
          listener.handler(p)
          break
        }
      }
    }
  }

  /** Send a request frame and wait for response */
  async _request(method, params, timeoutMs = 30000) {
    await this._ensureConnected()
    this._resetIdleTimer()
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingRequests.delete(id)
        reject(new Error(`Timeout ${timeoutMs}ms for ${method}`))
      }, timeoutMs)
      this._pendingRequests.set(id, { resolve, reject, timer })
      this._ws.send(JSON.stringify({ type: 'req', id, method, params }))
    })
  }

  /**
   * Send message to an agent via chat.
   * Preserves empty-response retry logic from gateway.cjs.
   */
  async sendToAgent(agentId, sessionKey, message, timeoutMs = 300000) {
    await this._ensureConnected()
    this._resetIdleTimer()

    return new Promise((resolve) => {
      let runId = randomUUID()
      let fullText = ''
      let retried = false
      let done = false

      const timer = setTimeout(() => {
        if (!done) { done = true; cleanup(); resolve({ ok: false, error: `Timeout after ${timeoutMs / 1000}s for agent ${agentId}` }) }
      }, timeoutMs)

      const cleanup = () => {
        clearTimeout(timer)
        this._chatListeners.delete(sessionKey)
      }

      const finish = (result) => {
        if (done) return
        done = true; cleanup(); resolve(result)
      }

      // Register chat listener
      this._chatListeners.set(sessionKey, {
        runId,
        handler: (p) => {
          if (p.runId !== runId && p.sessionKey !== sessionKey) return

          if (p.state === 'delta') {
            const text = p.message?.content
              ?.filter(b => b.type === 'text')
              ?.map(b => b.text || '')
              ?.join('') || ''
            if (text) fullText = text
          } else if (p.state === 'final') {
            const text = p.message?.content
              ?.filter(b => b.type === 'text')
              ?.map(b => b.text || '')
              ?.join('') || fullText

            // Empty response retry with memory injection
            if (!text.trim() && !retried) {
              retried = true
              this._log('info', `Empty response from ${agentId} on ${sessionKey}, resetting and retrying`)

              const resetId = randomUUID()
              this._pendingRequests.set(resetId, {
                resolve: () => {
                  runId = randomUUID()
                  fullText = ''
                  let retryMsg = message
                  if (this._readMemorySummary) {
                    const summary = this._readMemorySummary(agentId)
                    if (summary) {
                      retryMsg = `[Context from previous session]\n${summary}\n\n${message}`
                    }
                  }
                  const listener = this._chatListeners.get(sessionKey)
                  if (listener) listener.runId = runId
                  this._ws.send(JSON.stringify({
                    type: 'req', id: randomUUID(), method: 'chat.send',
                    params: { sessionKey, message: retryMsg, idempotencyKey: runId }
                  }))
                },
                reject: () => finish({ ok: false, error: 'Session reset failed' }),
                timer: setTimeout(() => finish({ ok: false, error: 'Session reset timeout' }), 30000),
              })
              this._ws.send(JSON.stringify({
                type: 'req', id: resetId, method: 'sessions.reset',
                params: { key: sessionKey }
              }))
              return
            }
            if (!text.trim() && retried) {
              this._log('error', `Empty response from ${agentId} after retry`)
              finish({ ok: false, error: 'Empty response after session reset retry', usage: p.usage })
              return
            }
            finish({ ok: true, text, usage: p.usage })
          } else if (p.state === 'error') {
            finish({ ok: false, error: p.errorMessage || 'Agent error' })
          } else if (p.state === 'aborted') {
            finish({ ok: true, text: fullText, aborted: true })
          }
        }
      })

      // Send chat.send
      const sendId = randomUUID()
      this._pendingRequests.set(sendId, {
        resolve: (res) => {
          if (res.ok && res.payload?.runId) {
            runId = res.payload.runId
            const listener = this._chatListeners.get(sessionKey)
            if (listener) listener.runId = runId
          }
          if (!res.ok) finish({ ok: false, error: `chat.send failed: ${res.error?.message}` })
        },
        reject: (err) => finish({ ok: false, error: err.message }),
        timer: setTimeout(() => {}, timeoutMs), // main timer controls
      })
      this._ws.send(JSON.stringify({
        type: 'req', id: sendId, method: 'chat.send',
        params: { sessionKey, message, idempotencyKey: runId }
      }))
    })
  }

  /** Session command (compact/reset) */
  async sendCommand(method, params, timeoutMs = 30000) {
    const res = await this._request(method, params, timeoutMs)
    if (res.ok) return { ok: true, payload: res.payload }
    return { ok: false, error: `${method} failed: ${res.error?.message}` }
  }

  // --- Internal ---

  _getConfig() {
    if (this._port && this._token) return { port: this._port, token: this._token }
    try {
      const { configRepo } = require('../repo/config.cjs')
      return configRepo.getGatewayConfig()
    } catch {
      return {
        port: parseInt(process.env.AGENT_FACTORY_PORT || '19100'),
        token: process.env.AGENT_FACTORY_TOKEN || ''
      }
    }
  }

  _log(level, msg) {
    if (this._logger) {
      this._logger[level]('gateway-pool', msg)
    }
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) this._ws.ping()
    }, this._heartbeatMs)
  }

  _stopHeartbeat() { clearInterval(this._heartbeatTimer) }

  _resetIdleTimer() {
    clearTimeout(this._idleTimer)
    this._idleTimer = setTimeout(() => this.close(), this._idleTimeoutMs)
  }

  _scheduleReconnect() {
    setTimeout(() => {
      this._ensureConnected().catch(() => {
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000)
        this._scheduleReconnect()
      })
    }, this._reconnectDelay)
  }

  close() {
    this._stopHeartbeat()
    clearTimeout(this._idleTimer)
    if (this._ws) { try { this._ws.close() } catch {} }
    this._connected = false
    this._ws = null
  }

  getStats() {
    return {
      connected: this._connected,
      pendingRequests: this._pendingRequests.size,
      chatListeners: this._chatListeners.size,
    }
  }
}

module.exports = { GatewayConnectionPool }
