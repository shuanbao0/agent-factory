import { NextRequest, NextResponse } from 'next/server'
import { execFile as execFileCb, exec as execCb } from 'child_process'
import { promisify } from 'util'
import { resolve } from 'path'
import { existsSync } from 'fs'
import { restartGateway, getStatus } from '@/lib/gateway-manager'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFileCb)
const execAsync = promisify(execCb)

const PROJECT_ROOT = resolve(process.cwd(), '..')

async function getInstalledVersion(): Promise<string | null> {
  try {
    const openclawBin = resolve(PROJECT_ROOT, 'node_modules/.bin/openclaw')
    if (!existsSync(openclawBin)) return null
    const { stdout } = await execFileAsync(openclawBin, ['--version'], { cwd: PROJECT_ROOT, timeout: 10000 })
    const ver = stdout.toString().trim()
    return ver || 'unknown'
  } catch {
    // Fallback: use npm list to get version
    try {
      const { stdout } = await execFileAsync('npm', ['list', 'openclaw', '--depth=0', '--json'], {
        cwd: PROJECT_ROOT,
        timeout: 10000,
      })
      const info = JSON.parse(stdout.toString())
      return info.dependencies?.openclaw?.version || null
    } catch { return null }
  }
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

// GET: check current + latest version + available versions
export async function GET() {
  const [current, latest, versions] = await Promise.all([
    getInstalledVersion(),
    getLatestVersion(),
    getAvailableVersions(),
  ])
  const hasUpdate = !!(current && latest && current !== latest && current !== 'unknown')

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
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e.message || 'Update failed',
      output: e.stdout?.toString()?.slice(-500) || e.stderr?.toString()?.slice(-500) || '',
    }, { status: 500 })
  }
}
