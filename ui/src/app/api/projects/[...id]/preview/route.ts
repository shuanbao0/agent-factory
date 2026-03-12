import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { spawn, execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFileCb)
import net from 'net'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')
const BASE_PORT = 3200

// In-memory process tracking (survives across requests within same server instance)
const runningServers = new Map<string, { pid: number; port: number }>()

/** Resolve the codeLocation for a project */
function resolveCodeDir(projectId: string): string | null {
  const projectDir = join(PROJECTS_DIR, projectId)
  try {
    const metaPath = join(projectDir, '.project-meta.json')
    if (!existsSync(metaPath)) return null
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    if (!meta.codeLocation) return null
    const fromRoot = resolve(PROJECT_ROOT, meta.codeLocation)
    const fromProject = resolve(projectDir, meta.codeLocation)
    if (existsSync(fromRoot)) return fromRoot
    if (existsSync(fromProject)) return fromProject
  } catch { /* ignore */ }
  return null
}

/** Detect project type from package.json / files */
function detectProjectType(codeDir: string): { type: string; devCmd: string[] } {
  const pkgPath = join(codeDir, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['next']) return { type: 'nextjs', devCmd: ['npx', 'next', 'dev'] }
      if (deps['vite']) return { type: 'vite', devCmd: ['npx', 'vite', '--host'] }
      if (pkg.scripts?.dev) return { type: 'node', devCmd: ['npm', 'run', 'dev'] }
      if (pkg.scripts?.start) return { type: 'node', devCmd: ['npm', 'run', 'start'] }
    } catch { /* ignore */ }
  }
  return { type: 'unknown', devCmd: [] }
}

/** Check if a port is listening */
function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket()
    sock.setTimeout(500)
    sock.on('connect', () => { sock.destroy(); resolve(true) })
    sock.on('timeout', () => { sock.destroy(); resolve(false) })
    sock.on('error', () => { sock.destroy(); resolve(false) })
    sock.connect(port, '127.0.0.1')
  })
}

/** Check if a PID is still alive */
function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

/** Find an available port starting from base */
async function findAvailablePort(start: number): Promise<number> {
  for (let port = start; port < start + 100; port++) {
    const inUse = await isPortListening(port)
    if (!inUse) return port
  }
  return start
}

/**
 * GET /api/projects/[id]/preview — check dev server status
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string[] } }
) {
  const id = params.id.join('/')
  if (!id || id.includes('..')) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  const resolvedDir = resolve(PROJECTS_DIR, id)
  if (!resolvedDir.startsWith(PROJECTS_DIR + '/')) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const codeDir = resolveCodeDir(id)
  if (!codeDir) {
    return NextResponse.json({ running: false, type: 'unknown', error: 'No code location found' })
  }

  const { type } = detectProjectType(codeDir)
  const tracked = runningServers.get(id)

  // Check if tracked process is still alive
  if (tracked) {
    if (isPidAlive(tracked.pid)) {
      const listening = await isPortListening(tracked.port)
      return NextResponse.json({
        running: true,
        ready: listening,
        port: tracked.port,
        pid: tracked.pid,
        type,
        url: `http://localhost:${tracked.port}`,
      })
    } else {
      // Process died, clean up
      runningServers.delete(id)
    }
  }

  // Check if something is already running on common ports (e.g. manually started)
  for (let port = BASE_PORT; port < BASE_PORT + 20; port++) {
    const listening = await isPortListening(port)
    if (listening) {
      // Verify it's our project by checking the process cwd
      try {
        const { stdout: pidOut } = await execFileAsync('lsof', ['-i', `:${port}`, '-t'], { timeout: 5000 })
          .catch(() => ({ stdout: '' }))
        const pid = pidOut.toString().trim().split('\n')[0]
        if (pid) {
          const { stdout: lsofOut } = await execFileAsync('lsof', ['-p', pid], { timeout: 5000 })
            .catch(() => ({ stdout: '' }))
          const cwdLine = lsofOut.toString().split('\n').find(l => l.includes('cwd'))
          const cwd = cwdLine ? cwdLine.trim().split(/\s+/).pop() || '' : ''
          if (cwd === codeDir) {
            runningServers.set(id, { pid: parseInt(pid), port })
            return NextResponse.json({
              running: true,
              ready: true,
              port,
              pid: parseInt(pid),
              type,
              url: `http://localhost:${port}`,
            })
          }
        }
      } catch { /* ignore */ }
    }
  }

  return NextResponse.json({ running: false, port: null, type, url: null })
}

/**
 * POST /api/projects/[id]/preview — start or stop dev server
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string[] } }
) {
  const id = params.id.join('/')
  if (!id || id.includes('..')) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  const resolvedDir = resolve(PROJECTS_DIR, id)
  if (!resolvedDir.startsWith(PROJECTS_DIR + '/')) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const action = body.action as string

  if (action === 'stop') {
    const tracked = runningServers.get(id)
    if (tracked && isPidAlive(tracked.pid)) {
      try {
        // Kill process group to ensure child processes are also killed
        process.kill(-tracked.pid, 'SIGTERM')
      } catch {
        try { process.kill(tracked.pid, 'SIGTERM') } catch { /* ignore */ }
      }
      runningServers.delete(id)
      return NextResponse.json({ ok: true, stopped: true })
    }
    return NextResponse.json({ ok: true, stopped: false, message: 'No server running' })
  }

  if (action === 'start') {
    // Check if already running
    const tracked = runningServers.get(id)
    if (tracked && isPidAlive(tracked.pid)) {
      const listening = await isPortListening(tracked.port)
      return NextResponse.json({
        ok: true,
        running: true,
        ready: listening,
        port: tracked.port,
        url: `http://localhost:${tracked.port}`,
        message: 'Already running',
      })
    }

    const codeDir = resolveCodeDir(id)
    if (!codeDir) {
      return NextResponse.json({ error: 'No code location found' }, { status: 400 })
    }

    const { type, devCmd } = detectProjectType(codeDir)
    if (devCmd.length === 0) {
      return NextResponse.json({ error: `Cannot start: unknown project type in ${codeDir}` }, { status: 400 })
    }

    // Check node_modules
    if (!existsSync(join(codeDir, 'node_modules'))) {
      return NextResponse.json({ error: 'Dependencies not installed. Run npm install first.' }, { status: 400 })
    }

    const port = await findAvailablePort(BASE_PORT)

    // Build command with port flag
    const args = [...devCmd.slice(1)]
    if (type === 'nextjs') {
      args.push('-p', String(port))
    } else if (type === 'vite') {
      args.push('--port', String(port))
    }

    const child = spawn(devCmd[0], args, {
      cwd: codeDir,
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, PORT: String(port) },
    })

    child.unref()

    if (child.pid) {
      runningServers.set(id, { pid: child.pid, port })
      return NextResponse.json({
        ok: true,
        running: true,
        ready: false,
        port,
        pid: child.pid,
        type,
        url: `http://localhost:${port}`,
      })
    }

    return NextResponse.json({ error: 'Failed to start server' }, { status: 500 })
  }

  return NextResponse.json({ error: 'Invalid action. Use "start" or "stop".' }, { status: 400 })
}
