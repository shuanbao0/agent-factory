import { NextRequest, NextResponse } from 'next/server'
import { gwCallAsync } from '@/lib/gateway-client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/[id]/sessions
 *
 * Without ?sessionKey= → list sessions for this agent
 * With ?sessionKey=key → return session message history
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const sessionKey = req.nextUrl.searchParams.get('sessionKey')

  try {
    if (sessionKey) {
      // ── Fetch session history ────────────────────────────────
      const result = await gwCallAsync('sessions.history', {
        sessionKey,
        limit: 50,
      }) as { messages?: Array<{ role: string; content: string; timestamp?: string }> }

      return NextResponse.json({
        messages: (result.messages || []).map(m => ({
          role: m.role,
          content: typeof m.content === 'string'
            ? m.content.slice(0, 5000)
            : JSON.stringify(m.content).slice(0, 5000),
          timestamp: m.timestamp,
        })),
        source: 'gateway',
      })
    }

    // ── List sessions for agent ──────────────────────────────
    const result = await gwCallAsync('sessions.list', { agentId }) as {
      sessions?: Array<{
        key: string
        agentId: string
        kind: string
        lastMessage?: string
        lastAt?: string
        messageCount?: number
      }>
    }

    return NextResponse.json({
      sessions: (result.sessions || []).map(s => ({
        key: s.key,
        agentId: s.agentId,
        kind: s.kind || 'unknown',
        lastMessage: s.lastMessage?.slice(0, 200),
        lastAt: s.lastAt,
        messageCount: s.messageCount,
      })),
      source: 'gateway',
    })
  } catch (e) {
    return NextResponse.json(
      { error: String(e), sessions: [], messages: [], source: 'error' },
      { status: 502 }
    )
  }
}
