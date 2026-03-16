import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync } from 'fs'
import { resolve, join } from 'path'
import { logError } from '@/lib/error-logger'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const DEPARTMENTS_DIR = join(PROJECT_ROOT, 'config/departments')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')

function atomicWriteSync(filePath: string, data: string) {
  const tmpPath = filePath + '.tmp.' + process.pid
  writeFileSync(tmpPath, data)
  renameSync(tmpPath, filePath)
}

/**
 * GET /api/autopilot/departments — list all department loop states
 */
export async function GET() {
  const departments: Array<Record<string, unknown>> = []

  if (!existsSync(DEPARTMENTS_DIR)) {
    return NextResponse.json({ departments })
  }

  try {
    const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      const configPath = join(DEPARTMENTS_DIR, dir.name, 'config.json')
      const statePath = join(DEPARTMENTS_DIR, dir.name, 'state.json')
      const reportPath = join(DEPARTMENTS_DIR, dir.name, 'report.md')

      if (!existsSync(configPath)) continue

      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        let state = { status: 'stopped', cycleCount: 0, tokensUsedToday: 0 }
        let report = ''
        let directives: string[] = []

        if (existsSync(statePath)) {
          try { state = JSON.parse(readFileSync(statePath, 'utf-8')) } catch (err) { logError('autopilot-depts/read-state', err) }
        }
        if (existsSync(reportPath)) {
          try { report = readFileSync(reportPath, 'utf-8').slice(0, 2000) } catch (err) { logError('autopilot-depts/read-report', err) }
        }
        const directivesPath = join(DEPARTMENTS_DIR, dir.name, 'ceo-directives.json')
        if (existsSync(directivesPath)) {
          try {
            const data = JSON.parse(readFileSync(directivesPath, 'utf-8'))
            directives = data.directives || []
          } catch (err) { logError('autopilot-depts/read-directives', err) }
        }

        // Read department mission
        let mission = ''
        const missionPath = join(DEPARTMENTS_DIR, dir.name, 'mission.md')
        if (existsSync(missionPath)) {
          try { mission = readFileSync(missionPath, 'utf-8').slice(0, 3000) } catch (err) { logError('autopilot-depts/read-mission', err) }
        }

        // Check if head agent actually exists
        const headExists = config.head ? existsSync(join(AGENTS_DIR, config.head)) : false

        departments.push({
          ...config,
          state,
          report,
          directives,
          mission,
          headExists,
        })
      } catch (err) { logError('autopilot-depts/parse-config', err) }
    }
  } catch (err) { logError('autopilot-depts/list-dirs', err) }

  return NextResponse.json({ departments })
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

    const deptDir = join(DEPARTMENTS_DIR, deptId)
    const configPath = join(deptDir, 'config.json')
    if (!existsSync(configPath)) {
      return NextResponse.json({ ok: false, error: `Department ${deptId} not found` }, { status: 404 })
    }

    // Update config fields
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    if (enabled !== undefined) config.enabled = enabled
    if (interval !== undefined) config.interval = interval
    atomicWriteSync(configPath, JSON.stringify(config, null, 2))

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
