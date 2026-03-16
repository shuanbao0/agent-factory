import { NextResponse } from 'next/server'
import {
  getAutopilotOverview,
  getDepartments,
  getBudgetSummary,
  getKpis,
  getBaseMission,
  getMission,
  stopAutopilot,
  runSingleCycle,
  startAutopilot,
  startAllLoops,
  startDeptLoop,
  stopDeptLoop,
  runDeptCycle,
  setBaseMission,
  setMission,
} from '@/services/autopilot-api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/autopilot — Get autopilot status
 * Query params:
 *   ?view=overview (default) — autopilot state
 *   ?view=departments — all department loop states
 *   ?view=budgets — budget usage
 *   ?view=kpis — KPI summary
 *   ?view=base-mission — base mission content
 *   ?view=mission — mission content
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'overview'

  if (view === 'departments') {
    return NextResponse.json(getDepartments())
  }

  if (view === 'budgets') {
    return NextResponse.json(getBudgetSummary())
  }

  if (view === 'kpis') {
    return NextResponse.json(getKpis())
  }

  if (view === 'base-mission') {
    return NextResponse.json(getBaseMission())
  }

  if (view === 'mission') {
    return NextResponse.json(getMission())
  }

  // Default: overview
  return NextResponse.json(getAutopilotOverview())
}

/**
 * POST /api/autopilot — Control autopilot
 * Body: { action, interval?, deptId?, content? }
 *
 * Actions:
 *   'start'      — Start CEO loop
 *   'stop'       — Stop autopilot
 *   'cycle'      — Run single CEO cycle
 *   'start-all'  — Start all loops (CEO + all departments)
 *   'start-dept' — Start single department loop { deptId, interval? }
 *   'stop-dept'  — Stop single department loop { deptId }
 *   'dept-cycle' — Run single department cycle { deptId }
 *   'set-base-mission' — Set base mission { content }
 *   'set-mission'      — Set mission { content }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action, interval, deptId, content } = body

    let result

    switch (action) {
      case 'stop':
        result = await stopAutopilot()
        break
      case 'cycle':
        result = runSingleCycle()
        break
      case 'start':
        result = await startAutopilot(interval)
        break
      case 'start-all':
        result = await startAllLoops()
        break
      case 'start-dept':
        if (!deptId) return NextResponse.json({ ok: false, error: 'deptId required' }, { status: 400 })
        result = startDeptLoop(deptId, interval)
        break
      case 'stop-dept':
        if (!deptId) return NextResponse.json({ ok: false, error: 'deptId required' }, { status: 400 })
        result = stopDeptLoop(deptId)
        break
      case 'dept-cycle':
        if (!deptId) return NextResponse.json({ ok: false, error: 'deptId required' }, { status: 400 })
        result = runDeptCycle(deptId)
        break
      case 'set-base-mission':
        result = setBaseMission(content)
        break
      case 'set-mission':
        result = setMission(content)
        break
      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
    }

    const httpStatus = result.status || 200
    // Remove the internal status field before sending response
    const { status: _status, ...responseBody } = result
    return NextResponse.json(responseBody, { status: httpStatus })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
