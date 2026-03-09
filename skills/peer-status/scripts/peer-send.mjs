#!/usr/bin/env node
/**
 * peer-send.mjs — Send cross-agent messages via Gateway WebSocket.
 *
 * Uses operator role + admin scope to bypass agent-level visibility
 * restrictions, enabling cross-agent communication while keeping
 * visibility="agent" as a hard constraint.
 *
 * Reference: ui/scripts/gateway-chat.js (WebSocket chat.send protocol)
 *
 * Usage:
 *   node skills/peer-status/scripts/peer-send.mjs \
 *     --from <agentId> --to <peerId> --message "text" \
 *     [--no-wait] [--timeout 120]
 *
 * Sync mode (default): waits for peer reply, outputs reply text to stdout.
 * Async mode (--no-wait): sends message, exits immediately with JSON confirmation.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { randomUUID } from 'crypto'
import { createRequire } from 'module'

// ── Resolve project root ─────────────────────────────────────────

function findProjectRoot() {
  let dir = resolve(new URL('.', import.meta.url).pathname)
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'config', 'openclaw.json'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  const cwd = process.cwd()
  if (existsSync(join(cwd, 'config', 'openclaw.json'))) return cwd
  throw new Error('Cannot find project root (config/openclaw.json not found)')
}

const PROJECT_ROOT = findProjectRoot()

// ── Load ws module from project node_modules ─────────────────────

const require = createRequire(join(PROJECT_ROOT, 'package.json'))
const WebSocket = require('ws')

// ── Gateway config ───────────────────────────────────────────────

function getGatewayConfig() {
  const cfgPath = join(PROJECT_ROOT, 'config', 'openclaw.json')
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
      return {
        port: parseInt(process.env.AGENT_FACTORY_PORT || '0') || cfg.gateway?.port || 19100,
        token: process.env.AGENT_FACTORY_TOKEN || cfg.gateway?.auth?.token || '',
      }
    } catch {}
  }
  return {
    port: parseInt(process.env.AGENT_FACTORY_PORT || '19100'),
    token: process.env.AGENT_FACTORY_TOKEN || 'agent-factory-internal-token-2026',
  }
}

// ── Parse CLI args ───────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  let from = null, to = null, message = null, noWait = false, timeout = 120

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--from':    from = args[++i]; break
      case '--to':      to = args[++i]; break
      case '--message': message = args[++i]; break
      case '--no-wait': noWait = true; break
      case '--timeout': timeout = parseInt(args[++i]) || 120; break
    }
  }

  if (!from || !to || !message) {
    console.error('Usage: node peer-send.mjs --from <agentId> --to <peerId> --message "text" [--no-wait] [--timeout 120]')
    process.exit(1)
  }

  return { from, to, message, noWait, timeout }
}

// ── Validate peer relationship ──────────────────────────────────

function validatePeer(from, to) {
  const agentJsonPath = join(PROJECT_ROOT, 'agents', from, 'agent.json')
  if (!existsSync(agentJsonPath)) {
    console.error(`ERROR: agent.json not found for "${from}": ${agentJsonPath}`)
    process.exit(1)
  }

  const config = JSON.parse(readFileSync(agentJsonPath, 'utf-8'))
  const peers = config.peers || []

  if (!peers.includes(to)) {
    console.error(`ERROR: "${to}" is not in "${from}"'s peers list.`)
    console.error(`Allowed peers: ${peers.join(', ') || '(none)'}`)
    process.exit(1)
  }

  // Get sender display name
  return config.name || from
}

// ── Get peer display name ────────────────────────────────────────

function getPeerName(peerId) {
  try {
    const peerJsonPath = join(PROJECT_ROOT, 'agents', peerId, 'agent.json')
    if (existsSync(peerJsonPath)) {
      const config = JSON.parse(readFileSync(peerJsonPath, 'utf-8'))
      return config.name || peerId
    }
  } catch {}
  return peerId
}

// ── Main ─────────────────────────────────────────────────────────

function main() {
  const { from, to, message, noWait, timeout } = parseArgs()
  const senderName = validatePeer(from, to)
  const gwConfig = getGatewayConfig()

  const sessionKey = `agent:${to}:main`
  let idempotencyKey = randomUUID()

  // Prepend sender identification header
  // In async (--no-wait) mode, add [async] tag so receiving agent knows to reply via peer-send
  const header = noWait
    ? `[Inter-Agent Message from: ${from} (${senderName})] [async — reply via peer-send]`
    : `[Inter-Agent Message from: ${from} (${senderName})]`
  const fullMessage = `${header}\n\n${message}`

  let resolved = false

  const finish = (output, exitCode = 0) => {
    if (resolved) return
    resolved = true
    if (typeof output === 'string') {
      process.stdout.write(output)
    } else {
      process.stdout.write(JSON.stringify(output))
    }
    try { ws.close() } catch {}
    process.exit(exitCode)
  }

  const timer = setTimeout(() => {
    finish(JSON.stringify({ ok: false, error: `Timeout after ${timeout}s` }), 1)
  }, timeout * 1000)

  // ── WebSocket connection ──────────────────────────────────────

  const CONNECT_FRAME = JSON.stringify({
    type: 'req', id: 'c', method: 'connect',
    params: {
      minProtocol: 3, maxProtocol: 3,
      client: { id: 'openclaw-control-ui', mode: 'backend', version: '1.0.0', platform: process.platform },
      caps: [],
      auth: { token: gwConfig.token },
      role: 'operator',
      scopes: ['operator.admin', 'operator.read', 'operator.write'],
    }
  })

  const ws = new WebSocket(`ws://127.0.0.1:${gwConfig.port}`, {
    headers: { Origin: `http://127.0.0.1:${gwConfig.port}` }
  })

  let fullText = ''

  ws.on('message', (data) => {
    let f
    try { f = JSON.parse(data.toString()) } catch { return }

    // Gateway handshake: wait for challenge then send connect
    if (f.type === 'event' && f.event === 'connect.challenge') {
      ws.send(CONNECT_FRAME)
      return
    }

    // Connect response
    if (f.type === 'res' && f.id === 'c') {
      if (f.ok) {
        // Send the chat message
        ws.send(JSON.stringify({
          type: 'req', id: 's', method: 'chat.send',
          params: { sessionKey, message: fullMessage, idempotencyKey }
        }))

        // In no-wait mode, exit after send acknowledgement will come next
        if (noWait) {
          // We still wait for the chat.send response to confirm delivery
        }
      } else {
        clearTimeout(timer)
        finish(JSON.stringify({ ok: false, error: `Connect failed: ${f.error?.message}` }), 1)
      }
      return
    }

    // chat.send response
    if (f.type === 'res' && f.id === 's') {
      if (f.ok && f.payload?.runId) idempotencyKey = f.payload.runId
      if (!f.ok) {
        clearTimeout(timer)
        finish(JSON.stringify({ ok: false, error: `chat.send failed: ${f.error?.message}` }), 1)
        return
      }

      // In no-wait mode, confirm and exit
      if (noWait) {
        clearTimeout(timer)
        finish(JSON.stringify({ ok: true, sessionKey, idempotencyKey }))
        return
      }
      // Sync mode: wait for chat events
      return
    }

    // Chat events (sync mode only)
    if (f.type === 'event' && f.event === 'chat') {
      const p = f.payload
      if (!p || p.runId !== idempotencyKey) return

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
        clearTimeout(timer)
        finish(text + '\n')
      } else if (p.state === 'error') {
        clearTimeout(timer)
        finish(JSON.stringify({ ok: false, error: p.errorMessage || 'Agent error' }), 1)
      } else if (p.state === 'aborted') {
        clearTimeout(timer)
        finish(fullText + '\n')
      }
    }
  })

  ws.on('error', (err) => {
    clearTimeout(timer)
    finish(JSON.stringify({ ok: false, error: `WebSocket error: ${err.message}` }), 1)
  })

  ws.on('close', (code) => {
    clearTimeout(timer)
    if (!resolved) {
      finish(JSON.stringify({ ok: false, error: `WebSocket closed (${code})` }), 1)
    }
  })
}

main()
