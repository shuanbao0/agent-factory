import { NextRequest, NextResponse } from 'next/server'
import { existsSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { decodeProjectId } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = decodeProjectId(params.id)
    // Security: resolve and verify path stays within PROJECTS_DIR
    if (!id || id.includes('..')) {
      return NextResponse.json({ error: 'invalid project id' }, { status: 400 })
    }

    const projectDir = resolve(PROJECTS_DIR, id)
    if (!projectDir.startsWith(PROJECTS_DIR + '/')) {
      return NextResponse.json({ error: 'invalid project id' }, { status: 400 })
    }
    if (!existsSync(projectDir)) {
      return NextResponse.json({ error: `Project not found: ${id}` }, { status: 404 })
    }

    rmSync(projectDir, { recursive: true })
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
