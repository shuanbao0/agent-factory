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
import { existsSync, realpathSync } from 'fs'
import { stripMarkerBlock, injectBaseRulesForAgent } from '@/lib/base-rules'
import { validateAgentId } from '@/lib/shared-bridge'
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

const PROJECT_ROOT = resolve(process.cwd(), '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')

function getWorkspaceDir(id: string) {
  return join(AGENTS_DIR, id)
}

/** Ensure resolved path is inside workspace dir (prevent path traversal + symlink escape) */
function safePath(workspaceDir: string, filePath: string): string | null {
  const resolved = resolve(workspaceDir, filePath)
  if (!resolved.startsWith(workspaceDir + '/') && resolved !== workspaceDir) return null
  try {
    const real = realpathSync(resolved)
    const realBase = realpathSync(workspaceDir)
    if (!real.startsWith(realBase + '/') && real !== realBase) return null
    return real
  } catch {
    return resolved  // file doesn't exist yet (PUT scenario), prefix check already passed
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  if (!validateAgentId(id).valid) {
    return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 })
  }
  const workspaceDir = getWorkspaceDir(id)

  if (!core.repo.agentMetaRepo.exists(id) && !existsSync(workspaceDir)) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const file = req.nextUrl.searchParams.get('file')

  if (!file) {
    // List directory
    try {
      const result = core.common.fileBrowser.listDirectory(workspaceDir, '')
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      // Map to expected format
      const entries = (result.entries as Array<Record<string, unknown>>) || []
      const files = entries.map((e: Record<string, unknown>) => ({
        name: e.name,
        type: e.type,
        size: e.size,
        path: e.name,
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
  if (!validateAgentId(id).valid) {
    return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 })
  }
  const workspaceDir = getWorkspaceDir(id)

  if (!core.repo.agentMetaRepo.exists(id) && !existsSync(workspaceDir)) {
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
