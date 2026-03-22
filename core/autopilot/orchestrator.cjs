/**
 * Orchestrator — CEO coordination/strategy cycles + department loop scheduling
 *
 * Business logic only — CLI entry point remains in scripts/autopilot/index.cjs
 */
const { existsSync } = require('fs')
const { join } = require('path')
const {
  DEFAULT_INTERVAL_SEC, MAX_HISTORY_ENTRIES, MAX_CYCLE_RESULT_LENGTH, MAX_HISTORY_RESULT_LENGTH,
  DEPARTMENTS_DIR, AGENTS_DIR,
  CEO_COORDINATION_INTERVAL_SEC, CEO_STRATEGY_INTERVAL_SEC, DEFAULT_DEPT_INTERVAL_SEC,
  IDLE_COMPLETE_MINS, STALE_TASK_MINS,
  SESSION_RESET_INPUT_TOKENS, SESSION_FORCE_COMPACT_TOKENS,
} = require('./constants.cjs')
const { deptConfigRepo } = require('../repo/dept-config.cjs')
const { loadState, saveState } = require('../common/autopilot-state.cjs')
const { sendToCeo, compactSession, killSession, sendToAgent } = require('./gateway-client.cjs')
const { sessionRepo } = require('../repo/session.cjs')
const { taskRepo } = require('../repo/task.cjs')
const { buildDirective } = require('./directive.cjs')
const { syncProjects } = require('./sync.cjs')
const { buildMemoryContext, compressMemory } = require('../agent/memory.cjs')
const { runDepartmentCycle, autoTransitionTasks } = require('./department-loop.cjs')
const { createCycleTask, completeCycleTask, updateTaskStatus } = require('../common/task-bridge.cjs')
const logger = require('../common/logger.cjs')

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

// ── Run one cycle ───────────────────────────────────────────────
async function runCycle(options = {}) {
  const isLoop = options.isLoop || false
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

  // Emit cycle.start event
  try {
    const { eventBus } = require('../observe/event-bus.cjs')
    eventBus.fire('cycle.start', { deptId: 'ceo', cycleNum })
  } catch { /* event bus not available */ }

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

  // CEO session health check
  const ceoSessionKey = 'agent:ceo:autopilot'
  try {
    const sessInfo = sessionRepo.getSessionTokenInfo('ceo', ceoSessionKey)
    const tokens = sessInfo?.totalTokens || 0
    if (tokens > SESSION_RESET_INPUT_TOKENS) {
      // Extract memory before kill
      try {
        const summary = await sendToAgent('ceo', ceoSessionKey,
          '[系统查询] 请用 3-5 句话总结最近的关键决策和待跟进事项。', 30000)
        if (summary.ok && summary.text) compressMemory('ceo', summary.text)
      } catch { /* best effort */ }
      await killSession(ceoSessionKey)
      logger.info('main', `Reset CEO session (${tokens} tokens > ${SESSION_RESET_INPUT_TOKENS})`)
    } else if (tokens > SESSION_FORCE_COMPACT_TOKENS) {
      await compactSession(ceoSessionKey)
      logger.info('main', `Compacted CEO session (${tokens} tokens)`)
    }
  } catch (e) { logger.debug('main', 'CEO session health check failed', e) }

  const taskId = await createCycleTask('ceo', 'coordination', cycleNum)

  try {
    const result = await sendToCeo(directive)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.ok) {
      console.log(`✅ Cycle #${cycleNum} complete (${elapsed}s)\n`)
      console.log(`── CEO Response ──────────────────────────`)
      console.log(result.text)
      console.log(`──────────────────────────────────────────\n`)

      const sessionTokens = sessionRepo.fetchSessionTokens()
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
      // Emit cycle.end (success)
      try {
        const { eventBus } = require('../observe/event-bus.cjs')
        eventBus.fire('cycle.end', { deptId: 'ceo', cycleNum, durationMs: Date.now() - startTime, ok: true })
      } catch { /* event bus not available */ }
      await completeCycleTask('ceo', taskId, result)
    } else {
      logger.error('main', `Cycle #${cycleNum} failed: ${result.error}`)
      state.status = isLoop ? 'running' : 'error'
      state.lastCycleResult = `Error: ${result.error}`
      saveState(state)
      // Emit cycle.end (failure)
      try {
        const { eventBus } = require('../observe/event-bus.cjs')
        eventBus.fire('cycle.end', { deptId: 'ceo', cycleNum, durationMs: Date.now() - startTime, ok: false, error: result.error })
      } catch { /* event bus not available */ }
      await completeCycleTask('ceo', taskId, result)
    }
  } catch (err) {
    logger.error('main', `Cycle #${cycleNum} error: ${err.message}`, err)
    state.status = isLoop ? 'running' : 'error'
    state.lastCycleResult = `Error: ${err.message}`
    saveState(state)
    // Emit cycle.end (error)
    try {
      const { eventBus } = require('../observe/event-bus.cjs')
      eventBus.fire('cycle.end', { deptId: 'ceo', cycleNum, durationMs: Date.now() - startTime, ok: false, error: err.message })
    } catch { /* event bus not available */ }
    await completeCycleTask('ceo', taskId, { ok: false, error: err.message })
  }
}

// ── Discover active departments ─────────────────────────────────
function discoverActiveDepartments() {
  const results = []

  try {
    const deptIds = deptConfigRepo.listDeptIds()

    for (const deptId of deptIds) {
      try {
        const config = deptConfigRepo.load(deptId)
        if (!config || !config.enabled) continue

        const headDir = join(AGENTS_DIR, config.head)
        if (!existsSync(headDir)) {
          logger.warn('main', `Department ${deptId} head ${config.head} not found, skipping`)
          continue
        }

        results.push({
          id: config.id || deptId,
          head: config.head,
          interval: config.interval || DEFAULT_DEPT_INTERVAL_SEC,
          config,
        })
      } catch (err) {
        logger.warn('main', `Failed to parse config for dept ${deptId}`, err)
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

  // Emit cycle.start event
  try {
    const { eventBus } = require('../observe/event-bus.cjs')
    eventBus.fire('cycle.start', { deptId: 'ceo', cycleNum, cycleType })
  } catch { /* event bus not available */ }

  const taskId = await createCycleTask('ceo', cycleType, cycleNum)

  try {
    const memoryContext = buildMemoryContext('ceo', cycleType)
    const directive = buildDirective(cycleNum, cycleType, memoryContext)
    const result = await sendToCeo(directive)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.ok) {
      logger.info('main', `CEO cycle #${cycleNum} completed in ${elapsed}s`)

      const sessionTokens = sessionRepo.fetchSessionTokens()

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
      // Emit cycle.end (success)
      try {
        const { eventBus } = require('../observe/event-bus.cjs')
        eventBus.fire('cycle.end', { deptId: 'ceo', cycleNum, cycleType, durationMs: Date.now() - startTime, ok: true })
      } catch { /* event bus not available */ }
      await completeCycleTask('ceo', taskId, result)
    } else {
      logger.error('main', `CEO cycle #${cycleNum} failed: ${result.error}`)
      state.status = 'running'
      state.lastCycleResult = `Error: ${result.error}`
      saveState(state)
      // Emit cycle.end (failure)
      try {
        const { eventBus } = require('../observe/event-bus.cjs')
        eventBus.fire('cycle.end', { deptId: 'ceo', cycleNum, cycleType, durationMs: Date.now() - startTime, ok: false, error: result.error })
      } catch { /* event bus not available */ }
      await completeCycleTask('ceo', taskId, result)
    }
  } catch (err) {
    logger.error('main', `CEO cycle #${cycleNum} error`, err)
    state.status = 'running'
    state.lastCycleResult = `Error: ${err.message}`
    saveState(state)
    // Emit cycle.end (error)
    try {
      const { eventBus } = require('../observe/event-bus.cjs')
      eventBus.fire('cycle.end', { deptId: 'ceo', cycleNum, cycleType, durationMs: Date.now() - startTime, ok: false, error: err.message })
    } catch { /* event bus not available */ }
    await completeCycleTask('ceo', taskId, { ok: false, error: err.message })
  }
}

// ── Global task sweep: clean up stale tasks across ALL agents ────
async function sweepStaleTasks() {
  const agentActivity = sessionRepo.readAgentActivity()

  // Build set of agents managed by active department-loops.
  const deptAgents = new Set()
  try {
    const departments = discoverActiveDepartments()
    for (const dept of departments) {
      for (const a of (dept.config.agents || [])) deptAgents.add(a)
    }
  } catch { /* proceed without dept info */ }

  // Gather all non-terminal tasks from projects + standalone
  const allTasks = []
  for (const proj of taskRepo.readProjectsWithTasks()) {
    for (const t of (proj.tasks || [])) allTasks.push(t)
  }
  for (const t of taskRepo.readStandaloneTasks()) allTasks.push(t)

  const activeStatuses = ['in_progress', 'rework', 'assigned', 'review']
  const staleTasks = allTasks.filter(t => activeStatuses.includes(t.status))
  if (staleTasks.length === 0) return

  let transitioned = 0
  for (const task of staleTasks) {
    const assignee = task.assignedAgent || (task.assignees && task.assignees[0])
    if (!assignee) continue
    const activity = agentActivity[assignee]
    const idleMins = activity ? activity.idleMins : 9999

    let newStatus = null
    if (task.status === 'assigned' && idleMins >= STALE_TASK_MINS) {
      newStatus = 'failed'
    } else if (task.status === 'review' && idleMins >= IDLE_COMPLETE_MINS) {
      if (deptAgents.has(assignee)) {
        // Department agent — skip, dept-loop's quality gate handles review tasks
      } else {
        newStatus = 'completed'
      }
    } else if ((task.status === 'in_progress' || task.status === 'rework') && idleMins >= STALE_TASK_MINS && (task.progress || 0) < 50) {
      newStatus = 'failed'
    } else if ((task.status === 'in_progress' || task.status === 'rework') && idleMins >= IDLE_COMPLETE_MINS) {
      newStatus = 'review'
    }

    if (newStatus) {
      updateTaskStatus(assignee, task.id, newStatus)
      transitioned++
      logger.info('main', `Sweep: task ${task.id} (${task.status}) → ${newStatus} (agent ${assignee} idle ${idleMins}m)`)
    }
  }

  if (transitioned > 0) {
    logger.info('main', `Sweep completed: ${transitioned} stale tasks transitioned`)
  }
}

// ── Start all: CEO cycles + department cycles ───────────────────
async function startAll(options = {}) {
  await killExistingAutopilot()
  const state = loadState()
  state.pid = process.pid
  state.status = 'running'
  state.mode = 'all'
  saveState(state)

  logger.info('main', `Start-all mode (PID: ${process.pid})`)

  // ── Phase 1: Activate EventBus + Reactors ──
  const { eventBus } = require('../observe/event-bus.cjs')
  const { registerAll } = require('../observe/reactors/index.cjs')
  registerAll(eventBus)
  logger.info('main', `Event bus activated: ${eventBus.eventNames().length} event types`)

  // ── Phase 2: Event-driven Scheduler ──
  const { Scheduler } = require('../observe/scheduler.cjs')
  const { QualityOrchestrator } = require('../task/quality-orchestrator.cjs')
  const { sendToAgent, killSession } = require('./gateway-client.cjs')
  const qualityGate = new QualityOrchestrator({
    sendFn: sendToAgent,
    readAgentActivity: () => sessionRepo.readAgentActivity(),
    loadDeptConfig: (deptId) => deptConfigRepo.load(deptId),
    readTaskOutput: (task) => taskRepo.readTaskOutput(task),
    killSessionFn: killSession,
    logger,
  })
  const processQualityGate = (deptId, task) => qualityGate.process(deptId, task)

  const scheduler = new Scheduler({
    runDepartmentCycle,
    processQualityGate,
    findTaskById: (id) => {
      const projects = taskRepo.readProjectsWithTasks()
      for (const p of projects) {
        const t = (p.tasks || []).find(t => t.id === id)
        if (t) return t
      }
      return taskRepo.readStandaloneTasks().find(t => t.id === id) || null
    },
    logger,
  })
  scheduler.register(eventBus)
  logger.info('main', 'Event-driven scheduler registered')

  // ── Phase 3: Adaptive Timer ──
  const { AdaptiveTimer } = require('../observe/adaptive-timer.cjs')
  const { getDeptActivityLevel } = require('./dept-activity.cjs')
  const timer = new AdaptiveTimer({ getActivityLevel: getDeptActivityLevel })

  // ── Phase 4: Signal Watcher (cross-process event relay) ──
  const { SignalWatcher } = require('../observe/signal-watcher.cjs')
  const signalWatcher = new SignalWatcher(eventBus, logger)
  signalWatcher.start()
  logger.info('main', 'Signal watcher started')

  // Shutdown handle
  const shutdown = () => {
    logger.info('main', 'Shutting down...')
    scheduler.disable()
    signalWatcher.stop()
    const { closePool } = require('./gateway-client.cjs')
    closePool()
    eventBus.removeAllListeners()
    const s = loadState()
    s.status = 'stopped'
    s.pid = null
    s.mode = null
    saveState(s)
  }

  // 0. Sweep stale tasks from previous runs
  await sweepStaleTasks().catch(e =>
    logger.warn('main', 'Stale task sweep failed', e)
  )

  // 1. Run initial CEO coordination cycle
  await runCeoCycleForAll('coordination')

  // 2. Schedule recurring CEO coordination cycles
  let ceoCycleLock = false
  const runCeoCycleGuarded = async (cycleType) => {
    if (ceoCycleLock) {
      logger.warn('main', `CEO ${cycleType} cycle skipped: another CEO cycle is running`)
      return
    }
    ceoCycleLock = true
    try {
      await runCeoCycleForAll(cycleType)
    } finally {
      ceoCycleLock = false
    }
  }

  const ceoCoordLoop = async () => {
    await runCeoCycleGuarded('coordination')
    setTimeout(ceoCoordLoop, CEO_COORDINATION_INTERVAL_SEC * 1000)
  }
  setTimeout(ceoCoordLoop, CEO_COORDINATION_INTERVAL_SEC * 1000)

  // 3. Schedule CEO strategy cycle (daily)
  const ceoStrategyLoop = async () => {
    await runCeoCycleGuarded('strategy')
    setTimeout(ceoStrategyLoop, CEO_STRATEGY_INTERVAL_SEC * 1000)
  }
  setTimeout(ceoStrategyLoop, CEO_STRATEGY_INTERVAL_SEC * 1000)

  // 4. Start department loops with adaptive timers
  const departments = discoverActiveDepartments()
  logger.info('main', `Found ${departments.length} active departments`)

  for (const dept of departments) {
    logger.info('main', `Starting department loop: ${dept.id} (base interval: ${dept.interval}s)`)

    await runDepartmentCycle(dept.id)

    const deptLoop = async () => {
      await runDepartmentCycle(dept.id)
      const interval = timer.nextInterval(dept.id)
      logger.debug('main', `Department ${dept.id} next interval: ${(interval / 1000).toFixed(0)}s`)
      setTimeout(deptLoop, interval)
    }
    setTimeout(deptLoop, timer.nextInterval(dept.id))
  }

  logger.info('main', 'All loops scheduled. Running...')

  return { shutdown }
}

module.exports = { runCycle, runCeoCycleForAll, sweepStaleTasks, startAll, discoverActiveDepartments, killExistingAutopilot }
