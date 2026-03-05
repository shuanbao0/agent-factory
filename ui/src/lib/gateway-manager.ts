/**
 * Gateway process manager — starts/stops the internal OpenClaw Gateway.
 * Singleton: only one gateway process at a time.
 */
import { spawn, ChildProcess } from 'child_process'
import { resolve, join } from 'path'
import { existsSync, readFileSync, copyFileSync, readdirSync, writeFileSync } from 'fs'
import net from 'net'

const PROJECT_ROOT = resolve(process.cwd(), '..')

function findOpenClawBin(): string | null {
  let dir = PROJECT_ROOT
  while (dir) {
    const bin = resolve(dir, 'node_modules/.bin/openclaw')
    if (existsSync(bin)) return bin
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}
const GW_PORT = parseInt(process.env.AGENT_FACTORY_PORT || '19100')
const STATE_DIR = resolve(PROJECT_ROOT, '.openclaw-state')
const CONFIG_PATH = resolve(PROJECT_ROOT, 'config/openclaw.json')
const CONFIG_DEFAULT_PATH = resolve(PROJECT_ROOT, 'config/openclaw.default.json')

/** Copy from .default.json template if runtime config doesn't exist */
function ensureConfig() {
  if (!existsSync(CONFIG_PATH) && existsSync(CONFIG_DEFAULT_PATH)) {
    copyFileSync(CONFIG_DEFAULT_PATH, CONFIG_PATH)
  }
}

export type GatewayStatus = 'running' | 'stopped' | 'starting' | 'no-key' | 'error'

let gatewayProc: ChildProcess | null = null
let currentStatus: GatewayStatus = 'stopped'
let lastError: string | null = null

function loadEnv(): Record<string, string> {
  const envPath = resolve(PROJECT_ROOT, '.env')
  const vars: Record<string, string> = {}
  if (!existsSync(envPath)) return vars
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
  return vars
}

function hasAuthProfiles(): boolean {
  const authPath = resolve(STATE_DIR, 'agents/main/agent/auth-profiles.json')
  if (!existsSync(authPath)) return false
  try {
    const data = JSON.parse(readFileSync(authPath, 'utf-8'))
    return Object.keys(data.profiles || {}).length > 0
  } catch { return false }
}

function hasAnyApiKey(): boolean {
  const env = { ...process.env, ...loadEnv() }

  // Check all providers configured in models.json
  const modelsPath = resolve(PROJECT_ROOT, 'config/models.json')
  if (existsSync(modelsPath)) {
    try {
      const modelsConfig = JSON.parse(readFileSync(modelsPath, 'utf-8'))
      for (const provider of Object.values(modelsConfig.providers || {})) {
        const p = provider as { apiKey?: string }
        if (!p.apiKey) continue
        // Resolve env var references like ${VAR_NAME}
        const resolved = p.apiKey.replace(/\$\{(\w+)\}/g, (_, name) => env[name] || '')
        if (resolved) return true
      }
    } catch { /* ignore */ }
  }

  return hasAuthProfiles()
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(2000)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
    socket.connect(port, '127.0.0.1')
  })
}

export async function getStatus(): Promise<{ status: GatewayStatus; port: number; error?: string; hasKeys: boolean }> {
  const hasKeys = hasAnyApiKey()

  // Check if port is actually open (covers externally started gateway)
  const portOpen = await isPortOpen(GW_PORT)
  if (portOpen) {
    currentStatus = 'running'
    return { status: 'running', port: GW_PORT, hasKeys }
  }

  if (!hasKeys) {
    currentStatus = 'no-key'
    return { status: 'no-key', port: GW_PORT, hasKeys }
  }

  if (gatewayProc && !gatewayProc.killed) {
    return { status: 'starting', port: GW_PORT, hasKeys }
  }

  return { status: currentStatus === 'error' ? 'error' : 'stopped', port: GW_PORT, error: lastError ?? undefined, hasKeys }
}

/** Ensure all existing agents have peer-status in their skills list */
function ensureAgentsPeerStatus() {
  const agentsDir = join(PROJECT_ROOT, 'agents')
  if (!existsSync(agentsDir)) return
  try {
    const dirs = readdirSync(agentsDir).filter(d =>
      existsSync(join(agentsDir, d, 'agent.json'))
    )
    for (const d of dirs) {
      const fp = join(agentsDir, d, 'agent.json')
      try {
        const data = JSON.parse(readFileSync(fp, 'utf-8'))
        const skills: string[] = data.skills || []
        if (!skills.includes('peer-status')) {
          data.skills = [...skills, 'peer-status']
          data.updatedAt = new Date().toISOString()
          writeFileSync(fp, JSON.stringify(data, null, 2) + '\n')
        }
      } catch { /* skip malformed agent.json */ }
    }
  } catch { /* skip if agents dir unreadable */ }
}

export async function startGateway(): Promise<{ ok: boolean; error?: string }> {
  if (await isPortOpen(GW_PORT)) {
    currentStatus = 'running'
    return { ok: true }
  }

  if (!hasAnyApiKey()) {
    return { ok: false, error: 'No API keys configured. Add at least one provider key.' }
  }

  const openclawBin = findOpenClawBin()
  if (!openclawBin) {
    return { ok: false, error: 'OpenClaw binary not found. Run npm install.' }
  }

  currentStatus = 'starting'
  lastError = null
  ensureConfig()
  ensureAgentsPeerStatus()

  const envVars = loadEnv()

  gatewayProc = spawn(openclawBin, ['gateway', '--port', String(GW_PORT), '--force'], {
    env: { ...process.env, ...envVars, OPENCLAW_STATE_DIR: STATE_DIR, OPENCLAW_CONFIG_PATH: CONFIG_PATH },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  let stderrBuf = ''
  gatewayProc.stderr?.on('data', (d) => { stderrBuf += d.toString() })
  gatewayProc.stdout?.on('data', () => {})

  // Race: port becomes ready vs process exits vs timeout
  const result = await new Promise<{ ready: boolean; exitCode?: number | null }>((resolve) => {
    let settled = false

    // 1) Process exits early — stop waiting immediately
    gatewayProc!.on('exit', (code) => {
      if (!settled) {
        settled = true
        resolve({ ready: false, exitCode: code })
      }
    })

    // 2) Poll for port readiness
    const start = Date.now()
    function attempt() {
      if (settled) return
      if (Date.now() - start > 30000) {
        settled = true
        return resolve({ ready: false })
      }
      const socket = new net.Socket()
      socket.setTimeout(1000)
      socket.once('connect', () => {
        socket.destroy()
        if (!settled) { settled = true; resolve({ ready: true }) }
      })
      socket.once('error', () => { socket.destroy(); if (!settled) setTimeout(attempt, 500) })
      socket.once('timeout', () => { socket.destroy(); if (!settled) setTimeout(attempt, 500) })
      socket.connect(GW_PORT, '127.0.0.1')
    }
    attempt()
  })

  // Maintain exit handler for runtime crashes after startup
  gatewayProc?.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      currentStatus = 'error'
      lastError = stderrBuf.slice(-500) || `Exited with code ${code}`
    } else {
      currentStatus = 'stopped'
    }
    gatewayProc = null
  })

  if (result.ready) {
    currentStatus = 'running'
    return { ok: true }
  }

  currentStatus = 'error'
  if (result.exitCode !== undefined) {
    lastError = stderrBuf.slice(-500) || `Process exited with code ${result.exitCode}`
  } else {
    lastError = stderrBuf.slice(-500) || 'Gateway failed to start within timeout'
  }
  return { ok: false, error: lastError }
}

export async function stopGateway(): Promise<{ ok: boolean; error?: string }> {
  // 1) Try killing the managed child process
  if (gatewayProc && !gatewayProc.killed) {
    try {
      gatewayProc.kill('SIGTERM')
    } catch {
      // Process might have already exited between the check and kill call
    }
    await new Promise(r => setTimeout(r, 1000))
    gatewayProc = null
  }

  // 2) If port is still open, kill whatever process holds it (externally started gateway)
  if (await isPortOpen(GW_PORT)) {
    try {
      const { execSync } = await import('child_process')
      const pids = execSync(`lsof -ti:${GW_PORT}`, { encoding: 'utf-8' }).trim()
      if (pids) {
        for (const pid of pids.split('\n')) {
          try { process.kill(parseInt(pid), 'SIGTERM') } catch { /* already gone */ }
        }
        // Wait for process to release the port
        await new Promise(r => setTimeout(r, 1500))
      }
    } catch {
      // lsof not available or no process found
    }
  }

  // 3) Verify port is actually closed
  if (await isPortOpen(GW_PORT)) {
    currentStatus = 'running'
    return { ok: false, error: 'Failed to stop gateway — port still in use' }
  }

  currentStatus = 'stopped'
  return { ok: true }
}

export async function restartGateway(): Promise<{ ok: boolean; error?: string }> {
  await stopGateway()
  await new Promise(r => setTimeout(r, 500))
  return startGateway()
}
