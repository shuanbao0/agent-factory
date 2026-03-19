import { NextRequest, NextResponse } from 'next/server'
import { fetchAgentsData } from '@/lib/data-fetchers'
import { createAgent, updateAgent, deleteAgent } from '@/services/agent-crud'

export const dynamic = 'force-dynamic'

// ── GET: List all agents ────────────────────────────────────────

export async function GET() {
  try {
    const data = await fetchAgentsData()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), source: 'error' },
      { status: 502 }
    )
  }
}

// ── POST: Create a new agent (atomic: create + deploy) ──────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await createAgent(body)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── PUT: Update an existing agent ───────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await updateAgent(body)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── DELETE: Remove an agent (atomic: delete + undeploy) ─────────
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    const result = await deleteAgent(id)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
