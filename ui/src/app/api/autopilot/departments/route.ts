import { NextResponse } from 'next/server'
import { writeFileSync, renameSync } from 'fs'
import { resolve, join } from 'path'
import { getDepartments } from '@/services/autopilot-api'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const DEPARTMENTS_DIR = join(PROJECT_ROOT, 'config/departments')

function atomicWriteSync(filePath: string, data: string) {
  const tmpPath = filePath + '.tmp.' + process.pid
  writeFileSync(tmpPath, data)
  renameSync(tmpPath, filePath)
}

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
    const deptDir = join(DEPARTMENTS_DIR, deptId)

    // Update department mission
    if (mission !== undefined) {
      const missionPath = join(deptDir, 'mission.md')
      atomicWriteSync(missionPath, mission)
    }

    // Update CEO directives
    if (directives !== undefined) {
      const directivesPath = join(deptDir, 'ceo-directives.json')
      atomicWriteSync(directivesPath, JSON.stringify({
        directives: Array.isArray(directives) ? directives : [directives],
        updatedAt: new Date().toISOString(),
      }, null, 2))
    }

    return NextResponse.json({ ok: true, config })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
