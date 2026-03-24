import { NextRequest, NextResponse } from 'next/server'
import { execFile as execFileCb, exec as execCb } from 'child_process'
import { promisify } from 'util'
import { dirname, join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { restartGateway, getStatus } from '@/lib/gateway-manager'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFileCb)
const execAsync = promisify(execCb)

const PROJECT_ROOT = core.common.paths.PROJECT_ROOT

async function getInstalledVersion(): Promise<string | null> {
  // Walk up from PROJECT_ROOT to find node_modules/openclaw/package.json (handles monorepo hoisting)
  let dir = PROJECT_ROOT
  while (dir !== '/') {
    const pkgPath = join(dir, 'node_modules', 'openclaw', 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        return pkg.version || 'unknown'
      } catch { break }
    }
    dir = dirname(dir)
  }
  return null
}

async function getLatestVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('npm', ['view', 'openclaw', 'version'], { timeout: 15000 })
    return stdout.toString().trim()
  } catch { return null }
}

async function getAvailableVersions(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('npm', ['view', 'openclaw', 'versions', '--json'], { timeout: 15000 })
    const versions: string[] = JSON.parse(stdout.toString())
    // Filter out beta/prerelease, return newest first
    return versions.filter(v => !v.includes('-')).reverse()
  } catch { return [] }
}

// Returns true if version a is strictly newer than version b
function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(s => parseInt(s, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map(s => parseInt(s, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0
    if (na > nb) return true
    if (na < nb) return false
  }
  return false
}

// GET: check current + latest version + available versions
export async function GET() {
  const [current, latest, versions] = await Promise.all([
    getInstalledVersion(),
    getLatestVersion(),
    getAvailableVersions(),
  ])
  const hasUpdate = !!(current && latest && current !== 'unknown' && isNewer(latest, current))

  return NextResponse.json({
    current: current || 'unknown',
    latest: latest || 'unknown',
    hasUpdate,
    versions,
    checkedAt: new Date().toISOString(),
  })
}

// POST: perform update
export async function POST(req: NextRequest) {
  try {
    const current = await getInstalledVersion()

    // Support installing a specific version via request body
    let targetVersion = 'latest'
    try {
      const body = await req.json()
      if (body.version && /^[\w.\-]+$/.test(body.version)) {
        targetVersion = body.version
      }
    } catch {
      // No body or invalid JSON — use latest
    }

    const { stdout } = await execAsync(`npm install openclaw@${targetVersion} 2>&1`, {
      cwd: PROJECT_ROOT,
      timeout: 120000,
      env: { ...process.env },
    })

    const newVersion = await getInstalledVersion()
    const updated = current !== newVersion

    // Auto-restart gateway if updated and currently running
    let restarted = false
    if (updated) {
      const status = await getStatus()
      if (status.status === 'running') {
        const restartResult = await restartGateway()
        restarted = restartResult.ok
      }
    }

    return NextResponse.json({
      ok: true,
      previousVersion: current,
      currentVersion: newVersion,
      updated,
      restarted,
      output: stdout.slice(-1000),
    })
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e)
    const execErr = e as { stdout?: Buffer | string; stderr?: Buffer | string }
    return NextResponse.json({
      ok: false,
      error: errMsg || 'Update failed',
      output: execErr.stdout?.toString()?.slice(-500) || execErr.stderr?.toString()?.slice(-500) || '',
    }, { status: 500 })
  }
}
