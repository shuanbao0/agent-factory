import { NextResponse } from 'next/server'
import { gwCallAsync } from '@/lib/gateway-client'

export const dynamic = 'force-dynamic'

interface SessionItem {
  key: string
  updatedAt?: number
}

export async function POST(req: Request) {
  try {
    const { maxAgeDays = 7 } = await req.json().catch(() => ({}))
    const cutoff = Date.now() - maxAgeDays * 86400_000

    const list = await gwCallAsync('sessions.list') as { sessions?: SessionItem[] }
    const sessions = list.sessions || []

    let cleaned = 0
    const errors: string[] = []

    const toKill = sessions.filter(s => s.updatedAt && s.updatedAt <= cutoff && !s.key.endsWith(':main'))

    // Kill in batches of 5 to avoid overwhelming gateway
    const BATCH = 5
    for (let i = 0; i < toKill.length; i += BATCH) {
      const batch = toKill.slice(i, i + BATCH)
      const results = await Promise.allSettled(
        batch.map(s => gwCallAsync('sessions.kill', { sessionKey: s.key }))
      )
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'fulfilled') cleaned++
        else errors.push(`${batch[j].key}: ${(results[j] as PromiseRejectedResult).reason}`)
      }
    }

    return NextResponse.json({ cleaned, total: sessions.length, errors: errors.length ? errors : undefined })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
