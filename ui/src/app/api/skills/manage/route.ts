import { NextRequest, NextResponse } from 'next/server'
import { install, update, uninstall, listInstalled } from '@/lib/clawhub'
import { cached, invalidate } from '@/lib/api-cache'

export const dynamic = 'force-dynamic'

/**
 * GET /api/skills/manage — list installed skills (from clawhub lockfile)
 */
export async function GET() {
  try {
    const result = await cached('skills:installed', 60000, async () => {
      const installed = await listInstalled()
      return { installed, source: 'clawhub' as const }
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e), installed: [] }, { status: 500 })
  }
}

/**
 * POST /api/skills/manage — install, update, or uninstall a skill
 *
 * Body: { action: 'install' | 'update' | 'uninstall', slug: string, version?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { action, slug, version } = await req.json() as {
      action: 'install' | 'update' | 'update-all' | 'uninstall'
      slug?: string
      version?: string
    }

    if (!action) {
      return NextResponse.json({ error: 'action required' }, { status: 400 })
    }

    let result: { ok: boolean; output?: string }

    switch (action) {
      case 'install': {
        if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
        result = await install(slug, version)
        break
      }
      case 'update': {
        result = await update(slug)
        break
      }
      case 'update-all': {
        result = await update()
        break
      }
      case 'uninstall': {
        if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
        result = uninstall(slug)
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    // Invalidate all skills caches after mutation
    invalidate('skills:')

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
