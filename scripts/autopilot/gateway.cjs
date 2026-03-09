/**
 * Gateway — WebSocket communication with agents
 *
 * Generalized from the original sendToCeo() to support any agent.
 */
const WebSocket = require('ws')
const { randomUUID } = require('crypto')
const { readFileSync, existsSync } = require('fs')
const { join } = require('path')
const { CONFIG_DIR, DEFAULT_AGENT_TIMEOUT_MS } = require('./constants.cjs')
const logger = require('./logger.cjs')

function getGatewayConfig() {
  const envPort = parseInt(process.env.AGENT_FACTORY_PORT || '0')
  const envToken = process.env.AGENT_FACTORY_TOKEN || ''
  const cfgPath = join(CONFIG_DIR, 'openclaw.json')
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
      return {
        port: envPort || cfg.gateway?.port || 19100,
        token: envToken || cfg.gateway?.auth?.token || '',
      }
    } catch (err) {
      logger.warn('gateway', 'Failed to parse openclaw.json', err)
    }
  }
  return { port: envPort || 19100, token: envToken }
}

/**
 * Send a message to any agent via WebSocket.
 *
 * @param {string} agentId - The agent to talk to (e.g. 'ceo', 'novel-chief')
 * @param {string} sessionKey - Session key (e.g. 'agent:ceo:autopilot')
 * @param {string} message - The directive/message text
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{ok: boolean, text?: string, error?: string, usage?: object, aborted?: boolean}>}
 */
function sendToAgent(agentId, sessionKey, message, timeoutMs = DEFAULT_AGENT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const config = getGatewayConfig()
    let runId = randomUUID()
    let fullText = ''
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try { ws.close() } catch (err) {
        logger.debug('gateway', 'WS close error (benign)', err)
      }
      resolve(result)
    }

    const timer = setTimeout(() => {
      if (!done) {
        done = true
        try { ws.close() } catch (err) {
          logger.debug('gateway', 'WS close on timeout', err)
        }
        reject(new Error(`Timeout after ${timeoutMs / 1000}s for agent ${agentId}`))
      }
    }, timeoutMs)

    const connectFrame = JSON.stringify({
      type: 'req', id: 'c', method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'openclaw-control-ui', mode: 'backend', version: '1.0.0', platform: process.platform },
        caps: [],
        auth: { token: config.token },
        role: 'operator',
        scopes: ['operator.admin', 'operator.read', 'operator.write'],
      }
    })

    const ws = new WebSocket(`ws://127.0.0.1:${config.port}`, {
      headers: { Origin: `http://127.0.0.1:${config.port}` }
    })

    ws.on('message', (data) => {
      let f
      try { f = JSON.parse(data.toString()) } catch { return }

      if (f.type === 'event' && f.event === 'connect.challenge') {
        ws.send(connectFrame)
        return
      }

      if (f.type === 'res' && f.id === 'c') {
        if (f.ok) {
          ws.send(JSON.stringify({
            type: 'req', id: 's', method: 'chat.send',
            params: { sessionKey, message, idempotencyKey: runId }
          }))
          logger.debug('gateway', `Connected and sent message to ${agentId}`)
        } else {
          finish({ ok: false, error: `Connect failed: ${f.error?.message}` })
        }
        return
      }

      if (f.type === 'res' && f.id === 's' && f.ok) {
        if (f.payload?.runId) runId = f.payload.runId
        return
      }

      if (f.type === 'res' && f.id === 's' && !f.ok) {
        finish({ ok: false, error: `chat.send failed: ${f.error?.message}` })
        return
      }

      if (f.type === 'event' && f.event === 'chat') {
        const p = f.payload
        if (!p || p.runId !== runId) return

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
          finish({ ok: true, text, usage: p.usage })
        } else if (p.state === 'error') {
          finish({ ok: false, error: p.errorMessage || 'Agent error' })
        } else if (p.state === 'aborted') {
          finish({ ok: true, text: fullText, aborted: true })
        }
      }
    })

    ws.on('error', (err) => {
      logger.error('gateway', `WebSocket error for ${agentId}`, err)
      finish({ ok: false, error: `WebSocket: ${err.message}` })
    })
    ws.on('close', (code) => {
      if (!done) {
        logger.warn('gateway', `WebSocket closed unexpectedly for ${agentId}`, { code })
        finish({ ok: false, error: `WebSocket closed (${code})` })
      }
    })
  })
}

/**
 * Convenience: send to CEO (backward compat)
 */
function sendToCeo(message, timeoutMs = DEFAULT_AGENT_TIMEOUT_MS) {
  return sendToAgent('ceo', 'agent:ceo:autopilot', message, timeoutMs)
}

module.exports = { getGatewayConfig, sendToAgent, sendToCeo }
