#!/usr/bin/env node
/**
 * Department Loop — autonomous cycle engine for a single department
 *
 * Usage:
 *   node scripts/autopilot/department-loop.cjs --dept novel
 *   node scripts/autopilot/department-loop.cjs --dept novel --loop
 *   node scripts/autopilot/department-loop.cjs --dept novel --loop --interval 600
 */
const { writeFileSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')
const { DEPARTMENTS_DIR, DEFAULT_DEPT_INTERVAL_SEC, MAX_HISTORY_ENTRIES } = require('./constants.cjs')
const { loadDeptConfig, loadDeptState, saveDeptState } = require('./readers.cjs')
const { sendToAgent } = require('./gateway.cjs')
const { buildDepartmentDirective } = require('./dept-directive.cjs')
const { compressMemory } = require('./memory.cjs')
const { checkBudget, trackTokenUsage } = require('./budget.cjs')
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

      // Compress memory for department head
      try {
        compressMemory(config.head, result.text)
      } catch (e) {
        logger.debug('dept-loop', `Memory compression failed for ${config.head}`, e)
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

      return { ok: true, text: result.text }
    } else {
      logger.error('dept-loop', `Department ${deptId} cycle failed: ${result.error}`)
      state.status = 'error'
      state.lastCycleResult = `Error: ${result.error}`
      saveDeptState(deptId, state)
      return { ok: false, error: result.error }
    }
  } catch (err) {
    logger.error('dept-loop', `Department ${deptId} cycle error`, err)
    state.status = 'error'
    state.lastCycleResult = `Error: ${err.message}`
    saveDeptState(deptId, state)
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
      console.log(`\n⏳ Next cycle in ${intervalSec}s...\n`)
      const loop = async () => {
        await runDepartmentCycle(deptId)
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
