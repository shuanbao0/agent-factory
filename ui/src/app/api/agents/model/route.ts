import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('id')
  if (!agentId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const meta = core.repo.agentMetaRepo.readMeta(agentId)
  return NextResponse.json({ model: meta?.model || null })
}

export async function PUT(req: NextRequest) {
  try {
    const { agentId, model } = await req.json()
    if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })

    core.repo.agentMetaRepo.updateMeta(agentId, (meta) => {
      if (model) {
        return { ...meta, model }
      }
      const updated = { ...meta }
      delete updated.model
      return updated
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
