import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { resolve } from 'path'
import { readFileSync } from 'fs'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')

function getInstalledVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'package.json'), 'utf-8'))
    return pkg.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

function getLatestVersion(): string | null {
  try {
    const response = execSync(
      'curl -fsSL https://api.github.com/repos/shuanbao0/agent-factory/releases/latest',
      { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const data = JSON.parse(response)
    return data.tag_name?.replace(/^v/, '') || null
  } catch {
    return null
  }
}

// GET: check current + latest version
export async function GET() {
  const current = getInstalledVersion()
  const latest = getLatestVersion()
  const hasUpdate = !!(current && latest && current !== latest && current !== 'unknown')

  return NextResponse.json({
    current,
    latest: latest || 'unknown',
    hasUpdate,
    checkedAt: new Date().toISOString(),
  })
}

// POST: perform update via agent-factory CLI
export async function POST(req: NextRequest) {
  try {
    const current = getInstalledVersion()

    // Use the CLI update command which handles download, rsync, migrations, base-rules
    const output = execSync('node bin/agent-factory.mjs update', {
      cwd: PROJECT_ROOT,
      timeout: 300000, // 5 minutes for full update
      encoding: 'utf-8',
      env: { ...process.env, AGENT_FACTORY_DIR: PROJECT_ROOT },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const newVersion = getInstalledVersion()
    const updated = current !== newVersion

    return NextResponse.json({
      ok: true,
      previousVersion: current,
      currentVersion: newVersion,
      updated,
      output: output.slice(-2000),
    })
  } catch (e: any) {
    // The update may have partially succeeded (version bumped but restart needed)
    const newVersion = getInstalledVersion()
    const stdout = e.stdout?.toString() || ''
    const stderr = e.stderr?.toString() || ''

    return NextResponse.json({
      ok: false,
      error: e.message || 'Update failed',
      currentVersion: newVersion,
      output: (stdout + '\n' + stderr).slice(-2000),
    }, { status: 500 })
  }
}
