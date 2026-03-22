/**
 * GET /api/agents/:id/workspace
 *   - No `file` param → list workspace directory entries
 *   - With `file` param → return file content
 *
 * PUT /api/agents/:id/workspace
 *   - Body: { file, content } → write content to workspace file
 */
import { NextRequest, NextResponse } from 'next/server'
import { basename, resolve, join } from 'path'
import { stripMarkerBlock, injectBaseRulesForAgent } from '@/lib/base-rules'
import core from '@/lib/core-bridge'

// Marker constants matching base-rules.ts
const AGENTS_BEGIN = '<!-- BASE-RULES:BEGIN -->'
const AGENTS_END = '<!-- BASE-RULES:END -->'
const REMINDER_BEGIN = '<!-- BASE-RULES-REMINDER:BEGIN -->'
const REMINDER_END = '<!-- BASE-RULES-REMINDER:END -->'
const SOUL_BEGIN = '<!-- BASE-SOUL:BEGIN -->'
const SOUL_END = '<!-- BASE-SOUL:END -->'

/** Strip injected base-rules marker blocks from file content before sending to frontend */
function stripBaseRulesFromContent(fileName: string, content: string): string {
  const name = basename(fileName)
  if (name === 'AGENTS.md') {
    let cleaned = stripMarkerBlock(content, AGENTS_BEGIN, AGENTS_END)
    cleaned = stripMarkerBlock(cleaned, REMINDER_BEGIN, REMINDER_END)
    return cleaned
  }
  if (name === 'SOUL.md') {
    return stripMarkerBlock(content, SOUL_BEGIN, SOUL_END)
  }
  return content
}

export const dynamic = 'force-dynamic'

const AGENTS_DIR = core.common.paths.AGENTS_DIR

function getWorkspaceDir(id: string) {
  return join(AGENTS_DIR, id)
}

/** Ensure resolved path is inside workspace dir (prevent path traversal + symlink escape) */
function safePath(workspaceDir: string, filePath: string): string | null {
  const resolved = resolve(workspaceDir, filePath)
  if (!resolved.startsWith(workspaceDir + '/') && resolved !== workspaceDir) return null
  const real = core.common.fileBrowser.realPath(resolved)
  if (real) {
    const realBase = core.common.fileBrowser.realPath(workspaceDir)
    if (realBase && !real.startsWith(realBase + '/') && real !== realBase) return null
    return real
  }
  return resolved  // file doesn't exist yet (PUT scenario), prefix check already passed
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  if (!core.common.validateAgentId(id).valid) {
    return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 })
  }
  const workspaceDir = getWorkspaceDir(id)

  if (!core.repo.agentMetaRepo.exists(id) && !core.common.fileBrowser.pathExists(workspaceDir)) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const file = req.nextUrl.searchParams.get('file')
  const dir = req.nextUrl.searchParams.get('dir') || ''

  if (!file) {
    // List directory
    try {
      const result = core.common.fileBrowser.listDirectory(workspaceDir, dir)
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      // Map to expected format
      const entries = (result.entries as Array<Record<string, unknown>>) || []
      const prefix = dir ? dir + '/' : ''
      const files = entries.map((e: Record<string, unknown>) => ({
        name: e.name,
        type: e.type,
        size: e.size,
        path: prefix + e.name,
      }))
      return NextResponse.json({ files })
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  // Read file content
  const resolved = safePath(workspaceDir, file)
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  // Read via agentMetaRepo for agent files
  try {
    const content = core.repo.agentMetaRepo.readAgentFile(id, file)
    if (content === null) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    const stripped = stripBaseRulesFromContent(file, content)
    return NextResponse.json({ content: stripped })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  if (!core.common.validateAgentId(id).valid) {
    return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 })
  }
  const workspaceDir = getWorkspaceDir(id)

  if (!core.repo.agentMetaRepo.exists(id) && !core.common.fileBrowser.pathExists(workspaceDir)) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const body = await req.json()
  const { file, content } = body

  if (!file || typeof content !== 'string') {
    return NextResponse.json({ error: 'Missing file or content' }, { status: 400 })
  }

  const resolved = safePath(workspaceDir, file)
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  try {
    core.repo.agentMetaRepo.writeAgentFile(id, file, content)

    // Re-inject base-rules after user edits AGENTS.md or SOUL.md
    const name = basename(file)
    if (name === 'AGENTS.md' || name === 'SOUL.md') {
      injectBaseRulesForAgent(workspaceDir)
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
