import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/permissions
 *
 * Returns the communication permissions matrix.
 * { permissions: { "pm": ["researcher", "product"], ... } }
 */
export async function GET() {
  try {
    const permissions: Record<string, string[]> = {}
    const agents = core.db.agentQueries.findAllAgents()
    for (const a of agents) {
      permissions[a.id] = (a.peers as string[]) || []
    }
    return NextResponse.json({ permissions })
  } catch (e) {
    return NextResponse.json({ error: String(e), permissions: {} }, { status: 500 })
  }
}

/**
 * PUT /api/agents/permissions
 *
 * Save the full permissions matrix.
 * Body: { permissions: { "pm": ["researcher", "product"], ... } }
 */
export async function PUT(req: NextRequest) {
  try {
    const { permissions } = await req.json() as {
      permissions: Record<string, string[]>
    }

    if (!permissions || typeof permissions !== 'object') {
      return NextResponse.json({ error: 'permissions object required' }, { status: 400 })
    }

    for (const [agentId, peers] of Object.entries(permissions)) {
      if (!core.repo.agentMetaRepo.exists(agentId)) continue
      core.repo.agentMetaRepo.updateMeta(agentId, (meta) => ({
        ...meta,
        peers: Array.isArray(peers) ? peers : [],
      }))
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
