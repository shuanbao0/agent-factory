'use strict'
const { readFileSync } = require('fs')
const { join } = require('path')
const http = require('http')

const ROOT = join(__dirname, '..', '..', '..')
const DEFAULT_MODEL = 'minimax/MiniMax-M2.5-Lightning'

/**
 * Parse .env file manually (no dotenv dependency).
 * Returns a key→value map.
 */
function parseEnv() {
  try {
    const text = readFileSync(join(ROOT, '.env'), 'utf8')
    const env = {}
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      // strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      env[key] = val
    }
    return env
  } catch { return {} }
}

/**
 * Determine whether E2E tests should be skipped.
 * @returns {{ skip: boolean, reason: string }}
 */
function shouldSkip() {
  if (!process.env.TEST_LLM) {
    return { skip: true, reason: 'TEST_LLM env not set — skipping E2E LLM tests' }
  }
  const env = parseEnv()
  const key = process.env.MINIMAX_API_KEY || env.MINIMAX_API_KEY
  if (!key) {
    return { skip: true, reason: 'MINIMAX_API_KEY not found — skipping E2E LLM tests' }
  }
  return { skip: false, reason: '' }
}

/**
 * Read Gateway port from openclaw.json.
 */
function getGatewayPort() {
  try {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'config', 'openclaw.json'), 'utf8'))
    return cfg.gateway?.port || 19100
  } catch { return 19100 }
}

/**
 * Check if Gateway is running by hitting its health endpoint.
 * @returns {Promise<boolean>}
 */
function isGatewayRunning() {
  const port = getGatewayPort()
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 3000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

/**
 * Get registered agent IDs from openclaw.json.
 * @returns {string[]}
 */
function getRegisteredAgents() {
  try {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'config', 'openclaw.json'), 'utf8'))
    return (cfg.agents?.list || []).map(a => a.id).filter(Boolean)
  } catch { return [] }
}

/**
 * Check if all required agent IDs are registered in openclaw.json.
 * @param {string[]} requiredIds
 * @returns {boolean}
 */
function hasRegisteredAgents(requiredIds) {
  const all = getRegisteredAgents()
  return requiredIds.every(id => all.includes(id))
}

module.exports = {
  shouldSkip,
  isGatewayRunning,
  getRegisteredAgents,
  hasRegisteredAgents,
  getGatewayPort,
  parseEnv,
  DEFAULT_MODEL,
  ROOT,
}
