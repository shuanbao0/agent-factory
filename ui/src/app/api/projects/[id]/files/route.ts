import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join, resolve } from 'path'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '__pycache__', '.turbo', '.vercel'])
const MAX_ENTRIES = 500

interface DirEntry {
  name: string
  type: 'file' | 'directory'
  size?: number
  path: string
  childCount?: number
}

/**
 * GET /api/projects/[id]/files
 *
 * Query params:
 *   ?dir=subdir          — list contents of a subdirectory (default: root)
 *   ?source=project|workspaces  — project files or agent workspaces (default: project)
 *   ?agentId=xxx         — when source=workspaces, browse a specific agent's workspace
 *   ?file=path&source=project|workspaces  — return file content
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  // Security: resolve the id-based path and verify it stays within PROJECTS_DIR
  const projectDir = resolve(PROJECTS_DIR, id)
  if (!projectDir.startsWith(PROJECTS_DIR + '/') && projectDir !== PROJECTS_DIR) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  if (!existsSync(projectDir)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const fileParam = req.nextUrl.searchParams.get('file')
  const sourceParam = req.nextUrl.searchParams.get('source') || 'project'
  const dirParam = req.nextUrl.searchParams.get('dir') || ''
  const agentIdParam = req.nextUrl.searchParams.get('agentId')

  // ── Return file content ────────────────────────────────────────
  if (fileParam) {
    let baseDir: string
    if (sourceParam === 'workspaces' && agentIdParam) {
      baseDir = resolve(WORKSPACES_DIR, agentIdParam)
      if (!baseDir.startsWith(WORKSPACES_DIR + '/')) {
        return NextResponse.json({ error: 'Invalid agent id' }, { status: 400 })
      }
    } else {
      baseDir = projectDir
    }

    const filePath = resolve(baseDir, fileParam)
    if (!filePath.startsWith(baseDir + '/') && filePath !== baseDir) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    try {
      const stat = statSync(filePath)
      if (stat.isDirectory()) {
        return NextResponse.json({ error: 'Is a directory' }, { status: 400 })
      }
      if (stat.size > 1_000_000) {
        return NextResponse.json({ content: '(File too large to preview, > 1MB)', size: stat.size })
      }
      const content = readFileSync(filePath, 'utf-8')
      return NextResponse.json({ content, size: stat.size })
    } catch {
      return NextResponse.json({ content: '(Binary file, cannot preview)' })
    }
  }

  // ── List agent workspaces overview ─────────────────────────────
  if (sourceParam === 'workspaces' && !agentIdParam) {
    try {
      // Read project meta to get assignedAgents
      const metaPath = join(projectDir, '.project-meta.json')
      let assignedAgents: string[] = []
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
          assignedAgents = meta.assignedAgents || []
        } catch { /* ignore */ }
      }

      // If no assigned agents, scan all workspaces
      if (assignedAgents.length === 0 && existsSync(WORKSPACES_DIR)) {
        try {
          assignedAgents = readdirSync(WORKSPACES_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.'))
            .map(d => d.name)
        } catch { /* ignore */ }
      }

      const agents: { agentId: string; fileCount: number; totalSize: number }[] = []
      for (const agentId of assignedAgents) {
        const wsDir = join(WORKSPACES_DIR, agentId)
        if (!existsSync(wsDir)) continue
        const { count, size } = countDirStats(wsDir)
        if (count === 0) continue
        agents.push({ agentId, fileCount: count, totalSize: size })
      }

      return NextResponse.json({ agents })
    } catch (e) {
      return NextResponse.json({ error: String(e), agents: [] }, { status: 500 })
    }
  }

  // ── List directory entries (lazy, one level) ───────────────────
  try {
    let targetDir: string
    if (sourceParam === 'workspaces' && agentIdParam) {
      const agentWs = resolve(WORKSPACES_DIR, agentIdParam)
      if (!agentWs.startsWith(WORKSPACES_DIR + '/')) {
        return NextResponse.json({ error: 'Invalid agent id' }, { status: 400 })
      }
      targetDir = dirParam ? resolve(agentWs, dirParam) : agentWs
      if (!targetDir.startsWith(agentWs + '/') && targetDir !== agentWs) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
      }
    } else {
      targetDir = dirParam ? resolve(projectDir, dirParam) : projectDir
      if (!targetDir.startsWith(projectDir + '/') && targetDir !== projectDir) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
      }
    }

    if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
      return NextResponse.json({ entries: [], currentDir: dirParam, breadcrumb: [] })
    }

    const rawEntries = readdirSync(targetDir, { withFileTypes: true })
    const filtered = rawEntries.filter(e => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))

    // Sort: directories first, then files, alphabetical within each group
    filtered.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    const truncated = filtered.length > MAX_ENTRIES
    const limited = truncated ? filtered.slice(0, MAX_ENTRIES) : filtered

    const entries: DirEntry[] = limited.map(entry => {
      const fullPath = join(targetDir, entry.name)
      const relativePath = dirParam ? `${dirParam}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        let childCount = 0
        try {
          childCount = readdirSync(fullPath).filter(n => !n.startsWith('.') && !SKIP_DIRS.has(n)).length
        } catch { /* permission denied etc */ }
        return { name: entry.name, type: 'directory' as const, path: relativePath, childCount }
      } else {
        let size: number | undefined
        try { size = statSync(fullPath).size } catch { /* ignore */ }
        return { name: entry.name, type: 'file' as const, path: relativePath, size }
      }
    })

    // Build breadcrumb
    const breadcrumb = dirParam ? dirParam.split('/').filter(Boolean) : []

    return NextResponse.json({ entries, currentDir: dirParam, breadcrumb, truncated })
  } catch (e) {
    return NextResponse.json({ error: String(e), entries: [] }, { status: 500 })
  }
}

/** Count total files and size in a directory (recursive, capped for perf) */
function countDirStats(dir: string, maxDepth = 6, depth = 0): { count: number; size: number } {
  if (depth > maxDepth) return { count: 0, size: 0 }
  let count = 0
  let size = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        const sub = countDirStats(fullPath, maxDepth, depth + 1)
        count += sub.count
        size += sub.size
      } else {
        count++
        try { size += statSync(fullPath).size } catch { /* ignore */ }
      }
    }
  } catch { /* permission denied */ }
  return { count, size }
}
