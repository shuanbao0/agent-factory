#!/usr/bin/env node
/**
 * Autopilot CLI — thin entry point
 *
 * All business logic lives in core/autopilot/. This file handles:
 * - CLI argument parsing
 * - Process management (PID, signals)
 * - Delegating to core/autopilot/orchestrator
 *
 * Usage:
 *   node scripts/autopilot/index.cjs                         # 运行一个循环
 *   node scripts/autopilot/index.cjs --loop                  # 持续循环模式
 *   node scripts/autopilot/index.cjs --loop --interval 1800  # 每 30 分钟循环
 *   node scripts/autopilot/index.cjs --stop                  # 停止运行中的循环
 *   node scripts/autopilot/index.cjs --all                   # 启动全部循环（CEO + 部门循环）
 */
const { DEFAULT_INTERVAL_SEC } = require('../../../core/autopilot/constants.cjs')
const { loadState, saveState } = require('../../../core/common/autopilot-state.cjs')
const { runCycle, startAll, killExistingAutopilot } = require('../../../core/autopilot/orchestrator.cjs')
const logger = require('../../../core/common/logger.cjs')

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
  startAll().then(({ shutdown }) => {
    // Graceful shutdown
    const handleSignal = () => {
      shutdown()
      process.exit(0)
    }
    process.on('SIGTERM', handleSignal)
    process.on('SIGINT', handleSignal)
  }).catch(err => {
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
  await runCycle({ isLoop })

  // Loop mode
  if (isLoop) {
    console.log(`\n⏳ Next cycle in ${intervalSec}s...\n`)
    const loop = async () => {
      await runCycle({ isLoop })
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

module.exports = { runCycle, startAll, discoverActiveDepartments: require('../../../core/autopilot/orchestrator.cjs').discoverActiveDepartments }
