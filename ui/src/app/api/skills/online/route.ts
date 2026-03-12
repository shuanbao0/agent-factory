import { NextRequest, NextResponse } from 'next/server'
import { search, exploreJson, inspect } from '@/lib/clawhub'
import { cached } from '@/lib/api-cache'

export const dynamic = 'force-dynamic'

/**
 * GET /api/skills/online
 *
 * Query params:
 * - action=search&q=query — search skills
 * - action=explore — browse latest skills (uses --json for richer data)
 * - action=inspect&slug=name — get skill details
 */
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || 'explore'

  try {
    if (action === 'search') {
      const q = req.nextUrl.searchParams.get('q')
      if (!q) return NextResponse.json({ error: 'q param required' }, { status: 400 })
      const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')
      const results = await search(q, limit)
      return NextResponse.json({ results, source: 'clawhub' })
    }

    if (action === 'inspect') {
      const slug = req.nextUrl.searchParams.get('slug')
      if (!slug) return NextResponse.json({ error: 'slug param required' }, { status: 400 })
      const detail = await inspect(slug)
      if (!detail) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
      return NextResponse.json({ skill: detail, source: 'clawhub' })
    }

    // Default: explore (try JSON first for richer data)
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100')
    const result = await cached('skills:explore', 300000, async () => {
      const results = await exploreJson(limit)
      return { results, source: 'clawhub' as const }
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e), source: 'error' }, { status: 500 })
  }
}
