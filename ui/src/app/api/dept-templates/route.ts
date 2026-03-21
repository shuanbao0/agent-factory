import { NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

// ── GET: List all department templates ────────────────────────────
export async function GET() {
  try {
    const templates = core.repo.listDeptTemplates()
    return NextResponse.json({ templates })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
