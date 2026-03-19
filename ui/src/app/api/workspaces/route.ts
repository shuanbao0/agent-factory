/**
 * GET /api/workspaces
 *   - No params → list all active workspaces + archived
 *   - ?agentId=xxx&file=path → read file from active workspace
 *   - ?archived=dirName&file=path → read file from archived workspace
 *
 * DELETE /api/workspaces
 *   - Body: { dirName } → delete an archived directory
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolve, join } from 'path'
import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { logError } from '@/lib/error-logger'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')
const ARCHIVED_DIR = join(WORKSPACES_DIR, '.archived')

/** Ensure resolved path is inside base dir (prevent path traversal) */
function safePath(baseDir: string, filePath: string): string | null {
  const resolved = resolve(baseDir, filePath)
  if (!resolved.startsWith(baseDir + '/') && resolved !== baseDir) {
    return null
  }
  return resolved
}

/** Recursively list files in a directory */
function listFiles(dir: string, prefix = ''): { name: string; path: string; size: number }[] {
  const results: { name: string; path: string; size: number }[] = []
  if (!existsSync(dir)) return results

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        results.push(...listFiles(fullPath, relativePath))
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        try {
          const stat = statSync(fullPath)
          results.push({ name: entry.name, path: relativePath, size: stat.size })
        } catch {
          results.push({ name: entry.name, path: relativePath, size: 0 })
        }
      }
    }
  } catch (err) { logError('workspaces-api/list-files', err) }

  return results
}

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId')
  const archivedDir = req.nextUrl.searchParams.get('archived')
  const file = req.nextUrl.searchParams.get('file')

  // ── Read file from active workspace ───────────────────────────
  if (agentId && file) {
    const result = core.common.fileBrowser.readWorkspaceFile(agentId, file)
    if ('error' in result) {
      const status = result.error === 'File not found' ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json({ content: (result as { content: string }).content })
  }

  // ── Read file from archived workspace ─────────────────────────
  if (archivedDir && file) {
    // Validate dirName contains no path separators
    if (archivedDir.includes('/') || archivedDir.includes('\\') || archivedDir.includes('..')) {
      return NextResponse.json({ error: 'Invalid archive name' }, { status: 400 })
    }
    const archDir = join(ARCHIVED_DIR, archivedDir)
    const resolved = safePath(archDir, file)
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    if (!existsSync(resolved)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    try {
      const content = readFileSync(resolved, 'utf-8')
      return NextResponse.json({ content })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // ── List all workspaces + archives ────────────────────────────
  try {
    const activeList = core.common.fileBrowser.listWorkspaces()
    const workspaces = activeList.map(ws => {
      const wsPath = join(WORKSPACES_DIR, ws.agentId)
      const files = listFiles(wsPath)
      return {
        agentId: ws.agentId,
        files,
        fileCount: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
      }
    })

    const archivedList = core.common.fileBrowser.listArchivedWorkspaces()
    const archived = archivedList.map(arch => {
      const archPath = join(ARCHIVED_DIR, arch.dirName)
      const files = listFiles(archPath)
      return {
        dirName: arch.dirName,
        agentId: arch.agentId,
        archivedAt: arch.archivedAt,
        files,
        fileCount: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
      }
    })

    return NextResponse.json({ workspaces, archived })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { dirName } = await req.json()
    if (!dirName || typeof dirName !== 'string') {
      return NextResponse.json({ error: 'dirName is required' }, { status: 400 })
    }

    // Validate dirName: no path separators or traversal
    if (dirName.includes('/') || dirName.includes('\\') || dirName.includes('..')) {
      return NextResponse.json({ error: 'Invalid archive name' }, { status: 400 })
    }

    const archPath = join(ARCHIVED_DIR, dirName)
    if (!existsSync(archPath)) {
      return NextResponse.json({ error: 'Archive not found' }, { status: 404 })
    }

    core.common.fileBrowser.deleteArchive(dirName)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
