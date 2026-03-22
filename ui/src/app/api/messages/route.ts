import { NextRequest, NextResponse } from 'next/server'
import { gwCallAsync } from '@/lib/gateway-client'
import { logError } from '@/lib/error-logger'
import core from '@/lib/core-bridge'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

const STATE_DIR = join(core.common.paths.DATA_DIR, 'openclaw-state')

// Max subagent sessions to fetch history for
const MAX_HISTORY_FETCH = 15
// Max direct sessions to fetch history for (to detect peer-send messages)
const MAX_DIRECT_HISTORY_FETCH = 20

/** Regex to detect inter-agent messages sent via peer-send */
const PEER_MSG_RE = /^\[Inter-Agent Message from:\s*(\S+)\s*(?:\([^)]*\))?\]/

interface SessionEntry {
  sessionId: string
  updatedAt: number
  sessionFile?: string
  compactionCount?: number
  chatType?: string
  lastChannel?: string
}

interface HistoryMessage {
  role: string
  content: Array<{ type: string; text?: string; thinking?: string }> | string
  timestamp?: string
}

interface AgentMessage {
  id: string
  timestamp: string
  fromAgent: string
  toAgent: string
  type: 'spawn' | 'send' | 'complete' | 'error' | 'log'
  content: string
  sessionKey: string
}

interface ParsedSession {
  key: string
  agentId: string
  isSubagent: boolean
  name: string
  updatedAt: number
  chatType?: string
  sessionFile?: string
}

/** Parse session key → agentId + whether it's a subagent session */
function parseSessionKey(key: string): { agentId: string; isSubagent: boolean; name: string } {
  const parts = key.split(':')
  if (parts[0] === 'agent' && parts.length >= 3) {
    return {
      agentId: parts[1],
      isSubagent: parts[2] === 'subagent',
      name: parts.slice(2).join(':'),
    }
  }
  return { agentId: '', isSubagent: false, name: key }
}

/** Strip OpenClaw sender metadata + timestamp prefix from user messages */
const SENDER_PREFIX_RE = /^(?:System:.*?\n)?Sender \(untrusted metadata\):\n```json\n\{[^}]*\}\n```\n\n(?:\[[^\]]*\]\s*)?/s

/** Extract text from message content blocks, stripping protocol tags */
function extractText(content: Array<{ type: string; text?: string }> | string, stripSender = false): string {
  let text: string
  if (typeof content === 'string') {
    text = content
  } else {
    text = content
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text!.replace(/^<final>\s*/g, '').replace(/<\/final>\s*$/g, ''))
      .join('\n')
      .trim()
  }
  if (stripSender) text = text.replace(SENDER_PREFIX_RE, '').trim()
  return text
}

/** Clean up subagent task text — strip [Subagent Context] prefix */
function cleanTask(text: string): string {
  return text.replace(new RegExp('^\\[Subagent Context\\][^\\n]*\\n\\n\\[Subagent Task\\]:\\s*', 's'), '').trim()
}

/** Load allowAgents mapping from openclaw.json */
function loadAllowAgents(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  try {
    const config = core.repo.configRepo.getConfig()
    const agents = (config.agents || {}) as Record<string, unknown>
    const list = (agents.list || []) as Array<Record<string, unknown>>
    for (const agent of list) {
      const subagents = agent.subagents as Record<string, unknown> | undefined
      const allowed = subagents?.allowAgents
      if (Array.isArray(allowed)) {
        map[agent.id as string] = allowed
      }
    }
  } catch (err) { logError('messages-api/load-allow-agents', err) }
  return map
}

/** Load assignedAgents for a project from .project-meta.json */
function loadProjectAgents(projectId: string): string[] {
  try {
    const meta = core.repo.projectMetaRepo.readMeta(projectId) as Record<string, unknown> | null
    if (!meta) return []
    return Array.isArray(meta.assignedAgents) ? meta.assignedAgents as string[] : []
  } catch {
    return []
  }
}

/** Read all sessions across all agents from JSONL files */
function readAllSessions(): ParsedSession[] {
  const sessions: ParsedSession[] = []
  const agentsDir = join(STATE_DIR, 'agents')
  if (!existsSync(agentsDir)) return sessions

  let agentDirs: string[]
  try {
    agentDirs = readdirSync(agentsDir)
  } catch { return sessions }

  for (const agentDir of agentDirs) {
    const sessionsJsonPath = join(agentsDir, agentDir, 'sessions', 'sessions.json')
    if (!existsSync(sessionsJsonPath)) continue

    try {
      const index = JSON.parse(readFileSync(sessionsJsonPath, 'utf-8')) as Record<string, SessionEntry>
      for (const [key, entry] of Object.entries(index)) {
        const parsed = parseSessionKey(key)
        sessions.push({
          key,
          agentId: parsed.agentId || agentDir,
          isSubagent: parsed.isSubagent,
          name: parsed.name,
          updatedAt: entry.updatedAt || 0,
          chatType: entry.chatType,
          sessionFile: entry.sessionFile,
        })
      }
    } catch { /* skip corrupt files */ }
  }

  return sessions
}

/** Read messages from a session JSONL file */
function readSessionHistory(sessionFile: string, limit: number): HistoryMessage[] {
  if (!existsSync(sessionFile)) return []

  try {
    const lines = readFileSync(sessionFile, 'utf-8').split('\n').filter(Boolean)
    const messages: HistoryMessage[] = []

    for (const line of lines) {
      try {
        const obj = JSON.parse(line)
        if (obj.type !== 'message' || !obj.message) continue
        const { role, content } = obj.message
        if (role !== 'user' && role !== 'assistant' && role !== 'toolResult') continue

        messages.push({
          role,
          content,
          timestamp: obj.timestamp,
        })
      } catch { /* skip malformed lines */ }
    }

    // Return last N messages
    return messages.slice(-limit)
  } catch { return [] }
}

/**
 * GET /api/messages
 *
 * Aggregates agent-to-agent communication with real message content by
 * reading session JSONL files directly from openclaw-state/.
 *
 * Query params:
 *   agents=a,b     → filter messages where both fromAgent and toAgent are in the set
 *   projectId=xxx  → resolve project's assignedAgents, then filter like agents=
 *   full=1         → increase content truncation from 500 to 2000 chars
 */
export async function GET(request: NextRequest) {
  try {
    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const full = searchParams.get('full') === '1'
    const contentLimit = full ? 2000 : 500

    let agentFilter: Set<string> | null = null
    const agentsParam = searchParams.get('agents')
    const projectIdParam = searchParams.get('projectId')

    if (projectIdParam) {
      const projectAgents = loadProjectAgents(projectIdParam)
      if (projectAgents.length > 0) {
        agentFilter = new Set(projectAgents)
      }
    } else if (agentsParam) {
      agentFilter = new Set(agentsParam.split(',').map(s => s.trim()).filter(Boolean))
    }

    // Read all sessions from filesystem
    const allSessions = readAllSessions()
    const messages: AgentMessage[] = []
    let msgIdx = 0

    const allowMap = loadAllowAgents()

    // Separate direct and subagent sessions
    const directSessions = allSessions.filter(s => !s.isSubagent)
    const subagentSessions = allSessions.filter(s => s.isSubagent)

    // ── Fetch history for subagent sessions ─────────────────────
    const recentSubs = subagentSessions
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_HISTORY_FETCH)

    const historyMap = new Map<string, { task: string; response: string }>()
    for (const sub of recentSubs) {
      if (!sub.sessionFile) continue
      const msgs = readSessionHistory(sub.sessionFile, 10)
      const userMsg = msgs.find(m => m.role === 'user')
      const assistantMsg = msgs.find(m => m.role === 'assistant')
      historyMap.set(sub.key, {
        task: userMsg ? cleanTask(extractText(userMsg.content as Array<{ type: string; text?: string }>, true)) : '',
        response: assistantMsg ? extractText(assistantMsg.content as Array<{ type: string; text?: string }>) : '',
      })
    }

    // ── Build messages for subagent sessions ────────────────────
    for (const sub of subagentSessions) {
      const parentId = sub.agentId

      // Apply agent filter
      if (agentFilter && !agentFilter.has(parentId) && !agentFilter.has(sub.agentId)) continue

      const ts = sub.updatedAt ? new Date(sub.updatedAt).toISOString() : new Date().toISOString()
      const history = historyMap.get(sub.key)

      // Spawn event: parent → child (with actual task)
      if (!agentFilter || (agentFilter.has(parentId) || agentFilter.has(sub.agentId))) {
        messages.push({
          id: `msg-${msgIdx++}`,
          timestamp: ts,
          fromAgent: parentId,
          toAgent: sub.agentId,
          type: 'spawn',
          content: history?.task
            ? history.task.slice(0, contentLimit)
            : `Spawned ${sub.agentId} subagent`,
          sessionKey: sub.key,
        })
      }

      // Response event if there's a response
      if (history?.response) {
        if (!agentFilter || (agentFilter.has(sub.agentId) || agentFilter.has(parentId))) {
          messages.push({
            id: `msg-${msgIdx++}`,
            timestamp: ts,
            fromAgent: sub.agentId,
            toAgent: parentId,
            type: 'send',
            content: history.response.slice(0, contentLimit),
            sessionKey: sub.key,
          })
        }
      }
    }

    // ── Fetch history for direct sessions to detect peer-send messages ──
    const activeDirect = directSessions
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_DIRECT_HISTORY_FETCH)

    const directSessionsWithPeerMsgs = new Set<string>()
    for (const session of activeDirect) {
      if (!session.sessionFile) continue

      const histMsgs = readSessionHistory(session.sessionFile, 50)

      for (let i = 0; i < histMsgs.length; i++) {
        const m = histMsgs[i]
        if (m.role !== 'user') continue

        const text = extractText(m.content as Array<{ type: string; text?: string }>, true)
        const match = text.match(PEER_MSG_RE)
        if (!match) continue

        const senderId = match[1]
        const msgContent = text.replace(PEER_MSG_RE, '').trim()
        const ts = m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString()

        if (agentFilter && !agentFilter.has(senderId) && !agentFilter.has(session.agentId)) continue

        directSessionsWithPeerMsgs.add(session.key)

        // Incoming message: sender → this agent
        messages.push({
          id: `msg-${msgIdx++}`,
          timestamp: ts,
          fromAgent: senderId,
          toAgent: session.agentId,
          type: 'send',
          content: msgContent.slice(0, contentLimit),
          sessionKey: session.key,
        })

        // Look for the assistant response right after
        const nextMsg = histMsgs[i + 1]
        if (nextMsg && nextMsg.role === 'assistant') {
          const responseText = extractText(nextMsg.content as Array<{ type: string; text?: string }>)
          if (responseText) {
            const responseTs = nextMsg.timestamp
              ? new Date(nextMsg.timestamp).toISOString()
              : ts
            messages.push({
              id: `msg-${msgIdx++}`,
              timestamp: responseTs,
              fromAgent: session.agentId,
              toAgent: senderId,
              type: 'send',
              content: responseText.slice(0, contentLimit),
              sessionKey: session.key,
            })
          }
        }
      }
    }

    // ── Direct sessions without peer msgs → log events ──────────
    for (const session of directSessions) {
      if (session.updatedAt === 0) continue
      if (directSessionsWithPeerMsgs.has(session.key)) continue
      if (agentFilter && !agentFilter.has(session.agentId)) continue

      const ts = new Date(session.updatedAt).toISOString()
      messages.push({
        id: `msg-${msgIdx++}`,
        timestamp: ts,
        fromAgent: 'user',
        toAgent: session.agentId,
        type: 'log',
        content: `Session "${session.name}" active`,
        sessionKey: session.key,
      })
    }

    // ── Parse gateway logs for error events ─────────────────────
    if (!agentFilter) {
      try {
        const logsResult = await gwCallAsync('logs.tail', undefined, 15000) as { lines?: string[] }
        const lines = logsResult.lines || []
        const seen = new Set<string>()

        for (const line of lines.slice(-50)) {
          try {
            const entry = JSON.parse(line)
            const msg = String(entry['1'] || '')
            const time = entry.time || entry._meta?.date
            if (!msg || !time) continue

            if (entry._meta?.logLevelName === 'ERROR') {
              const dedup = `${time}:error:${msg.slice(0, 80)}`
              if (!seen.has(dedup)) {
                seen.add(dedup)
                messages.push({
                  id: `msg-${msgIdx++}`,
                  timestamp: time,
                  fromAgent: 'gateway',
                  toAgent: 'system',
                  type: 'error',
                  content: msg.slice(0, 300),
                  sessionKey: '',
                })
              }
            }
          } catch { /* skip unparseable lines */ }
        }
      } catch { /* logs not available */ }
    }

    // Sort by timestamp descending
    messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({
      messages: messages.slice(0, 200),
      source: 'file',
    })
  } catch (e) {
    return NextResponse.json(
      { error: String(e), messages: [], source: 'error' },
      { status: 502 }
    )
  }
}
