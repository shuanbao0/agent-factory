import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const config = core.repo.configRepo.getConfig()
    const agents = (config.agents || {}) as Record<string, unknown>
    const defaults = (agents.defaults || {}) as Record<string, unknown>
    return NextResponse.json({
      memorySearch: defaults.memorySearch || {},
      compaction: defaults.compaction || {},
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { memorySearch, compaction } = body as {
      memorySearch?: Record<string, unknown>
      compaction?: Record<string, unknown>
    }

    core.repo.configRepo.updateConfig((config: Record<string, unknown>) => {
      if (!config.agents || typeof config.agents !== 'object') {
        config.agents = {}
      }
      const agents = config.agents as Record<string, unknown>
      if (!agents.defaults || typeof agents.defaults !== 'object') {
        agents.defaults = {}
      }
      const defaults = agents.defaults as Record<string, unknown>

      if (memorySearch !== undefined) defaults.memorySearch = memorySearch
      if (compaction !== undefined) defaults.compaction = compaction

      return config
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
