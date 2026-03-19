import { NextRequest, NextResponse } from 'next/server'
import { resolve } from 'path'
import { existsSync } from 'fs'
import { decodeProjectId } from '@/lib/utils'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = resolve(PROJECT_ROOT, 'projects')
const WORKSPACES_DIR = resolve(PROJECT_ROOT, 'workspaces')

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
  const id = decodeProjectId(params.id)

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

    const result = core.common.fileBrowser.getFileContent(baseDir, fileParam)
    if (result.error) {
      const status = result.error === 'File not found' ? 404 : result.error === 'Invalid path' ? 400 : 400
      return NextResponse.json({ error: result.error }, { status })
    }
    return NextResponse.json(result)
  }

  // ── List agent workspaces overview ─────────────────────────────
  if (sourceParam === 'workspaces' && !agentIdParam) {
    try {
      const meta = core.repo.projectMetaRepo.readMeta(id) as Record<string, unknown> | null
      let agentIds: string[] = (meta?.assignedAgents as string[]) || []

      if (agentIds.length === 0) {
        try {
          const workspaceList = core.common.fileBrowser.listWorkspaces()
          agentIds = workspaceList.map(ws => ws.agentId)
        } catch { /* ignore */ }
      }

      const agents = core.common.fileBrowser.listAgentWorkspaces(WORKSPACES_DIR, agentIds)
      return NextResponse.json({ agents })
    } catch (e) {
      return NextResponse.json({ error: String(e), agents: [] }, { status: 500 })
    }
  }

  // ── List directory entries (lazy, one level) ───────────────────
  try {
    let baseDir: string
    if (sourceParam === 'workspaces' && agentIdParam) {
      const agentWs = resolve(WORKSPACES_DIR, agentIdParam)
      if (!agentWs.startsWith(WORKSPACES_DIR + '/')) {
        return NextResponse.json({ error: 'Invalid agent id' }, { status: 400 })
      }
      baseDir = agentWs
    } else {
      baseDir = projectDir
    }

    const result = core.common.fileBrowser.listDirectory(baseDir, dirParam)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e), entries: [] }, { status: 500 })
  }
}
