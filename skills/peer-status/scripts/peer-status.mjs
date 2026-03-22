#!/usr/bin/env node
/**
 * peer-status.mjs — Query peer agent online/busy status via Gateway API.
 *
 * Replicates the same logic used by the Dashboard frontend
 * (ui/src/lib/data-fetchers.ts:50-112) but runs as a standalone script
 * that agents can execute.
 *
 * Usage:
 *   node skills/peer-status/scripts/peer-status.mjs --agent-id <id>
 *
 * Output: JSON array of { id, name, status, updatedAt } for each peer.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'

// ── Constants ────────────────────────────────────────────────────

const BUSY_THRESHOLD_MS = 300_000 // 5 minutes, same as frontend

// ── Resolve project root ─────────────────────────────────────────

function findProjectRoot() {
  // Walk up from script location to find package.json with name "agent-factory"
  let dir = resolve(new URL('.', import.meta.url).pathname)
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'data', 'config', 'openclaw.json'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  // Fallback: common paths
  const cwd = process.cwd()
  if (existsSync(join(cwd, 'data', 'config', 'openclaw.json'))) return cwd
  throw new Error('Cannot find project root (data/config/openclaw.json not found)')
}

const PROJECT_ROOT = findProjectRoot()

// ── Gateway CLI helpers ──────────────────────────────────────────

function getOpenClawBin() {
  const localBin = join(PROJECT_ROOT, 'node_modules', '.bin', 'openclaw')
  if (existsSync(localBin)) return localBin
  return 'openclaw'
}

function gwCall(method, params) {
  const bin = getOpenClawBin()
  const port = process.env.AGENT_FACTORY_PORT || '19100'
  const url = `ws://127.0.0.1:${port}`
  const token = process.env.AGENT_FACTORY_TOKEN || 'agent-factory-internal-token-2026'

  const paramsArg = params ? ` --params '${JSON.stringify(params)}'` : ''
  const cmd = `${bin} gateway call ${method} --json --url ${url} --token ${token}${paramsArg}`

  const raw = execSync(cmd, {
    timeout: 15000,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  })

  // Parse JSON from output (skip any non-JSON prefix lines)
  const jsonStart = raw.search(/^[\[{]/m)
  if (jsonStart === -1) {
    const altStart = raw.indexOf('\n{')
    if (altStart === -1) throw new Error(`No JSON in gateway output: ${raw.slice(0, 200)}`)
    return JSON.parse(raw.slice(altStart))
  }
  return JSON.parse(raw.slice(jsonStart))
}

// ── Parse CLI args ───────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  let agentId = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent-id' && args[i + 1]) {
      agentId = args[i + 1]
      i++
    }
  }
  if (!agentId) {
    console.error('Usage: node peer-status.mjs --agent-id <your-agent-id>')
    process.exit(1)
  }
  return { agentId }
}

// ── Main ─────────────────────────────────────────────────────────

function main() {
  const { agentId } = parseArgs()

  // 1. Read agent.json to get peers list
  const agentJsonPath = join(PROJECT_ROOT, 'data', 'agents', agentId, 'agent.json')
  if (!existsSync(agentJsonPath)) {
    console.error(`agent.json not found: ${agentJsonPath}`)
    process.exit(1)
  }
  const agentConfig = JSON.parse(readFileSync(agentJsonPath, 'utf-8'))
  const peers = agentConfig.peers || []

  if (peers.length === 0) {
    console.log(JSON.stringify([]))
    return
  }

  // 2. Query Gateway for all registered agents
  const agentsResult = gwCall('agents.list')
  const registeredAgents = new Map()
  for (const a of agentsResult.agents || []) {
    registeredAgents.set(a.id, a)
  }

  // 3. Query Gateway for active sessions
  const busyAgentIds = new Map() // agentId -> updatedAt
  try {
    const sessResult = gwCall('sessions.list', { limit: 50 })
    const now = Date.now()
    for (const s of sessResult.sessions || []) {
      if (!s.updatedAt) continue
      if (now - s.updatedAt < BUSY_THRESHOLD_MS) {
        const parts = s.key.split(':')
        if (parts[0] === 'agent' && parts[1]) {
          busyAgentIds.set(parts[1], s.updatedAt)
        }
      }
    }
  } catch {
    // sessions.list may not be available; continue with all online
  }

  // 4. Read peer agent.json for name info and cross-reference
  const result = []
  for (const peerId of peers) {
    const peerJsonPath = join(PROJECT_ROOT, 'data', 'agents', peerId, 'agent.json')
    let peerName = peerId
    try {
      if (existsSync(peerJsonPath)) {
        const peerConfig = JSON.parse(readFileSync(peerJsonPath, 'utf-8'))
        peerName = peerConfig.name || peerId
      }
    } catch { /* use id as name */ }

    // Only include peers that are registered in Gateway
    if (!registeredAgents.has(peerId)) continue

    const isBusy = busyAgentIds.has(peerId)
    const updatedAt = busyAgentIds.get(peerId)

    result.push({
      id: peerId,
      name: peerName,
      status: isBusy ? 'busy' : 'online',
      updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
    })
  }

  console.log(JSON.stringify(result, null, 2))
}

main()
