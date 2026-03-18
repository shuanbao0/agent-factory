import { NextRequest, NextResponse } from 'next/server'
import { decodeProjectId } from '@/lib/utils'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = decodeProjectId(params.id)
    // Security: reject path traversal at API boundary
    if (!id || id.includes('..')) {
      return NextResponse.json({ error: 'invalid project id' }, { status: 400 })
    }

    core.repo.projectMetaRepo.deleteProject(id)
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    const msg = String(e)
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    if (msg.includes('invalid')) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
