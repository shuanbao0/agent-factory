import { NextRequest, NextResponse } from 'next/server'
import { resolve } from 'path'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

const AGENTS_DIR = core.common.paths.AGENTS_DIR

/**
 * POST /api/agents/deploy
 *
 * sync-config action: regenerate TOOLS.md in agents/{id}/ from agent.json skills[].
 */
export async function POST(req: NextRequest) {
  try {
    const { agentId, action } = await req.json() as {
      agentId: string
      action: 'sync-config'
    }

    if (!agentId || action !== 'sync-config') {
      return NextResponse.json({ error: 'agentId and action "sync-config" required' }, { status: 400 })
    }

    if (!core.repo.agentMetaRepo.exists(agentId)) {
      return NextResponse.json({ error: `Agent directory not found: agents/${agentId}` }, { status: 404 })
    }

    const meta = core.repo.agentMetaRepo.readMeta(agentId)
    const agentSkills = meta?.skills || []
    const agentDir = resolve(AGENTS_DIR, agentId)
    const toolsMdContent = core.common.generateToolsMd(agentId, agentSkills as string[], agentDir)
    core.repo.agentMetaRepo.writeAgentFile(agentId, 'TOOLS.md', toolsMdContent)

    return NextResponse.json({ ok: true, action: 'sync-config', agentId, synced: ['TOOLS.md'] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
