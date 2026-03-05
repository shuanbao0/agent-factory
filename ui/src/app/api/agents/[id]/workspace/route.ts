/**
 * GET /api/agents/:id/workspace
 *   - No `file` param → list workspace directory entries
 *   - With `file` param → return file content
 *
 * PUT /api/agents/:id/workspace
 *   - Body: { file, content } → write content to workspace file
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolve, join, basename } from 'path'
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { stripMarkerBlock, injectBaseRulesForAgent } from '@/lib/base-rules'

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

/** Ensure resolved path is inside workspace dir (prevent path traversal) */
function safePath(workspaceDir: string, filePath: string): string | null {
  const resolved = resolve(workspaceDir, filePath)
  if (!resolved.startsWith(workspaceDir + '/') && resolved !== workspaceDir) {
    return null
  }
  return resolved
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const workspaceDir = getWorkspaceDir(id)

  if (!existsSync(workspaceDir)) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const file = req.nextUrl.searchParams.get('file')

  if (!file) {
    // List directory
    try {
      const entries = readdirSync(workspaceDir, { withFileTypes: true })
      const files = entries.map(e => {
        const fullPath = join(workspaceDir, e.name)
        const isFile = e.isFile() || e.isSymbolicLink()
        const stat = isFile ? statSync(fullPath) : null
        return {
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
          size: stat?.size,
          path: e.name,
        }
      })
      return NextResponse.json({ files })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  // Read file content
  const resolved = safePath(workspaceDir, file)
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  if (!existsSync(resolved)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  try {
    const raw = readFileSync(resolved, 'utf-8')
    const content = stripBaseRulesFromContent(file, raw)
    return NextResponse.json({ content })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const workspaceDir = getWorkspaceDir(id)

  if (!existsSync(workspaceDir)) {
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
    // Ensure parent dir exists
    const parentDir = resolve(resolved, '..')
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true })
    }
    writeFileSync(resolved, content, 'utf-8')

    // Re-inject base-rules after user edits AGENTS.md or SOUL.md
    const name = basename(file)
    if (name === 'AGENTS.md' || name === 'SOUL.md') {
      injectBaseRulesForAgent(workspaceDir)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
