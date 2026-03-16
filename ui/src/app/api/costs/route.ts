import { NextRequest, NextResponse } from 'next/server'
import { resolve, join } from 'path'
import { existsSync, readFileSync } from 'fs'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const COSTS_FILE = join(PROJECT_ROOT, 'config', 'autopilot-costs.jsonl')

interface CostEntry {
  ts: string
  date: string
  model: string
  inputTokens: number
  outputTokens: number
  cost: number
  source: string
  agentId?: string
}

// ── GET /api/costs ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const period = url.searchParams.get('period') // 'today', '7d', '30d', or specific date
    const source = url.searchParams.get('source')

    if (!existsSync(COSTS_FILE)) {
      return NextResponse.json({
        entries: [],
        summary: [],
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      })
    }

    const lines = readFileSync(COSTS_FILE, 'utf-8').split('\n').filter(Boolean)
    let entries: CostEntry[] = lines.map(line => {
      try { return JSON.parse(line) as CostEntry } catch { return null }
    }).filter((e): e is CostEntry => e !== null)

    // Apply period filter
    const now = new Date()
    if (period === 'today') {
      const today = now.toISOString().slice(0, 10)
      entries = entries.filter(e => e.date === today)
    } else if (period === '7d') {
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - 7)
      const from = cutoff.toISOString().slice(0, 10)
      entries = entries.filter(e => e.date >= from)
    } else if (period === '30d') {
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - 30)
      const from = cutoff.toISOString().slice(0, 10)
      entries = entries.filter(e => e.date >= from)
    } else if (period && /^\d{4}-\d{2}-\d{2}$/.test(period)) {
      entries = entries.filter(e => e.date === period)
    }

    // Apply source filter
    if (source) {
      entries = entries.filter(e => e.source === source)
    }

    // Aggregate totals
    const totalCost = entries.reduce((sum, e) => sum + (e.cost || 0), 0)
    const totalInputTokens = entries.reduce((sum, e) => sum + (e.inputTokens || 0), 0)
    const totalOutputTokens = entries.reduce((sum, e) => sum + (e.outputTokens || 0), 0)

    // Daily summary
    const byDate: Record<string, { date: string; cost: number; inputTokens: number; outputTokens: number; calls: number }> = {}
    for (const e of entries) {
      if (!byDate[e.date]) {
        byDate[e.date] = { date: e.date, cost: 0, inputTokens: 0, outputTokens: 0, calls: 0 }
      }
      byDate[e.date].cost += e.cost || 0
      byDate[e.date].inputTokens += e.inputTokens || 0
      byDate[e.date].outputTokens += e.outputTokens || 0
      byDate[e.date].calls++
    }

    const summary = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      entries: entries.slice(-500), // limit response size
      summary,
      totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
      totalInputTokens,
      totalOutputTokens,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
