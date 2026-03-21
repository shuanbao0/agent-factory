/**
 * Gateway Client — 通过 openclaw CLI 调用内置 Gateway
 * 使用 --url + --token 直接指定内置 Gateway，避免连到本机默认 Gateway
 */
import { execFileSync, execFile } from 'child_process'
import { resolve } from 'path'
import { existsSync } from 'fs'
import core from '@/lib/core-bridge'

const PROJECT_ROOT = core.common.paths.PROJECT_ROOT
const GW_PORT = process.env.AGENT_FACTORY_PORT || '19100'
const GW_URL = `ws://127.0.0.1:${GW_PORT}`
const GW_TOKEN = process.env.AGENT_FACTORY_TOKEN || 'agent-factory-internal-token-2026'

function getOpenClawBin(): string {
  // Walk up from PROJECT_ROOT to find openclaw binary (supports npm workspaces hoisting)
  let dir = PROJECT_ROOT
  while (dir) {
    const bin = resolve(dir, 'node_modules/.bin/openclaw')
    if (existsSync(bin)) return bin
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return 'openclaw'
}

function buildArgs(method: string, params?: Record<string, unknown>, timeoutMs?: number) {
  const args = ['gateway', 'call', method, '--json', '--url', GW_URL, '--token', GW_TOKEN]
  if (timeoutMs) args.push('--timeout', String(timeoutMs))
  if (params) args.push('--params', JSON.stringify(params))
  return { bin: getOpenClawBin(), args }
}

function parseGwOutput(raw: string): unknown {
  const jsonStart = raw.search(/^[\[{]/m)
  if (jsonStart === -1) {
    const altStart = raw.indexOf('\n{')
    if (altStart === -1) throw new Error(`No JSON in gateway output: ${raw.slice(0, 200)}`)
    return JSON.parse(raw.slice(altStart))
  }
  return JSON.parse(raw.slice(jsonStart))
}

/** Synchronous gateway call */
export function gwCall(method: string, params?: Record<string, unknown>, timeoutMs = 15000): unknown {
  const { bin, args } = buildArgs(method, params, timeoutMs)
  const raw = execFileSync(bin, args, {
    timeout: timeoutMs + 5000, encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
  })
  return parseGwOutput(raw)
}

/** Async gateway call — runs in parallel, does not block the event loop */
export function gwCallAsync(method: string, params?: Record<string, unknown>, timeoutMs = 10000): Promise<unknown> {
  const { bin, args } = buildArgs(method, params, timeoutMs)
  return new Promise((resolve, reject) => {
    execFile(bin, args, {
      timeout: timeoutMs + 5000, encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
    }, (error, stdout) => {
      if (error) return reject(error)
      try { resolve(parseGwOutput(stdout)) } catch (e) { reject(e) }
    })
  })
}
