import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import { restartGateway, getStatus } from '@/lib/gateway-manager'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')

function getInstalledVersion(): string | null {
  try {
    const openclawBin = resolve(PROJECT_ROOT, 'node_modules/.bin/openclaw')
    if (!existsSync(openclawBin)) return null
    return execSync(`${openclawBin} --version 2>/dev/null || echo unknown`, { cwd: PROJECT_ROOT, timeout: 10000 })
      .toString().trim()
  } catch {
    // Fallback: use npm list to get version
    try {
      const output = execSync('npm list openclaw --depth=0 --json 2>/dev/null', {
        cwd: PROJECT_ROOT,
        timeout: 10000
      }).toString()
      const info = JSON.parse(output)
      return info.dependencies?.openclaw?.version || null
    } catch { return null }
  }
}

function getLatestVersion(): string | null {
  try {
    return execSync('npm view openclaw version 2>/dev/null', { timeout: 15000 })
      .toString().trim()
  } catch { return null }
}

function getAvailableVersions(): string[] {
  try {
    const output = execSync('npm view openclaw versions --json 2>/dev/null', { timeout: 15000 }).toString()
    const versions: string[] = JSON.parse(output)
    // Filter out beta/prerelease, return newest first
    return versions.filter(v => !v.includes('-')).reverse()
  } catch { return [] }
}

// GET: check current + latest version + available versions
export async function GET() {
  const current = getInstalledVersion()
  const latest = getLatestVersion()
  const hasUpdate = !!(current && latest && current !== latest && current !== 'unknown')
  const versions = getAvailableVersions()

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
    const current = getInstalledVersion()

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

    const output = execSync(`npm install openclaw@${targetVersion} 2>&1`, {
      cwd: PROJECT_ROOT,
      timeout: 120000,
      env: { ...process.env },
    }).toString()

    const newVersion = getInstalledVersion()
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
      output: output.slice(-1000),
    })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e.message || 'Update failed',
      output: e.stdout?.toString()?.slice(-500) || e.stderr?.toString()?.slice(-500) || '',
    }, { status: 500 })
  }
}
