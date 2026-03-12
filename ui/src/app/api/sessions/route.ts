import { NextResponse } from 'next/server'
import { gwCallAsync } from '@/lib/gateway-client'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const params: Record<string, unknown> = {}
    if (searchParams.get('agentId')) params.agentId = searchParams.get('agentId')
    if (searchParams.get('limit')) params.limit = Number(searchParams.get('limit'))

    const result = await gwCallAsync('sessions.list', Object.keys(params).length ? params : undefined)
    return NextResponse.json({ ...(result as object), source: 'gateway' })
  } catch (e) {
    return NextResponse.json({ error: String(e), source: 'error' }, { status: 502 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionKey = searchParams.get('sessionKey')
    if (!sessionKey) {
      return NextResponse.json({ error: 'sessionKey required' }, { status: 400 })
    }
    const result = await gwCallAsync('sessions.kill', { sessionKey })
    return NextResponse.json({ ...(result as object), ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
