import { spawn } from 'child_process'
import { resolve, join } from 'path'
import { logError } from '@/lib/error-logger'
import core from '@/lib/core-bridge'
import type { AutopilotState, DeptInfo } from '@entity/autopilot'
import type { DepartmentConfig } from '@/lib/types'

// --- Constants ---

const PROJECT_ROOT = resolve(process.cwd(), '..')
const AUTOPILOT_SCRIPT = join(PROJECT_ROOT, 'scripts/autopilot/index.cjs')
const DEPT_LOOP_SCRIPT = join(PROJECT_ROOT, 'scripts/autopilot/department-loop.cjs')

// --- Types ---

export type { AutopilotState } from '@entity/autopilot'

export interface ServiceResult {
  ok: boolean
  message?: string
  pid?: number
  error?: string
  status?: number
}

// --- Internal helpers (delegating to core/) ---

function loadState(): AutopilotState {
  return core.common.loadState()
}

function saveState(state: AutopilotState) {
  core.common.saveState(state)
}

function isProcessRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (err) { logError('autopilot/check-pid', err); return false }
}

function loadDepartments(): DeptInfo[] {
  const results: DeptInfo[] = []
  try {
    const deptIds = core.repo.deptConfigRepo.listDeptIds()
    for (const deptId of deptIds) {
      const config = core.repo.deptConfigRepo.load(deptId)
      if (!config) continue
      try {
        const state = core.repo.deptStateRepo.load(deptId)
        let report = ''
        let directives: string[] = []
        let mission = ''
        try { report = core.repo.missionRepo.readDeptReport(deptId) } catch (err) { logError('autopilot/load-dept-report', err) }
        try { directives = core.repo.missionRepo.readDeptDirectives(deptId) } catch (err) { logError('autopilot/load-dept-directives', err) }
        try { mission = core.repo.missionRepo.readDeptMission(deptId).slice(0, 3000) } catch { /* skip */ }
        const headExists = config.head ? core.repo.agentMetaRepo.exists(config.head) : false
        results.push({
          id: config.id || deptId,
          name: config.name || deptId,
          emoji: (config as DepartmentConfig & { emoji?: string }).emoji || '',
          head: config.head || '',
          enabled: config.enabled || false,
          interval: config.interval || 600,
          directives,
          mission,
          report,
          headExists,
          state: {
            status: state.status || 'stopped',
            cycleCount: state.cycleCount || 0,
            lastCycleAt: state.lastCycleAt || undefined,
            lastCycleResult: state.lastCycleResult || undefined,
            tokensUsedToday: state.tokensUsedToday || undefined,
            pid: state.pid,
          },
        })
      } catch (err) { logError('autopilot/parse-dept-config', err) }
    }
  } catch (err) { logError('autopilot/load-departments', err) }
  return results
}

function loadBudgetSummary() {
  return core.observe.getBudgetSummary()
}

// --- Service functions ---

export function getAutopilotOverview() {
  const state = loadState()
  if (state.pid && !isProcessRunning(state.pid)) {
    state.status = 'stopped'
    state.pid = null
    saveState(state)
  }

  let missionSummary = ''
  try { missionSummary = core.repo.missionRepo.readMission() } catch (err) { logError('autopilot/read-mission-summary', err) }

  let baseMission = ''
  try { baseMission = core.repo.missionRepo.readBaseMission() } catch (err) { logError('autopilot/read-base-mission-overview', err) }

  return {
    ...state,
    missionSummary,
    baseMission,
    recentHistory: state.history.slice(-10),
  }
}

export function getDepartments() {
  return { departments: loadDepartments() }
}

export function getBudgetSummary() {
  return loadBudgetSummary()
}

export function getKpis() {
  const depts = loadDepartments()
  const kpis: Record<string, Record<string, unknown>> = {}
  for (const dept of depts) {
    const config = core.repo.deptConfigRepo.load(dept.id)
    try {
      if (config?.kpis) kpis[dept.id] = config.kpis as Record<string, unknown>
    } catch (err) { logError('autopilot/load-kpis', err) }
  }
  return { kpis }
}

export function getBaseMission() {
  let content = ''
  try { content = core.repo.missionRepo.readBaseMission() } catch (err) { logError('autopilot/read-base-mission', err) }
  return { content }
}

export function getMission() {
  let content = ''
  try { content = core.repo.missionRepo.readMission() } catch (err) { logError('autopilot/read-mission', err) }
  return { content }
}

export async function stopAutopilot(): Promise<ServiceResult> {
  const state = loadState()

  // Stop main process with graceful shutdown + forced kill fallback
  if (state.pid) {
    try { process.kill(state.pid, 'SIGTERM') } catch (err) { logError('autopilot/stop-sigterm', err) }
    let exited = false
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (!isProcessRunning(state.pid)) { exited = true; break }
    }
    if (!exited) {
      try { process.kill(state.pid, 'SIGKILL') } catch (err) { logError('autopilot/stop-sigkill', err) }
    }
  }
  // In all mode, also stop all department child processes
  if (state.mode === 'all') {
    try {
      const deptIds = core.repo.deptConfigRepo.listDeptIds()
      for (const deptId of deptIds) {
        const deptState = core.repo.deptStateRepo.load(deptId)
        if (typeof deptState.pid === 'number' && deptState.pid && isProcessRunning(deptState.pid)) {
          try { process.kill(deptState.pid, 'SIGTERM') } catch (err) { logError('autopilot/stop-dept-sigterm', err) }
          await new Promise(r => setTimeout(r, 500))
          if (deptState.pid && isProcessRunning(deptState.pid)) {
            try { process.kill(deptState.pid, 'SIGKILL') } catch (err) { logError('autopilot/stop-dept-sigkill', err) }
          }
        }
        deptState.status = 'stopped'
        deptState.pid = null
        core.repo.deptStateRepo.save(deptId, deptState)
      }
    } catch (err) { logError('autopilot/stop-all-depts', err) }
  }
  state.status = 'stopped'
  state.pid = null
  state.mode = null
  saveState(state)
  return { ok: true, message: 'Autopilot stopped' }
}

export function runSingleCycle(): ServiceResult {
  const child = spawn('node', [AUTOPILOT_SCRIPT], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  })
  child.unref()
  return { ok: true, message: 'Single cycle started', pid: child.pid }
}

export async function startAutopilot(interval?: number): Promise<ServiceResult> {
  const state = loadState()
  if (state.pid && isProcessRunning(state.pid)) {
    try { process.kill(state.pid, 'SIGTERM') } catch (err) { logError('autopilot/start-kill-old', err) }
    await new Promise(r => setTimeout(r, 1000))
  }
  const intervalArg = String(interval || state.intervalSeconds || 1800)
  const child = spawn('node', [AUTOPILOT_SCRIPT, '--loop', '--interval', intervalArg], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  })
  child.unref()
  state.status = 'running'
  state.pid = child.pid || null
  state.intervalSeconds = parseInt(intervalArg)
  saveState(state)
  return { ok: true, message: `Autopilot started (PID ${child.pid})`, pid: child.pid }
}

export async function startAllLoops(): Promise<ServiceResult> {
  const state = loadState()
  if (state.pid && isProcessRunning(state.pid)) {
    try { process.kill(state.pid, 'SIGTERM') } catch (err) { logError('autopilot/start-all-kill-old', err) }
    await new Promise(r => setTimeout(r, 1000))
  }
  const child = spawn('node', [AUTOPILOT_SCRIPT, '--all'], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  })
  child.unref()
  state.status = 'running'
  state.pid = child.pid || null
  state.mode = 'all'
  saveState(state)
  return { ok: true, message: `All loops started (PID ${child.pid})`, pid: child.pid }
}

export function startDeptLoop(deptId: string, interval?: number): ServiceResult {
  if (!deptId) return { ok: false, error: 'deptId required', status: 400 }
  // Check head agent exists
  const deptConfig = core.repo.deptConfigRepo.load(deptId)
  if (deptConfig) {
    if (deptConfig.head && !core.repo.agentMetaRepo.exists(deptConfig.head)) {
      return { ok: false, error: `部门主管 ${deptConfig.head} 尚未创建，请先创建该智能体`, status: 400 }
    }
  }
  // Prevent duplicate: kill existing process if still alive
  const deptState = core.repo.deptStateRepo.load(deptId)
  if (typeof deptState.pid === 'number' && deptState.pid && isProcessRunning(deptState.pid)) {
    try { process.kill(deptState.pid, 'SIGTERM') } catch (err) { logError('autopilot/start-dept-kill-old', err) }
  }
  const deptInterval = String(interval || 600)
  const child = spawn('node', [DEPT_LOOP_SCRIPT, '--dept', deptId, '--loop', '--interval', deptInterval], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  })
  child.unref()
  deptState.status = 'running'
  deptState.pid = child.pid || null
  core.repo.deptStateRepo.save(deptId, deptState)
  return { ok: true, message: `Department ${deptId} loop started`, pid: child.pid }
}

export function stopDeptLoop(deptId: string): ServiceResult {
  if (!deptId) return { ok: false, error: 'deptId required', status: 400 }
  const deptState = core.repo.deptStateRepo.load(deptId)
  if (typeof deptState.pid === 'number' && deptState.pid) {
    try { process.kill(deptState.pid, 'SIGTERM') } catch (err) { logError('autopilot/stop-dept-kill', err) }
  }
  deptState.status = 'stopped'
  deptState.pid = null
  core.repo.deptStateRepo.save(deptId, deptState)
  return { ok: true, message: `Department ${deptId} stopped` }
}

export function runDeptCycle(deptId: string): ServiceResult {
  if (!deptId) return { ok: false, error: 'deptId required', status: 400 }
  // Check head agent exists
  const deptConfig = core.repo.deptConfigRepo.load(deptId)
  if (deptConfig) {
    if (deptConfig.head && !core.repo.agentMetaRepo.exists(deptConfig.head)) {
      return { ok: false, error: `部门主管 ${deptConfig.head} 尚未创建，请先创建该智能体`, status: 400 }
    }
  }
  const child = spawn('node', [DEPT_LOOP_SCRIPT, '--dept', deptId], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  })
  child.unref()
  return { ok: true, message: `Department ${deptId} single cycle started`, pid: child.pid }
}

export function setBaseMission(content: string): ServiceResult {
  if (typeof content !== 'string') return { ok: false, error: 'content required', status: 400 }
  core.repo.missionRepo.writeBaseMission(content)
  return { ok: true }
}

export function setMission(content: string): ServiceResult {
  if (typeof content !== 'string') return { ok: false, error: 'content required', status: 400 }
  core.repo.missionRepo.writeMission(content)
  return { ok: true }
}
