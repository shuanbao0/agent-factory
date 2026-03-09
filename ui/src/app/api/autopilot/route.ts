import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync } from 'fs'
import { resolve, join } from 'path'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const STATE_FILE = join(PROJECT_ROOT, 'config/autopilot-state.json')
const MISSION_FILE = join(PROJECT_ROOT, 'config/mission.md')
const AUTOPILOT_SCRIPT = join(PROJECT_ROOT, 'scripts/autopilot/index.cjs')
const DEPT_LOOP_SCRIPT = join(PROJECT_ROOT, 'scripts/autopilot/department-loop.cjs')
const DEPARTMENTS_DIR = join(PROJECT_ROOT, 'config/departments')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const BUDGET_FILE = join(PROJECT_ROOT, 'config/budget.json')

interface AutopilotState {
  status: 'running' | 'stopped' | 'cycling' | 'error'
  pid: number | null
  cycleCount: number
  lastCycleAt: string | null
  lastCycleResult: string | null
  intervalSeconds: number
  mode?: 'all' | null
  history: Array<{
    cycle: number
    startedAt: string
    completedAt: string
    elapsedSec: number
    result: string
    tokens: number
    cycleType?: string
  }>
}

function loadState(): AutopilotState {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch {}
  return {
    status: 'stopped', pid: null, cycleCount: 0,
    lastCycleAt: null, lastCycleResult: null,
    intervalSeconds: 1800, history: [],
  }
}

function saveState(state: AutopilotState) {
  atomicWriteSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function isProcessRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

function atomicWriteSync(filePath: string, data: string) {
  const tmpPath = filePath + '.tmp.' + process.pid
  writeFileSync(tmpPath, data)
  renameSync(tmpPath, filePath)
}

function loadDepartments(): Array<{ id: string; name: string; emoji?: string; head: string; enabled: boolean; interval: number; directives?: string[]; mission?: string; report?: string; headExists?: boolean; state: Record<string, unknown> }> {
  const results: Array<{ id: string; name: string; emoji?: string; head: string; enabled: boolean; interval: number; directives?: string[]; mission?: string; report?: string; headExists?: boolean; state: Record<string, unknown> }> = []
  if (!existsSync(DEPARTMENTS_DIR)) return results
  try {
    const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      const configPath = join(DEPARTMENTS_DIR, dir.name, 'config.json')
      const statePath = join(DEPARTMENTS_DIR, dir.name, 'state.json')
      const reportPath = join(DEPARTMENTS_DIR, dir.name, 'report.md')
      const directivesPath = join(DEPARTMENTS_DIR, dir.name, 'ceo-directives.json')
      const missionPath = join(DEPARTMENTS_DIR, dir.name, 'mission.md')
      if (!existsSync(configPath)) continue
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        let state = { status: 'stopped', cycleCount: 0 }
        let report = ''
        let directives: string[] = []
        let mission = ''
        if (existsSync(statePath)) {
          try { state = JSON.parse(readFileSync(statePath, 'utf-8')) } catch {}
        }
        if (existsSync(reportPath)) {
          try { report = readFileSync(reportPath, 'utf-8').slice(0, 2000) } catch {}
        }
        if (existsSync(directivesPath)) {
          try {
            const data = JSON.parse(readFileSync(directivesPath, 'utf-8'))
            directives = data.directives || []
          } catch {}
        }
        if (existsSync(missionPath)) {
          try { mission = readFileSync(missionPath, 'utf-8').slice(0, 3000) } catch {}
        }
        const headExists = config.head ? existsSync(join(AGENTS_DIR, config.head)) : false
        results.push({
          id: config.id || dir.name,
          name: config.name || dir.name,
          emoji: config.emoji || '',
          head: config.head || '',
          enabled: config.enabled || false,
          interval: config.interval || 600,
          directives,
          mission,
          report,
          headExists,
          state,
        })
      } catch {}
    }
  } catch {}
  return results
}

function loadBudgetSummary() {
  const summary: { company: { dailyLimit: number; used: number; ratio: number }; departments: Record<string, { limit: number; used: number; ratio: number }> } = {
    company: { dailyLimit: 5000000, used: 0, ratio: 0 },
    departments: {},
  }
  // Load company budget
  if (existsSync(BUDGET_FILE)) {
    try {
      const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'))
      summary.company.dailyLimit = budget.company?.dailyTokenLimit || 5000000
    } catch {}
  }
  // Aggregate department usage — read only state.json and config.json per dept
  let totalUsed = 0
  if (existsSync(DEPARTMENTS_DIR)) {
    try {
      const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
      for (const dir of dirs) {
        const configPath = join(DEPARTMENTS_DIR, dir.name, 'config.json')
        const statePath = join(DEPARTMENTS_DIR, dir.name, 'state.json')
        if (!existsSync(configPath)) continue
        let limit = 0
        let used = 0
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'))
          limit = config.budget?.dailyTokenLimit || 0
        } catch {}
        if (existsSync(statePath)) {
          try {
            const deptState = JSON.parse(readFileSync(statePath, 'utf-8'))
            used = deptState.tokensUsedToday || 0
          } catch {}
        }
        summary.departments[dir.name] = { limit, used, ratio: limit > 0 ? used / limit : 0 }
        totalUsed += used
      }
    } catch {}
  }
  summary.company.used = totalUsed
  summary.company.ratio = summary.company.dailyLimit > 0 ? totalUsed / summary.company.dailyLimit : 0
  return summary
}

/**
 * GET /api/autopilot — Get autopilot status
 * Query params:
 *   ?view=overview (default) — autopilot state
 *   ?view=departments — all department loop states
 *   ?view=budgets — budget usage
 *   ?view=kpis — KPI summary
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'overview'

  if (view === 'departments') {
    return NextResponse.json({ departments: loadDepartments() })
  }

  if (view === 'budgets') {
    return NextResponse.json(loadBudgetSummary())
  }

  if (view === 'kpis') {
    // Read KPI data from department configs
    const depts = loadDepartments()
    const kpis: Record<string, Record<string, unknown>> = {}
    for (const dept of depts) {
      const configPath = join(DEPARTMENTS_DIR, dept.id, 'config.json')
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        if (config.kpis) kpis[dept.id] = config.kpis
      } catch {}
    }
    return NextResponse.json({ kpis })
  }

  if (view === 'base-mission') {
    const BASE_MISSION_FILE = join(PROJECT_ROOT, 'config/base-mission.md')
    let content = ''
    try {
      if (existsSync(BASE_MISSION_FILE)) {
        content = readFileSync(BASE_MISSION_FILE, 'utf-8')
      }
    } catch {}
    return NextResponse.json({ content })
  }

  if (view === 'mission') {
    let content = ''
    try {
      if (existsSync(MISSION_FILE)) {
        content = readFileSync(MISSION_FILE, 'utf-8')
      }
    } catch {}
    return NextResponse.json({ content })
  }

  // Default: overview
  const state = loadState()
  if (state.pid && !isProcessRunning(state.pid)) {
    state.status = 'stopped'
    state.pid = null
    saveState(state)
  }

  let missionSummary = ''
  try {
    if (existsSync(MISSION_FILE)) {
      const content = readFileSync(MISSION_FILE, 'utf-8')
      missionSummary = content
    }
  } catch {}

  let baseMission = ''
  try {
    const BASE_MISSION_FILE = join(PROJECT_ROOT, 'config/base-mission.md')
    if (existsSync(BASE_MISSION_FILE)) {
      baseMission = readFileSync(BASE_MISSION_FILE, 'utf-8')
    }
  } catch {}

  return NextResponse.json({
    ...state,
    missionSummary,
    baseMission,
    recentHistory: state.history.slice(-10),
  })
}

/**
 * POST /api/autopilot — Control autopilot
 * Body: { action, interval?, deptId? }
 *
 * Actions:
 *   'start'      — Start CEO loop
 *   'stop'       — Stop autopilot
 *   'cycle'      — Run single CEO cycle
 *   'start-all'  — Start all loops (CEO + all departments)
 *   'start-dept' — Start single department loop { deptId, interval? }
 *   'stop-dept'  — Stop single department loop { deptId }
 *   'dept-cycle' — Run single department cycle { deptId }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action, interval, deptId } = body
    const state = loadState()

    if (action === 'stop') {
      // Stop main process with graceful shutdown + forced kill fallback
      if (state.pid) {
        try { process.kill(state.pid, 'SIGTERM') } catch {}
        // Poll-wait for process to exit (max 3s, check every 500ms)
        let exited = false
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 500))
          if (!isProcessRunning(state.pid)) { exited = true; break }
        }
        if (!exited) {
          try { process.kill(state.pid, 'SIGKILL') } catch {}
        }
      }
      // In all mode, also stop all department child processes
      if (state.mode === 'all' && existsSync(DEPARTMENTS_DIR)) {
        try {
          const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
          for (const dir of dirs) {
            const deptStatePath = join(DEPARTMENTS_DIR, dir.name, 'state.json')
            if (!existsSync(deptStatePath)) continue
            try {
              const deptState = JSON.parse(readFileSync(deptStatePath, 'utf-8'))
              if (deptState.pid && isProcessRunning(deptState.pid)) {
                try { process.kill(deptState.pid, 'SIGTERM') } catch {}
                // Brief wait then force kill if needed
                await new Promise(r => setTimeout(r, 500))
                if (isProcessRunning(deptState.pid)) {
                  try { process.kill(deptState.pid, 'SIGKILL') } catch {}
                }
              }
              deptState.status = 'stopped'
              deptState.pid = null
              atomicWriteSync(deptStatePath, JSON.stringify(deptState, null, 2))
            } catch {}
          }
        } catch {}
      }
      state.status = 'stopped'
      state.pid = null
      state.mode = null
      saveState(state)
      return NextResponse.json({ ok: true, message: 'Autopilot stopped' })
    }

    if (action === 'cycle') {
      const child = spawn('node', [AUTOPILOT_SCRIPT], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      })
      child.unref()
      return NextResponse.json({ ok: true, message: 'Single cycle started', pid: child.pid })
    }

    if (action === 'start') {
      if (state.pid && isProcessRunning(state.pid)) {
        try { process.kill(state.pid, 'SIGTERM') } catch {}
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
      return NextResponse.json({ ok: true, message: `Autopilot started (PID ${child.pid})`, pid: child.pid })
    }

    if (action === 'start-all') {
      if (state.pid && isProcessRunning(state.pid)) {
        try { process.kill(state.pid, 'SIGTERM') } catch {}
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
      return NextResponse.json({ ok: true, message: `All loops started (PID ${child.pid})`, pid: child.pid })
    }

    if (action === 'start-dept') {
      if (!deptId) return NextResponse.json({ ok: false, error: 'deptId required' }, { status: 400 })
      // Check head agent exists
      const deptConfigPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
      if (existsSync(deptConfigPath)) {
        try {
          const deptConfig = JSON.parse(readFileSync(deptConfigPath, 'utf-8'))
          if (deptConfig.head && !existsSync(join(AGENTS_DIR, deptConfig.head))) {
            return NextResponse.json({ ok: false, error: `部门主管 ${deptConfig.head} 尚未创建，请先创建该智能体` }, { status: 400 })
          }
        } catch {}
      }
      const deptInterval = String(interval || 600)
      const child = spawn('node', [DEPT_LOOP_SCRIPT, '--dept', deptId, '--loop', '--interval', deptInterval], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      })
      child.unref()
      return NextResponse.json({ ok: true, message: `Department ${deptId} loop started`, pid: child.pid })
    }

    if (action === 'stop-dept') {
      if (!deptId) return NextResponse.json({ ok: false, error: 'deptId required' }, { status: 400 })
      const statePath = join(DEPARTMENTS_DIR, deptId, 'state.json')
      if (existsSync(statePath)) {
        try {
          const deptState = JSON.parse(readFileSync(statePath, 'utf-8'))
          if (deptState.pid) {
            try { process.kill(deptState.pid, 'SIGTERM') } catch {}
          }
          deptState.status = 'stopped'
          deptState.pid = null
          atomicWriteSync(statePath, JSON.stringify(deptState, null, 2))
        } catch {}
      }
      return NextResponse.json({ ok: true, message: `Department ${deptId} stopped` })
    }

    if (action === 'dept-cycle') {
      if (!deptId) return NextResponse.json({ ok: false, error: 'deptId required' }, { status: 400 })
      // Check head agent exists
      const deptCycleConfigPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
      if (existsSync(deptCycleConfigPath)) {
        try {
          const deptConfig = JSON.parse(readFileSync(deptCycleConfigPath, 'utf-8'))
          if (deptConfig.head && !existsSync(join(AGENTS_DIR, deptConfig.head))) {
            return NextResponse.json({ ok: false, error: `部门主管 ${deptConfig.head} 尚未创建，请先创建该智能体` }, { status: 400 })
          }
        } catch {}
      }
      const child = spawn('node', [DEPT_LOOP_SCRIPT, '--dept', deptId], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      })
      child.unref()
      return NextResponse.json({ ok: true, message: `Department ${deptId} single cycle started`, pid: child.pid })
    }

    if (action === 'set-base-mission') {
      const { content } = body
      if (typeof content !== 'string') return NextResponse.json({ ok: false, error: 'content required' }, { status: 400 })
      const BASE_MISSION_FILE = join(PROJECT_ROOT, 'config/base-mission.md')
      atomicWriteSync(BASE_MISSION_FILE, content)
      return NextResponse.json({ ok: true })
    }

    if (action === 'set-mission') {
      const { content } = body
      if (typeof content !== 'string') return NextResponse.json({ ok: false, error: 'content required' }, { status: 400 })
      atomicWriteSync(MISSION_FILE, content)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
