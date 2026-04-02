#!/usr/bin/env node
/**
 * 独立 Node 脚本：通过宿主机 OpenClaw Gateway WebSocket 发送 chat.send
 * 避免 Next.js webpack 对 ws 模块的兼容问题
 *
 * 输入: env CHAT_INPUT = JSON { sessionKey, message }
 * 输出: stdout SSE 事件流
 *   event: delta\ndata: {"text":"..."}\n\n
 *   event: final\ndata: {"text":"...","runId":"...","usage":{...}}\n\n
 *   event: error\ndata: {"error":"...","runId":"..."}\n\n
 */
const WebSocket = require('ws')
const { randomUUID } = require('crypto')
const { readFileSync, existsSync } = require('fs')
const { resolve } = require('path')

// DB tracking modules (fire-and-forget, failures silenced)
let _insertMessage, _calculateCost, _insertCostEntry
try {
  _insertMessage = require('../../core/db/queries/message-queries.cjs').insertMessage
  _calculateCost = require('../../core/observe/cost-tracker.cjs').calculateCost
  _insertCostEntry = require('../../core/db/queries/cost-queries.cjs').insertCostEntry
} catch { /* DB modules not available — skip tracking */ }

const input = JSON.parse(process.env.CHAT_INPUT || '{}')
const { sessionKey, message } = input

const emit = (event, data) => {
  process.stdout.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

if (!sessionKey || !message) {
  emit('error', { error: 'missing sessionKey or message', runId: '' })
  process.exit(0)
}

// Load host gateway config
function getConfig() {
  // 1. 优先使用环境变量（由 start.mjs 注入）
  const envPort = parseInt(process.env.AGENT_FACTORY_PORT || '0')
  const envToken = process.env.AGENT_FACTORY_TOKEN || ''

  // 2. 尝试从运行时配置文件读取（data/config/openclaw.json）
  const factoryDir = process.env.AGENT_FACTORY_DIR || resolve(__dirname, '../..')
  const dataDir = process.env.AGENT_FACTORY_DATA_DIR || resolve(factoryDir, 'data')
  const projectCfg = resolve(dataDir, 'config/openclaw.json')
  if (existsSync(projectCfg)) {
    try {
      const cfg = JSON.parse(readFileSync(projectCfg, 'utf-8'))
      return {
        port: envPort || cfg.gateway?.port || 19100,
        token: envToken || cfg.gateway?.auth?.token || 'agent-factory-internal-token-2026',
      }
    } catch {}
  }

  // 3. fallback 到环境变量或默认值
  return { port: envPort || 19100, token: envToken || 'agent-factory-internal-token-2026' }
}

const config = getConfig()
let runId = randomUUID()
let fullText = ''
let resolved = false
let reqSeq = 0
const pendingReq = new Map()

const USAGE_FALLBACK_TIMEOUT_MS = 3000
const SESSIONS_LIST_LIMIT = 200

const finish = (event, data) => {
  if (resolved) return
  resolved = true
  emit(event, { ...data, runId })
  try { ws.close() } catch {}
  process.exit(0)
}

const timer = setTimeout(() => {
  finish('error', { error: 'Timeout after 120s' })
}, 120000)

const CONNECT_FRAME = JSON.stringify({
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

function _toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function _normalizeUsage(rawUsage, modelHint) {
  const usage = (rawUsage && typeof rawUsage === 'object') ? rawUsage : {}
  const inputTokens = _toNumber(usage.input ?? usage.inputTokens ?? usage.input_tokens)
  const outputTokens = _toNumber(usage.output ?? usage.outputTokens ?? usage.output_tokens)
  const cacheRead = _toNumber(usage.cacheRead ?? usage.cache_read ?? usage.cache_read_input_tokens)
  const cacheWrite = _toNumber(usage.cacheWrite ?? usage.cache_write ?? usage.cache_creation_input_tokens)
  const totalFromPayload = _toNumber(usage.totalTokens ?? usage.total ?? usage.total_tokens)
  const totalTokens = totalFromPayload || (inputTokens + outputTokens + cacheRead + cacheWrite)
  const model = (typeof usage.model === 'string' && usage.model.trim()) ? usage.model : (modelHint || 'unknown')
  const nestedCost = (usage.cost && typeof usage.cost === 'object')
    ? _toNumber(usage.cost.total ?? usage.cost.usd ?? usage.cost.value)
    : 0
  const flatCost = _toNumber(usage.cost)
  const costUsd = nestedCost || flatCost
  const hasUsage = totalTokens > 0 || inputTokens > 0 || outputTokens > 0 || costUsd > 0

  return { inputTokens, outputTokens, totalTokens, model, costUsd, hasUsage }
}

function _extractUsageFromSessionMessages(messages) {
  if (!Array.isArray(messages)) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.role !== 'assistant') continue
    const normalized = _normalizeUsage(msg.usage, msg.model)
    if (normalized.hasUsage) return normalized
  }
  return null
}

function _sendCommand(method, params, timeoutMs = USAGE_FALLBACK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (ws.readyState !== WebSocket.OPEN) {
      reject(new Error('gateway websocket not open'))
      return
    }

    const id = `r${++reqSeq}`
    const timeout = setTimeout(() => {
      pendingReq.delete(id)
      reject(new Error(`${method} timeout`))
    }, timeoutMs)

    pendingReq.set(id, { resolve, reject, timeout })

    try {
      ws.send(JSON.stringify({ type: 'req', id, method, params }))
    } catch (err) {
      clearTimeout(timeout)
      pendingReq.delete(id)
      reject(err)
    }
  })
}

async function _resolveUsage(payload) {
  const direct = _normalizeUsage(payload?.usage || payload?.message?.usage, payload?.message?.model || payload?.model || 'unknown')
  if (direct.hasUsage) return direct

  try {
    const res = await _sendCommand('sessions.get', { key: sessionKey })
    if (res.ok) {
      const fromSession = _extractUsageFromSessionMessages(res.payload?.messages)
      if (fromSession) return fromSession
    }
  } catch (err) {
    console.error('[chat-debug] sessions.get fallback failed:', err.message)
  }

  try {
    const res = await _sendCommand('sessions.list', { limit: SESSIONS_LIST_LIMIT })
    if (res.ok) {
      const sessions = Array.isArray(res.payload?.sessions) ? res.payload.sessions : []
      const session = sessions.find(s => s && s.key === sessionKey)
      if (session) {
        const inputTokens = _toNumber(session.inputTokens)
        const outputTokens = _toNumber(session.outputTokens)
        const totalTokens = _toNumber(session.totalTokens) || (inputTokens + outputTokens)
        const costUsd = _toNumber(session.estimatedCostUsd)
        if (totalTokens > 0 || inputTokens > 0 || outputTokens > 0 || costUsd > 0) {
          const model = (typeof session.model === 'string' && session.model.trim()) ? session.model : 'unknown'
          return { inputTokens, outputTokens, totalTokens, model, costUsd, hasUsage: true }
        }
      }
    }
  } catch (err) {
    console.error('[chat-debug] sessions.list fallback failed:', err.message)
  }

  return direct
}

async function _trackChatToDb(payload, text) {
  if (!_insertMessage) return

  try {
    const usage = await _resolveUsage(payload)
    const agentId = sessionKey.split(':')[1] || 'unknown'
    const inputTokens = usage.inputTokens || 0
    const outputTokens = usage.outputTokens || 0
    const model = usage.model || 'unknown'
    const computedCost = _calculateCost ? _calculateCost(model, { inputTokens, outputTokens }) : 0
    const rawCost = usage.costUsd > 0 ? usage.costUsd : computedCost
    const roundedCost = Math.round(rawCost * 1_000_000) / 1_000_000
    const pairId = randomUUID()
    const source = `dashboard:${agentId}`

    _insertMessage({ ts: new Date().toISOString(), agentId, sessionKey,
      messageType: 'dashboard-chat', direction: 'request', channel: 'gateway-chat',
      content: message.slice(0, 10240), pairId })
    _insertMessage({ ts: new Date().toISOString(), agentId, sessionKey,
      messageType: 'dashboard-chat', direction: 'response', channel: 'gateway-chat',
      content: text.slice(0, 10240), ok: 1, model, inputTokens, outputTokens,
      totalTokens: usage.totalTokens || (inputTokens + outputTokens), cost: roundedCost,
      source, pairId })

    if (_insertCostEntry && (inputTokens > 0 || outputTokens > 0 || roundedCost > 0)) {
      _insertCostEntry({ ts: new Date().toISOString(), date: new Date().toISOString().slice(0, 10),
        model, inputTokens, outputTokens, cost: roundedCost,
        source, agentId })
    }
  } catch (err) {
    console.error('[gateway-chat] DB write failed:', err.message)
  }
}

ws.on('message', (data) => {
  let f
  try { f = JSON.parse(data.toString()) } catch { return }

  if (f.type === 'res' && pendingReq.has(f.id)) {
    const p = pendingReq.get(f.id)
    pendingReq.delete(f.id)
    clearTimeout(p.timeout)
    p.resolve(f)
    return
  }

  // Gateway 发起握手，收到 challenge 后才发送 connect
  if (f.type === 'event' && f.event === 'connect.challenge') {
    ws.send(CONNECT_FRAME)
    return
  }

  if (f.type === 'res' && f.id === 'c') {
    if (f.ok) {
      ws.send(JSON.stringify({
        type: 'req', id: 's', method: 'chat.send',
        params: { sessionKey, message, idempotencyKey: runId }
      }))
    } else {
      clearTimeout(timer)
      finish('error', { error: `Connect failed: ${f.error?.message}` })
    }
    return
  }

  if (f.type === 'res' && f.id === 's' && f.ok) {
    console.error('[chat-debug] chat.send ack:', JSON.stringify(f.payload))
    if (f.payload?.runId) runId = f.payload.runId
    return
  }

  if (f.type === 'res' && f.id === 's' && !f.ok) {
    clearTimeout(timer)
    finish('error', { error: `chat.send failed: ${f.error?.message}` })
    return
  }

  if (f.type === 'event' && f.event === 'chat') {
    const p = f.payload
    if (p) {
      console.error('[chat-debug]', JSON.stringify({
        runId: p.runId,
        expectedRunId: runId,
        sessionKey: p.sessionKey,
        expectedSessionKey: sessionKey,
        state: p.state,
        hasMessage: !!p.message,
        hasContent: !!p.message?.content,
        contentLength: p.message?.content?.length,
        text: p.message?.content?.[0]?.text?.slice(0, 80),
      }))
    }
    if (!p || (p.runId !== runId && p.sessionKey !== sessionKey)) return

    if (p.state === 'delta') {
      const text = p.message?.content
        ?.filter(b => b.type === 'text')
        ?.map(b => b.text || '')
        ?.join('') || ''
      if (text) {
        fullText = text
        emit('delta', { text })
      }
    } else if (p.state === 'final') {
      const text = p.message?.content
        ?.filter(b => b.type === 'text')
        ?.map(b => b.text || '')
        ?.join('') || fullText

      // Keep ws alive briefly for usage fallback queries, then emit final.
      Promise.resolve()
        .then(() => _trackChatToDb(p, text))
        .finally(() => {
          clearTimeout(timer)
          finish('final', { text, usage: p.usage })
        })
    } else if (p.state === 'error') {
      clearTimeout(timer)
      finish('error', { error: p.errorMessage || 'Agent error' })
    } else if (p.state === 'aborted') {
      clearTimeout(timer)
      finish('aborted', { text: fullText })
    }
  }
})

ws.on('error', (err) => {
  clearTimeout(timer)
  finish('error', { error: `WebSocket error: ${err.message}` })
})

ws.on('close', (code) => {
  clearTimeout(timer)
  finish('error', { error: `WebSocket closed (${code})` })
})
