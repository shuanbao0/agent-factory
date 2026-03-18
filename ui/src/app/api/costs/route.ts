import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'
export const dynamic = 'force-dynamic'

// ── GET /api/costs ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const period = url.searchParams.get('period') // 'today', '7d', '30d', or specific date
    const source = url.searchParams.get('source')

    // Convert period param to from/to/date for core.observe.queryCosts
    const now = new Date()
    let date: string | undefined
    let from: string | undefined

    if (period === 'today') {
      date = now.toISOString().slice(0, 10)
    } else if (period === '7d') {
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - 7)
      from = cutoff.toISOString().slice(0, 10)
    } else if (period === '30d') {
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - 30)
      from = cutoff.toISOString().slice(0, 10)
    } else if (period && /^\d{4}-\d{2}-\d{2}$/.test(period)) {
      date = period
    }

    const result = core.observe.queryCosts({
      date,
      from,
      source: source || undefined,
    })

    const entries = result.entries || []

    // Daily summary aggregation (display formatting, not business logic)
    const byDate: Record<string, { date: string; cost: number; inputTokens: number; outputTokens: number; calls: number }> = {}
    for (const e of entries) {
      const d = (e as Record<string, unknown>).date as string
      if (!byDate[d]) {
        byDate[d] = { date: d, cost: 0, inputTokens: 0, outputTokens: 0, calls: 0 }
      }
      byDate[d].cost += (e as Record<string, unknown>).cost as number || 0
      byDate[d].inputTokens += (e as Record<string, unknown>).inputTokens as number || 0
      byDate[d].outputTokens += (e as Record<string, unknown>).outputTokens as number || 0
      byDate[d].calls++
    }

    const summary = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      entries: entries.slice(-500),
      summary,
      totalCost: Math.round(result.totalCost * 1_000_000) / 1_000_000,
      totalInputTokens: result.totalInputTokens,
      totalOutputTokens: result.totalOutputTokens,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
