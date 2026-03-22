import { NextRequest, NextResponse } from 'next/server'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { resolve, dirname, join } from 'path'
import { readFileSync, existsSync } from 'fs'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

const execAsync = promisify(execCb)
const PROJECT_ROOT = core.common.paths.PROJECT_ROOT

function getInstalledVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'package.json'), 'utf-8'))
    return pkg.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function getLatestVersion(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      'curl -fsSL https://api.github.com/repos/shuanbao0/agent-factory/releases/latest',
      { encoding: 'utf-8', timeout: 15000 }
    )
    const data = JSON.parse(stdout)
    return data.tag_name?.replace(/^v/, '') || null
  } catch {
    return null
  }
}

// Returns true if version a is strictly newer than version b (semver comparison)
function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0
    if (na > nb) return true
    if (na < nb) return false
  }
  return false
}

// GET: check current + latest version
export async function GET() {
  const current = getInstalledVersion()
  const latest = await getLatestVersion()
  const hasUpdate = !!(current && latest && current !== 'unknown' && isNewer(latest, current))

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
    const { stdout } = await execAsync('node bin/agent-factory.mjs update', {
      cwd: PROJECT_ROOT,
      timeout: 300000, // 5 minutes for full update
      encoding: 'utf-8',
      env: { ...process.env, AGENT_FACTORY_DIR: PROJECT_ROOT },
    })

    const newVersion = getInstalledVersion()
    const updated = current !== newVersion

    return NextResponse.json({
      ok: true,
      previousVersion: current,
      currentVersion: newVersion,
      updated,
      output: stdout.slice(-2000),
    })
  } catch (e: unknown) {
    // The update may have partially succeeded (version bumped but restart needed)
    const newVersion = getInstalledVersion()
    const execErr = e as { stdout?: Buffer | string; stderr?: Buffer | string }
    const stdout = execErr.stdout?.toString() || ''
    const stderr = execErr.stderr?.toString() || ''

    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      currentVersion: newVersion,
      output: (stdout + '\n' + stderr).slice(-2000),
    }, { status: 500 })
  }
}
