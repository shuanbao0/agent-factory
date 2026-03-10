#!/usr/bin/env node
/**
 * Department Loop — autonomous cycle engine for a single department
 *
 * Usage:
 *   node scripts/autopilot/department-loop.cjs --dept novel
 *   node scripts/autopilot/department-loop.cjs --dept novel --loop
 *   node scripts/autopilot/department-loop.cjs --dept novel --loop --interval 600
 */
const { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } = require('fs')
const { join } = require('path')
const {
  DEPARTMENTS_DIR, DEFAULT_DEPT_INTERVAL_SEC, MAX_HISTORY_ENTRIES,
  COMPACT_TOKEN_RATIO, DEFAULT_CONTEXT_TOKENS, HEALTH_CHECK_INTERVAL,
  SESSIONS_DIR,
} = require('./constants.cjs')
const { loadDeptConfig, loadDeptState, saveDeptState, getSessionTokenInfo } = require('./readers.cjs')
const { sendToAgent, compactSession, killSession } = require('./gateway.cjs')
const { buildDepartmentDirective } = require('./dept-directive.cjs')
const { compressMemoryByRole } = require('./memory.cjs')
const { checkBudget, trackTokenUsage } = require('./budget.cjs')
const { createCycleTask, completeCycleTask } = require('./task-bridge.cjs')
const logger = require('./logger.cjs')

/**
 * Run a single department cycle.
 *
 * @param {string} deptId - Department ID (e.g. 'novel')
 * @returns {Promise<{ok: boolean, text?: string, error?: string}>}
 */
async function runDepartmentCycle(deptId) {
  const config = loadDeptConfig(deptId)
  if (!config) {
    logger.error('dept-loop', `No config found for department ${deptId}`)
    return { ok: false, error: 'No config' }
  }

  const state = loadDeptState(deptId)

  // Check budget
  const budget = checkBudget(deptId)
  if (!budget.allowed) {
    logger.warn('dept-loop', `Department ${deptId} over budget, skipping cycle: ${budget.reason}`)
    return { ok: false, error: budget.reason }
  }
  if (budget.warning) {
    logger.warn('dept-loop', `Department ${deptId} approaching budget limit`)
  }

  // Concurrency guard
  if (state.status === 'cycling') {
    logger.warn('dept-loop', `Department ${deptId} already cycling, skipping`)
    return { ok: false, error: 'Already cycling' }
  }

  state.cycleCount = (state.cycleCount || 0) + 1
  state.status = 'cycling'
  state.lastCycleAt = new Date().toISOString()
  saveDeptState(deptId, state)

  const startTime = Date.now()
  logger.info('dept-loop', `Department ${deptId} cycle #${state.cycleCount} started`)

  const taskId = await createCycleTask(config.head, `dept-${deptId}-cycle`, state.cycleCount)

  try {
    // Build directive for department head
    const directive = buildDepartmentDirective(deptId, config, state)

    // Send to department head
    const sessionKey = `agent:${config.head}:dept-autopilot`
    const result = await sendToAgent(config.head, sessionKey, directive)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.ok) {
      logger.info('dept-loop', `Department ${deptId} cycle #${state.cycleCount} completed in ${elapsed}s`)

      // Generate department report
      generateDepartmentReport(deptId, result.text)

      // Track token usage
      if (result.usage) {
        trackTokenUsage(deptId, result.usage)
      }

      // Compress memory for department head (role-aware)
      try {
        compressMemoryByRole(config.head, result.text, 'leader')
      } catch (e) {
        logger.debug('dept-loop', `Memory compression failed for ${config.head}`, e)
      }

      // Periodic health check: compact oversized sessions + save member memories
      if (state.cycleCount % HEALTH_CHECK_INTERVAL === 0) {
        await runHealthCheck(deptId, config, result.text)
      }

      // Update state
      state.status = 'idle'
      state.lastCycleResult = result.text.slice(0, 500)
      state.history = state.history || []
      state.history.push({
        cycle: state.cycleCount,
        startedAt: state.lastCycleAt,
        completedAt: new Date().toISOString(),
        elapsedSec: parseFloat(elapsed),
        result: result.text.slice(0, 300),
      })
      if (state.history.length > MAX_HISTORY_ENTRIES) {
        state.history = state.history.slice(-MAX_HISTORY_ENTRIES)
      }
      saveDeptState(deptId, state)

      await completeCycleTask(config.head, taskId, result)
      return { ok: true, text: result.text }
    } else {
      logger.error('dept-loop', `Department ${deptId} cycle failed: ${result.error}`)
      state.status = 'error'
      state.lastCycleResult = `Error: ${result.error}`
      saveDeptState(deptId, state)
      await completeCycleTask(config.head, taskId, result)
      return { ok: false, error: result.error }
    }
  } catch (err) {
    logger.error('dept-loop', `Department ${deptId} cycle error`, err)
    state.status = 'error'
    state.lastCycleResult = `Error: ${err.message}`
    saveDeptState(deptId, state)
    await completeCycleTask(config.head, taskId, { ok: false, error: err.message })
    return { ok: false, error: err.message }
  }
}

/**
 * Generate a department report from the head's response.
 */
function generateDepartmentReport(deptId, responseText) {
  const deptDir = join(DEPARTMENTS_DIR, deptId)
  if (!existsSync(deptDir)) mkdirSync(deptDir, { recursive: true })
  const reportPath = join(deptDir, 'report.md')
  const timestamp = new Date().toISOString()

  const report = `# ${deptId} Department Report\n\nGenerated: ${timestamp}\n\n${responseText.slice(0, 3000)}\n`

  try {
    writeFileSync(reportPath, report)
    logger.debug('dept-loop', `Report generated for ${deptId}`)
  } catch (err) {
    logger.error('dept-loop', `Failed to write report for ${deptId}`, err)
  }
}

/**
 * Periodic health check: compact oversized sessions + save team member memories.
 *
 * @param {string} deptId
 * @param {object} config - Department config
 * @param {string} headResponse - Latest head response (for context)
 */
async function runHealthCheck(deptId, config, headResponse) {
  const agents = config.agents || []
  const compactThreshold = DEFAULT_CONTEXT_TOKENS * COMPACT_TOKEN_RATIO

  logger.info('dept-loop', `Running health check for ${deptId} (${agents.length} agents)`)

  for (const agentId of agents) {
    // Save member memories (not the head — head is handled above)
    if (agentId !== config.head) {
      try {
        // Read last response from the agent's session (we use the head's response as context
        // since we don't have direct access to the member's last response from here)
        compressMemoryByRole(agentId, null, 'member')
      } catch (e) {
        logger.debug('dept-loop', `Member memory save skipped for ${agentId} (no response)`, e)
      }
    }

    // Check main session
    const mainKey = `agent:${agentId}:main`
    const mainInfo = getSessionTokenInfo(agentId, mainKey)
    if (mainInfo && mainInfo.totalTokens > compactThreshold) {
      try {
        const res = await compactSession(mainKey)
        if (res.ok) {
          logger.info('dept-loop', `Compacted ${mainKey} (was ${mainInfo.totalTokens} tokens)`)
        } else {
          logger.warn('dept-loop', `Compact failed for ${mainKey}: ${res.error}`)
        }
      } catch (e) {
        logger.debug('dept-loop', `Compact error for ${mainKey}`, e)
      }
    }

    // Check dept-autopilot session for the head
    if (agentId === config.head) {
      const headKey = `agent:${agentId}:dept-autopilot`
      const headInfo = getSessionTokenInfo(agentId, headKey)
      if (headInfo && headInfo.totalTokens > compactThreshold) {
        try {
          const res = await compactSession(headKey)
          if (res.ok) {
            logger.info('dept-loop', `Compacted ${headKey} (was ${headInfo.totalTokens} tokens)`)
          } else {
            logger.warn('dept-loop', `Compact failed for ${headKey}: ${res.error}`)
          }
        } catch (e) {
          logger.debug('dept-loop', `Compact error for ${headKey}`, e)
        }
      }
    }
  }

  // Clean up stale sessions (inactive > 14 days, non-:main)
  await cleanStaleSessions(14)
}

/**
 * Kill sessions that have been inactive for more than maxDays days.
 * Skips :main sessions (primary agent sessions).
 */
async function cleanStaleSessions(maxDays = 14) {
  const cutoff = Date.now() - maxDays * 86400_000
  let cleaned = 0

  try {
    if (!existsSync(SESSIONS_DIR)) return
    const agentDirs = readdirSync(SESSIONS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())

    for (const dir of agentDirs) {
      const sessFile = join(SESSIONS_DIR, dir.name, 'sessions', 'sessions.json')
      if (!existsSync(sessFile)) continue

      try {
        const sessions = JSON.parse(readFileSync(sessFile, 'utf-8'))
        for (const [key, sess] of Object.entries(sessions)) {
          if (!sess || typeof sess !== 'object') continue
          if (key.endsWith(':main')) continue
          const updatedAt = sess.updatedAt || 0
          if (updatedAt > 0 && updatedAt < cutoff) {
            try {
              await killSession(key)
              cleaned++
              logger.debug('dept-loop', `Cleaned stale session ${key} (inactive ${Math.round((Date.now() - updatedAt) / 86400_000)}d)`)
            } catch (e) {
              logger.debug('dept-loop', `Failed to kill stale session ${key}`, e)
            }
          }
        }
      } catch { /* skip */ }
    }
  } catch (e) {
    logger.debug('dept-loop', 'Stale session cleanup error', e)
  }

  if (cleaned > 0) {
    logger.info('dept-loop', `Cleaned ${cleaned} stale sessions`)
  }
}

// ── CLI mode ────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2)
  const deptIdx = args.indexOf('--dept')
  const deptId = deptIdx >= 0 ? args[deptIdx + 1] : null
  const isLoop = args.includes('--loop')
  const intervalIdx = args.indexOf('--interval')
  const intervalSec = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1]) || DEFAULT_DEPT_INTERVAL_SEC : DEFAULT_DEPT_INTERVAL_SEC

  if (!deptId) {
    console.error('Usage: node department-loop.cjs --dept <deptId> [--loop] [--interval <seconds>]')
    process.exit(1)
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log(`\n🛑 Department ${deptId} loop shutting down...`)
    const state = loadDeptState(deptId)
    state.status = 'stopped'
    state.pid = null
    saveDeptState(deptId, state)
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  async function run() {
    // Store PID
    const state = loadDeptState(deptId)
    state.pid = process.pid
    state.status = isLoop ? 'running' : 'idle'
    saveDeptState(deptId, state)

    console.log(`🏭 Department ${deptId} ${isLoop ? 'loop' : 'single cycle'} mode (PID: ${process.pid})`)

    await runDepartmentCycle(deptId)

    if (isLoop) {
      // Restore running status after cycle (runDepartmentCycle sets idle/error)
      const restoreRunning = () => {
        const s = loadDeptState(deptId)
        if (s.status !== 'stopped') {
          s.status = 'running'
          saveDeptState(deptId, s)
        }
      }
      restoreRunning()
      console.log(`\n⏳ Next cycle in ${intervalSec}s...\n`)
      const loop = async () => {
        await runDepartmentCycle(deptId)
        restoreRunning()
        console.log(`\n⏳ Next cycle in ${intervalSec}s...\n`)
        setTimeout(loop, intervalSec * 1000)
      }
      setTimeout(loop, intervalSec * 1000)
    } else {
      const s = loadDeptState(deptId)
      s.status = 'stopped'
      s.pid = null
      saveDeptState(deptId, s)
    }
  }

  run().catch(err => {
    logger.error('dept-loop', 'Fatal error', err)
    process.exit(1)
  })
}

module.exports = { runDepartmentCycle, generateDepartmentReport }
