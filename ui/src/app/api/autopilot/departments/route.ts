import { NextResponse } from 'next/server'
import { getDepartments } from '@/services/autopilot-api'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

/**
 * GET /api/autopilot/departments — list all department loop states
 */
export async function GET() {
  return NextResponse.json(getDepartments())
}

/**
 * POST /api/autopilot/departments — update department config or directives
 * Body: { deptId, enabled?, interval?, directives?: string[] }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { deptId, enabled, interval, directives, mission } = body

    if (!deptId) {
      return NextResponse.json({ ok: false, error: 'deptId required' }, { status: 400 })
    }

    const config = core.repo.deptConfigRepo.load(deptId)
    if (!config) {
      return NextResponse.json({ ok: false, error: `Department ${deptId} not found` }, { status: 404 })
    }

    // Update config fields
    if (enabled !== undefined) config.enabled = enabled
    if (interval !== undefined) config.interval = interval
    core.repo.deptConfigRepo.save(deptId, config)

    // Update department mission
    if (mission !== undefined) {
      core.repo.missionRepo.writeDeptMission(deptId, mission)
    }

    // Update CEO directives
    if (directives !== undefined) {
      core.repo.missionRepo.writeDeptDirectives(deptId, directives)
    }

    return NextResponse.json({ ok: true, config })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
