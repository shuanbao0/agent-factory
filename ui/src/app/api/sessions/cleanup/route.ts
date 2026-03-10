import { NextResponse } from 'next/server'
import { gwCall } from '@/lib/gateway-client'

export const dynamic = 'force-dynamic'

interface SessionItem {
  key: string
  updatedAt?: number
}

export async function POST(req: Request) {
  try {
    const { maxAgeDays = 7 } = await req.json().catch(() => ({}))
    const cutoff = Date.now() - maxAgeDays * 86400_000

    const list = gwCall('sessions.list') as { sessions?: SessionItem[] }
    const sessions = list.sessions || []

    let cleaned = 0
    const errors: string[] = []

    for (const session of sessions) {
      // Skip sessions without updatedAt (can't determine age)
      if (!session.updatedAt) continue
      // Skip if still active within the retention window
      if (session.updatedAt > cutoff) continue
      // Skip :main sessions (primary agent sessions)
      if (session.key.endsWith(':main')) continue

      try {
        gwCall('sessions.kill', { sessionKey: session.key })
        cleaned++
      } catch (e) {
        errors.push(`${session.key}: ${String(e)}`)
      }
    }

    return NextResponse.json({ cleaned, total: sessions.length, errors: errors.length ? errors : undefined })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
