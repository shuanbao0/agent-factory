import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

const STATE_DIR = join(core.common.paths.DATA_DIR, 'openclaw-state')

/** Strip OpenClaw sender metadata + timestamp prefix from user messages */
const SENDER_PREFIX_RE = /^(?:System:.*?\n)?Sender \(untrusted metadata\):\n```json\n\{[^}]*\}\n```\n\n(?:\[[^\]]*\]\s*)?/s

function cleanUserMessage(text: string): string {
  return text.replace(SENDER_PREFIX_RE, '').trim()
}

/**
 * GET /api/agents/[id]/sessions
 *
 * Without ?sessionKey= → list sessions for this agent
 * With ?sessionKey=key → return session message history (from JSONL file)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const sessionKey = req.nextUrl.searchParams.get('sessionKey')

  try {
    const sessionsJsonPath = join(STATE_DIR, 'agents', agentId, 'sessions', 'sessions.json')

    if (!existsSync(sessionsJsonPath)) {
      return NextResponse.json({
        sessions: [],
        messages: [],
        source: 'file',
      })
    }

    const sessionsIndex = JSON.parse(readFileSync(sessionsJsonPath, 'utf-8')) as Record<string, {
      sessionId: string
      updatedAt: number
      sessionFile?: string
      compactionCount?: number
      chatType?: string
    }>

    if (sessionKey) {
      // ── Fetch session history from JSONL ─────────────────────
      const entry = sessionsIndex[sessionKey]
      if (!entry?.sessionFile || !existsSync(entry.sessionFile)) {
        return NextResponse.json({ messages: [], source: 'file' })
      }

      const lines = readFileSync(entry.sessionFile, 'utf-8').split('\n').filter(Boolean)
      const messages: Array<{ role: string; content: string; timestamp?: string }> = []

      for (const line of lines) {
        try {
          const obj = JSON.parse(line)
          if (obj.type !== 'message' || !obj.message) continue
          const { role, content } = obj.message
          if (role !== 'user' && role !== 'assistant') continue

          // Extract text from content array
          let text = ''
          if (typeof content === 'string') {
            text = content
          } else if (Array.isArray(content)) {
            text = content
              .filter((c: { type: string }) => c.type === 'text')
              .map((c: { text?: string }) => c.text || '')
              .join('\n')
          }
          if (!text) continue

          // Strip protocol prefix from user messages
          if (role === 'user') {
            text = cleanUserMessage(text)
            if (!text) continue
          }

          messages.push({
            role,
            content: text.slice(0, 5000),
            timestamp: obj.timestamp,
          })
        } catch { /* skip malformed lines */ }
      }

      // Return last 50 messages
      return NextResponse.json({
        messages: messages.slice(-50),
        source: 'file',
      })
    }

    // ── List sessions for agent ──────────────────────────────
    const sessions = Object.entries(sessionsIndex).map(([key, entry]) => ({
      key,
      agentId,
      kind: entry.chatType || 'direct',
      lastAt: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : undefined,
      messageCount: undefined as number | undefined,
    }))

    // Sort by lastAt descending
    sessions.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''))

    return NextResponse.json({
      sessions,
      source: 'file',
    })
  } catch (e) {
    return NextResponse.json(
      { error: String(e), sessions: [], messages: [], source: 'error' },
      { status: 502 }
    )
  }
}
