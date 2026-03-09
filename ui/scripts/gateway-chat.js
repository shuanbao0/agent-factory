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

  // 2. 尝试从项目配置文件读取
  const factoryDir = process.env.AGENT_FACTORY_DIR || resolve(__dirname, '../..')
  const projectCfg = resolve(factoryDir, 'config/openclaw.json')
  if (existsSync(projectCfg)) {
    try {
      const cfg = JSON.parse(readFileSync(projectCfg, 'utf-8'))
      return {
        port: envPort || cfg.gateway?.port || 19100,
        token: envToken || cfg.gateway?.auth?.token || '',
      }
    } catch {}
  }

  // 3. fallback 到环境变量或默认值
  return { port: envPort || 19100, token: envToken }
}

const config = getConfig()
let runId = randomUUID()
let fullText = ''
let resolved = false

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

ws.on('message', (data) => {
  let f
  try { f = JSON.parse(data.toString()) } catch { return }

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
    if (!p || p.runId !== runId) return

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
      clearTimeout(timer)
      finish('final', { text, usage: p.usage })
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
