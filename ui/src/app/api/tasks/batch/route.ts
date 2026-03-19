import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

// ── DELETE /api/tasks/batch ─────────────────────────────────────
// Body: { statuses: string[], olderThanDays?: number }

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { statuses, olderThanDays } = body as { statuses: string[]; olderThanDays?: number }

    if (!Array.isArray(statuses) || statuses.length === 0) {
      return NextResponse.json({ error: 'statuses array required' }, { status: 400 })
    }

    const result = core.task.deleteBatch(statuses, olderThanDays)
    return NextResponse.json({ ok: true, deleted: result.deleted })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── POST /api/tasks/batch ─────────────────────────────────────
// Body: { action: 'cleanup' }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body as { action: string }

    if (action !== 'cleanup') {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    const result = core.task.cleanupReworks()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
