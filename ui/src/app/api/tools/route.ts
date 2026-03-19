import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const config = core.repo.configRepo.getConfig()
    return NextResponse.json({ tools: config.tools || {} })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { tools } = body as { tools: Record<string, unknown> }
    if (!tools || typeof tools !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid "tools" field' }, { status: 400 })
    }

    core.repo.configRepo.updateConfig((config: Record<string, unknown>) => {
      if (!config.tools || typeof config.tools !== 'object') {
        config.tools = {}
      }
      const existing = config.tools as Record<string, unknown>
      for (const [key, value] of Object.entries(tools)) {
        existing[key] = value
      }
      config.tools = existing
      return config
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
