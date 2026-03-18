#!/usr/bin/env node
/**
 * Department Loop CLI — thin entry point
 *
 * All business logic lives in core/autopilot/department-loop.
 * This file handles CLI arg parsing, PID management, and signal handling.
 *
 * Usage:
 *   node scripts/autopilot/department-loop.cjs --dept novel
 *   node scripts/autopilot/department-loop.cjs --dept novel --loop
 *   node scripts/autopilot/department-loop.cjs --dept novel --loop --interval 600
 */
const { DEFAULT_DEPT_INTERVAL_SEC } = require('../../core/autopilot/constants.cjs')
const { runDepartmentCycle } = require('../../core/autopilot/department-loop.cjs')
const { deptStateRepo } = require('../../core/repo/dept-state.cjs')
const logger = require('../../core/autopilot/logger.cjs')

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
    const state = deptStateRepo.load(deptId)
    state.status = 'stopped'
    state.pid = null
    deptStateRepo.save(deptId, state)
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  async function run() {
    // Store PID
    const state = deptStateRepo.load(deptId)
    state.pid = process.pid
    state.status = isLoop ? 'running' : 'idle'
    deptStateRepo.save(deptId, state)

    console.log(`🏭 Department ${deptId} ${isLoop ? 'loop' : 'single cycle'} mode (PID: ${process.pid})`)

    await runDepartmentCycle(deptId)

    if (isLoop) {
      // Restore running status after cycle (runDepartmentCycle sets idle/error)
      const restoreRunning = () => {
        const s = deptStateRepo.load(deptId)
        if (s.status !== 'stopped') {
          s.status = 'running'
          deptStateRepo.save(deptId, s)
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
      const s = deptStateRepo.load(deptId)
      s.status = 'stopped'
      s.pid = null
      deptStateRepo.save(deptId, s)
    }
  }

  run().catch(err => {
    logger.error('dept-loop', 'Fatal error', err)
    process.exit(1)
  })
}

// Re-export for backward compatibility
module.exports = require('../../core/autopilot/department-loop.cjs')
