#!/usr/bin/env node
/**
 * Autopilot — 公司自主运营循环引擎（模块化版本）
 *
 * Usage:
 *   node scripts/autopilot/index.cjs                         # 运行一个循环
 *   node scripts/autopilot/index.cjs --loop                  # 持续循环模式
 *   node scripts/autopilot/index.cjs --loop --interval 1800  # 每 30 分钟循环
 *   node scripts/autopilot/index.cjs --stop                  # 停止运行中的循环
 *   node scripts/autopilot/index.cjs --all                   # 启动全部循环（CEO + 部门循环）
 */
const { existsSync, readdirSync, readFileSync } = require('fs')
const { join } = require('path')
const {
  DEFAULT_INTERVAL_SEC, MAX_HISTORY_ENTRIES, MAX_CYCLE_RESULT_LENGTH, MAX_HISTORY_RESULT_LENGTH,
  DEPARTMENTS_DIR, AGENTS_DIR,
  CEO_COORDINATION_INTERVAL_SEC, CEO_STRATEGY_INTERVAL_SEC, DEFAULT_DEPT_INTERVAL_SEC,
} = require('./constants.cjs')
const { loadState, saveState } = require('./state.cjs')
const { sendToCeo } = require('./gateway.cjs')
const { fetchSessionTokens } = require('./readers.cjs')
const { buildDirective } = require('./directive.cjs')
const { syncProjects } = require('./sync.cjs')
const { buildMemoryContext, compressMemory } = require('./memory.cjs')
const { runDepartmentCycle } = require('./department-loop.cjs')
const { createCycleTask, completeCycleTask } = require('./task-bridge.cjs')
const logger = require('./logger.cjs')

const MAX_HISTORY = 50

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

async function killExistingAutopilot() {
  const state = loadState()
  if (state.pid && state.pid !== process.pid && isProcessAlive(state.pid)) {
    logger.warn('main', `Killing existing autopilot (PID ${state.pid})`)
    try { process.kill(state.pid, 'SIGTERM') } catch {}
    await new Promise(r => setTimeout(r, 2000))
  }
}

// ── Parse CLI args ──────────────────────────────────────────────
const args = process.argv.slice(2)
const isLoop = args.includes('--loop')
const isStop = args.includes('--stop')
const isAll = args.includes('--all')
const intervalIdx = args.indexOf('--interval')
const intervalSec = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1]) || DEFAULT_INTERVAL_SEC : DEFAULT_INTERVAL_SEC

// ── Handle --stop ───────────────────────────────────────────────
if (isStop) {
  const state = loadState()
  if (state.pid) {
    try { process.kill(state.pid, 'SIGTERM') } catch (err) {
      logger.warn('main', `Failed to kill PID ${state.pid}`, err)
    }
    console.log(`Stopped autopilot (PID ${state.pid})`)
  }
  state.status = 'stopped'
  state.pid = null
  saveState(state)
  process.exit(0)
}

// ── Handle --all ────────────────────────────────────────────────
if (isAll) {
  startAll().catch(err => {
    logger.error('main', 'Start-all failed', err)
    process.exit(1)
  })
} else {
  // Standard CEO-only mode
  main().catch(err => {
    logger.error('main', 'Fatal error', err)
    process.exit(1)
  })
}

// ── Run one cycle ───────────────────────────────────────────────
async function runCycle() {
  const state = loadState()

  // Concurrency guard
  if (state.status === 'cycling') {
    logger.warn('main', 'Another cycle is already running, skipping')
    return
  }

  state.cycleCount++
  state.status = 'cycling'
  state.lastCycleAt = new Date().toISOString()
  saveState(state)

  const cycleNum = state.cycleCount
  const startTime = Date.now()

  console.log(`\n══════════════════════════════════════════`)
  console.log(`  Autopilot Cycle #${cycleNum}`)
  console.log(`  ${new Date().toLocaleString()}`)
  console.log(`══════════════════════════════════════════\n`)

  // Build memory context (structured, replaces the 2000-char truncation)
  let memoryContext = null
  try {
    memoryContext = buildMemoryContext('ceo', 'coordination')
  } catch (err) {
    logger.warn('main', 'Failed to build memory context, falling back to raw', err)
  }

  const directive = buildDirective(cycleNum, 'coordination', memoryContext)
  console.log(`📤 Sending directive to CEO...\n`)
  logger.info('main', `Cycle #${cycleNum} started`)

  const taskId = await createCycleTask('ceo', 'coordination', cycleNum)

  try {
    const result = await sendToCeo(directive)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.ok) {
      console.log(`✅ Cycle #${cycleNum} complete (${elapsed}s)\n`)
      console.log(`── CEO Response ──────────────────────────`)
      console.log(result.text)
      console.log(`──────────────────────────────────────────\n`)

      const sessionTokens = fetchSessionTokens()
      const ceoTokens = sessionTokens.byAgent['ceo'] || 0
      console.log(`📊 Tokens: CEO=${ceoTokens} Total=${sessionTokens.all}`)

      // Update state
      state.status = isLoop ? 'running' : 'stopped'
      state.lastCycleResult = result.text.slice(0, MAX_CYCLE_RESULT_LENGTH)
      state.history.push({
        cycle: cycleNum,
        startedAt: state.lastCycleAt,
        completedAt: new Date().toISOString(),
        elapsedSec: parseFloat(elapsed),
        result: result.text.slice(0, MAX_HISTORY_RESULT_LENGTH),
        tokens: sessionTokens.all,
      })
      if (state.history.length > MAX_HISTORY_ENTRIES) {
        state.history = state.history.slice(-MAX_HISTORY_ENTRIES)
      }
      saveState(state)

      // Sync project state
      try {
        syncProjects(result.text)
      } catch (e) {
        logger.error('main', `Project sync failed`, e)
      }

      // Compress CEO memory after successful cycle
      try {
        compressMemory('ceo', result.text)
      } catch (e) {
        logger.warn('main', 'Memory compression failed', e)
      }

      logger.info('main', `Cycle #${cycleNum} completed in ${elapsed}s`)
      await completeCycleTask('ceo', taskId, result)
    } else {
      logger.error('main', `Cycle #${cycleNum} failed: ${result.error}`)
      state.status = isLoop ? 'running' : 'error'
      state.lastCycleResult = `Error: ${result.error}`
      saveState(state)
      await completeCycleTask('ceo', taskId, result)
    }
  } catch (err) {
    logger.error('main', `Cycle #${cycleNum} error: ${err.message}`, err)
    state.status = isLoop ? 'running' : 'error'
    state.lastCycleResult = `Error: ${err.message}`
    saveState(state)
    await completeCycleTask('ceo', taskId, { ok: false, error: err.message })
  }
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  await killExistingAutopilot()
  const state = loadState()
  state.pid = process.pid
  state.status = isLoop ? 'running' : 'cycling'
  state.intervalSeconds = intervalSec
  saveState(state)

  console.log(`🏢 Autopilot ${isLoop ? 'loop' : 'single cycle'} mode`)
  console.log(`   PID: ${process.pid}`)
  if (isLoop) console.log(`   Interval: ${intervalSec}s (${(intervalSec / 60).toFixed(0)}min)`)
  console.log()

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Autopilot shutting down...')
    const s = loadState()
    s.status = 'stopped'
    s.pid = null
    saveState(s)
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // Run first cycle immediately
  await runCycle()

  // Loop mode
  if (isLoop) {
    console.log(`\n⏳ Next cycle in ${intervalSec}s...\n`)
    const loop = async () => {
      await runCycle()
      console.log(`\n⏳ Next cycle in ${intervalSec}s...\n`)
      setTimeout(loop, intervalSec * 1000)
    }
    setTimeout(loop, intervalSec * 1000)
  } else {
    const s = loadState()
    s.status = 'stopped'
    s.pid = null
    saveState(s)
  }
}

// ── Discover active departments ─────────────────────────────────
function discoverActiveDepartments() {
  const results = []
  if (!existsSync(DEPARTMENTS_DIR)) return results

  try {
    const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const dir of dirs) {
      const configPath = join(DEPARTMENTS_DIR, dir.name, 'config.json')
      if (!existsSync(configPath)) continue

      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        if (!config.enabled) continue

        const headDir = join(AGENTS_DIR, config.head)
        if (!existsSync(headDir)) {
          logger.warn('main', `Department ${dir.name} head ${config.head} not found, skipping`)
          continue
        }

        results.push({
          id: config.id || dir.name,
          head: config.head,
          interval: config.interval || DEFAULT_DEPT_INTERVAL_SEC,
          config,
        })
      } catch (err) {
        logger.warn('main', `Failed to parse config for dept ${dir.name}`, err)
      }
    }
  } catch (err) {
    logger.error('main', 'Failed to discover departments', err)
  }

  return results
}

// ── Run a CEO coordination/strategy cycle ───────────────────────
async function runCeoCycleForAll(cycleType = 'coordination') {
  const state = loadState()

  if (state.status === 'cycling') {
    logger.warn('main', 'CEO already cycling, skipping')
    return
  }

  state.cycleCount++
  state.status = 'cycling'
  state.lastCycleAt = new Date().toISOString()
  saveState(state)

  const cycleNum = state.cycleCount
  const startTime = Date.now()

  logger.info('main', `CEO ${cycleType} cycle #${cycleNum} started`)

  const taskId = await createCycleTask('ceo', cycleType, cycleNum)

  try {
    const memoryContext = buildMemoryContext('ceo', cycleType)
    const directive = buildDirective(cycleNum, cycleType, memoryContext)
    const result = await sendToCeo(directive)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.ok) {
      logger.info('main', `CEO cycle #${cycleNum} completed in ${elapsed}s`)

      const sessionTokens = fetchSessionTokens()

      state.status = 'running'
      state.lastCycleResult = result.text.slice(0, 500)
      state.history = state.history || []
      state.history.push({
        cycle: cycleNum,
        startedAt: state.lastCycleAt,
        completedAt: new Date().toISOString(),
        elapsedSec: parseFloat(elapsed),
        result: result.text.slice(0, 300),
        tokens: sessionTokens.all,
        cycleType,
      })
      if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY)
      saveState(state)

      try { syncProjects(result.text) } catch (e) {
        logger.error('main', 'Project sync failed', e)
      }

      try { compressMemory('ceo', result.text) } catch (e) {
        logger.warn('main', 'Memory compression failed', e)
      }
      await completeCycleTask('ceo', taskId, result)
    } else {
      logger.error('main', `CEO cycle #${cycleNum} failed: ${result.error}`)
      state.status = 'running'
      state.lastCycleResult = `Error: ${result.error}`
      saveState(state)
      await completeCycleTask('ceo', taskId, result)
    }
  } catch (err) {
    logger.error('main', `CEO cycle #${cycleNum} error`, err)
    state.status = 'running'
    state.lastCycleResult = `Error: ${err.message}`
    saveState(state)
    await completeCycleTask('ceo', taskId, { ok: false, error: err.message })
  }
}

// ── Start all: CEO cycles + department cycles ───────────────────
async function startAll() {
  await killExistingAutopilot()
  const state = loadState()
  state.pid = process.pid
  state.status = 'running'
  state.mode = 'all'
  saveState(state)

  logger.info('main', `Start-all mode (PID: ${process.pid})`)

  // Graceful shutdown
  const shutdown = () => {
    logger.info('main', 'Shutting down...')
    const s = loadState()
    s.status = 'stopped'
    s.pid = null
    s.mode = null
    saveState(s)
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // 1. Run initial CEO coordination cycle
  await runCeoCycleForAll('coordination')

  // 2. Schedule recurring CEO coordination cycles
  const ceoCoordLoop = async () => {
    await runCeoCycleForAll('coordination')
    setTimeout(ceoCoordLoop, CEO_COORDINATION_INTERVAL_SEC * 1000)
  }
  setTimeout(ceoCoordLoop, CEO_COORDINATION_INTERVAL_SEC * 1000)

  // 3. Schedule CEO strategy cycle (daily)
  const ceoStrategyLoop = async () => {
    await runCeoCycleForAll('strategy')
    setTimeout(ceoStrategyLoop, CEO_STRATEGY_INTERVAL_SEC * 1000)
  }
  setTimeout(ceoStrategyLoop, CEO_STRATEGY_INTERVAL_SEC * 1000)

  // 4. Start department loops
  const departments = discoverActiveDepartments()
  logger.info('main', `Found ${departments.length} active departments`)

  for (const dept of departments) {
    logger.info('main', `Starting department loop: ${dept.id} (interval: ${dept.interval}s)`)

    await runDepartmentCycle(dept.id)

    const deptLoop = async () => {
      await runDepartmentCycle(dept.id)
      setTimeout(deptLoop, dept.interval * 1000)
    }
    setTimeout(deptLoop, dept.interval * 1000)
  }

  logger.info('main', 'All loops scheduled. Running...')
}

module.exports = { runCycle, main, startAll, discoverActiveDepartments }
