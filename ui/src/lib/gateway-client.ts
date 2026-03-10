/**
 * Gateway Client — 通过 openclaw CLI 调用内置 Gateway
 * 使用 --url + --token 直接指定内置 Gateway，避免连到本机默认 Gateway
 */
import { execSync, exec } from 'child_process'
import { resolve } from 'path'
import { existsSync } from 'fs'

const PROJECT_ROOT = resolve(process.cwd(), '..')
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

function buildCmd(method: string, params?: Record<string, unknown>): string {
  const bin = getOpenClawBin()
  const paramsArg = params ? ` --params '${JSON.stringify(params)}'` : ''
  return `${bin} gateway call ${method} --json --url ${GW_URL} --token ${GW_TOKEN}${paramsArg}`
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
  const raw = execSync(buildCmd(method, params), {
    timeout: timeoutMs, encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' },
  })
  return parseGwOutput(raw)
}

/** Async gateway call — runs in parallel, does not block the event loop */
export function gwCallAsync(method: string, params?: Record<string, unknown>, timeoutMs = 10000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    exec(buildCmd(method, params), {
      timeout: timeoutMs, encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' },
    }, (error, stdout) => {
      if (error) return reject(error)
      try { resolve(parseGwOutput(stdout)) } catch (e) { reject(e) }
    })
  })
}
