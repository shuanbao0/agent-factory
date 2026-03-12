import { NextRequest, NextResponse } from 'next/server'
import { gwCallAsync } from '@/lib/gateway-client'
import { readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const OPENCLAW_CONFIG = join(PROJECT_ROOT, 'config/openclaw.json')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

// Max subagent sessions to fetch chat.history for (parallel)
const MAX_HISTORY_FETCH = 15
// Max direct sessions to fetch chat.history for (to detect peer-send messages)
const MAX_DIRECT_HISTORY_FETCH = 20

/** Regex to detect inter-agent messages sent via peer-send */
const PEER_MSG_RE = /^\[Inter-Agent Message from:\s*(\S+)\s*(?:\([^)]*\))?\]/

/**
 * In-memory cache for direct session chat.history results.
 * Prevents flickering when concurrent gwCallAsync calls timeout under load.
 * Cache entries expire after 60 seconds.
 */
const directHistoryCache = new Map<string, { data: HistoryMessage[]; ts: number }>()
const CACHE_TTL_MS = 60_000

interface GatewaySession {
  key: string
  kind: string
  displayName?: string
  channel?: string
  label?: string
  updatedAt?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  model?: string
  modelProvider?: string
}

interface HistoryMessage {
  role: string
  content: Array<{ type: string; text?: string; thinking?: string }>
  timestamp?: number
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

/** Extract text from message content blocks, stripping protocol tags */
function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!.replace(/^<final>\s*/g, '').replace(/<\/final>\s*$/g, ''))
    .join('\n')
    .trim()
}

/** Clean up subagent task text — strip [Subagent Context] prefix */
function cleanTask(text: string): string {
  return text.replace(new RegExp('^\\[Subagent Context\\][^\\n]*\\n\\n\\[Subagent Task\\]:\\s*', 's'), '').trim()
}

/** Load allowAgents mapping from openclaw.json */
function loadAllowAgents(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  try {
    if (!existsSync(OPENCLAW_CONFIG)) return map
    const config = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf-8'))
    const list = config.agents?.list || []
    for (const agent of list) {
      const allowed = agent.subagents?.allowAgents
      if (Array.isArray(allowed)) {
        map[agent.id] = allowed
      }
    }
  } catch {}
  return map
}

/** Build reverse map: targetAgent → [agents that can spawn it] */
function buildReverseSpawners(allowMap: Record<string, string[]>): Record<string, string[]> {
  const reverse: Record<string, string[]> = {}
  for (const [parent, targets] of Object.entries(allowMap)) {
    for (const target of targets) {
      if (!reverse[target]) reverse[target] = []
      reverse[target].push(parent)
    }
  }
  return reverse
}

/** Load assignedAgents for a project from .project-meta.json */
function loadProjectAgents(projectId: string): string[] {
  try {
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    if (!existsSync(metaPath)) return []
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    return Array.isArray(meta.assignedAgents) ? meta.assignedAgents : []
  } catch {
    return []
  }
}

/**
 * GET /api/messages
 *
 * Aggregates agent-to-agent communication with real message content:
 * 1. sessions.list → parse session keys for agent IDs and subagent spawns
 * 2. chat.history (parallel) → fetch actual task + response content
 * 3. allowAgents config → infer parent→child relationships
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

    const sessionsResult = await gwCallAsync('sessions.list', { limit: 100 }, 15000) as {
      sessions?: GatewaySession[]
    }

    const sessions = sessionsResult.sessions || []
    const messages: AgentMessage[] = []
    let msgIdx = 0

    const allowMap = loadAllowAgents()
    const reverseSpawners = buildReverseSpawners(allowMap)

    // Separate direct and subagent sessions
    const directSessions: Array<GatewaySession & { agentId: string }> = []
    const subagentSessions: Array<GatewaySession & { agentId: string }> = []

    for (const session of sessions) {
      const { agentId, isSubagent } = parseSessionKey(session.key)
      if (!agentId) continue
      if (isSubagent) {
        subagentSessions.push({ ...session, agentId })
      } else {
        directSessions.push({ ...session, agentId })
      }
    }

    // ── Fetch chat.history for subagent sessions in parallel ────
    const recentSubs = subagentSessions
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, MAX_HISTORY_FETCH)

    const historyResults = await Promise.allSettled(
      recentSubs.map(s =>
        gwCallAsync('chat.history', { sessionKey: s.key, limit: 5 })
          .then(r => ({ key: s.key, data: r as { messages?: HistoryMessage[] } }))
      )
    )

    // Build a map: sessionKey → { task, response }
    const historyMap = new Map<string, { task: string; response: string }>()
    for (const result of historyResults) {
      if (result.status !== 'fulfilled') continue
      const { key, data } = result.value
      const msgs = data.messages || []
      // First user message = task, first assistant text = response
      const userMsg = msgs.find(m => m.role === 'user')
      const assistantMsg = msgs.find(m => m.role === 'assistant' && m.content?.some(b => b.type === 'text'))
      historyMap.set(key, {
        task: userMsg ? cleanTask(extractText(userMsg.content)) : '',
        response: assistantMsg ? extractText(assistantMsg.content) : '',
      })
    }

    // ── Build messages for subagent sessions ────────────────────
    // With allowAgents=[self], spawn is always self-spawn.
    // parentId = agentId (the agent spawned itself for parallel task splitting).
    for (const sub of subagentSessions) {
      const parentId = sub.agentId

      // Apply agent filter: both from and to must be in the set
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
            : (sub.label || `Spawned ${sub.agentId} subagent`),
          sessionKey: sub.key,
        })
      }

      // Response event: child → parent (with actual response)
      if (sub.outputTokens && sub.outputTokens > 0) {
        if (!agentFilter || (agentFilter.has(sub.agentId) || agentFilter.has(parentId))) {
          messages.push({
            id: `msg-${msgIdx++}`,
            timestamp: ts,
            fromAgent: sub.agentId,
            toAgent: parentId,
            type: 'send',
            content: history?.response
              ? history.response.slice(0, contentLimit)
              : `Response completed (${sub.outputTokens} tokens)`,
            sessionKey: sub.key,
          })
        }
      }
    }

    // ── Fetch chat.history for direct sessions to detect peer-send messages ──
    const activeDirect = directSessions
      .filter(s => s.outputTokens && s.outputTokens > 0)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, MAX_DIRECT_HISTORY_FETCH)

    // Fetch in batches of 5 to avoid overloading the Gateway with concurrent calls
    const BATCH_SIZE = 5
    const directHistMap = new Map<string, { agentId: string; msgs: HistoryMessage[] }>()
    const now = Date.now()

    for (let batchStart = 0; batchStart < activeDirect.length; batchStart += BATCH_SIZE) {
      const batch = activeDirect.slice(batchStart, batchStart + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(s => {
          // Use cache if fresh enough
          const cached = directHistoryCache.get(s.key)
          if (cached && now - cached.ts < CACHE_TTL_MS) {
            return Promise.resolve({ key: s.key, agentId: s.agentId, msgs: cached.data })
          }
          return gwCallAsync('chat.history', { sessionKey: s.key, limit: 50 })
            .then(r => {
              const msgs = (r as { messages?: HistoryMessage[] }).messages || []
              directHistoryCache.set(s.key, { data: msgs, ts: Date.now() })
              return { key: s.key, agentId: s.agentId, msgs }
            })
        })
      )
      for (const r of results) {
        if (r.status === 'fulfilled') {
          directHistMap.set(r.value.key, { agentId: r.value.agentId, msgs: r.value.msgs })
        } else {
          // On failure, use stale cache if available
          const failedSession = batch.find(s => !directHistMap.has(s.key))
          if (failedSession) {
            const cached = directHistoryCache.get(failedSession.key)
            if (cached) {
              directHistMap.set(failedSession.key, { agentId: failedSession.agentId, msgs: cached.data })
            }
          }
        }
      }
    }

    // Extract peer-send messages from direct session histories
    const directSessionsWithPeerMsgs = new Set<string>()
    for (const [key, { agentId, msgs: histMsgs }] of Array.from(directHistMap)) {
      for (let i = 0; i < histMsgs.length; i++) {
        const m = histMsgs[i]
        if (m.role !== 'user') continue

        const text = extractText(m.content)
        const match = text.match(PEER_MSG_RE)
        if (!match) continue

        // This is an inter-agent message received by this agent
        const senderId = match[1]
        const msgContent = text.replace(PEER_MSG_RE, '').trim()
        const ts = m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString()

        // Apply agent filter
        if (agentFilter && !agentFilter.has(senderId) && !agentFilter.has(agentId)) continue

        directSessionsWithPeerMsgs.add(key)

        // Incoming message: sender → this agent
        messages.push({
          id: `msg-${msgIdx++}`,
          timestamp: ts,
          fromAgent: senderId,
          toAgent: agentId,
          type: 'send',
          content: msgContent.slice(0, contentLimit),
          sessionKey: key,
        })

        // Look for the assistant response right after this user message
        const nextMsg = histMsgs[i + 1]
        if (nextMsg && nextMsg.role === 'assistant') {
          const responseText = extractText(nextMsg.content)
          if (responseText) {
            const responseTs = nextMsg.timestamp
              ? new Date(nextMsg.timestamp).toISOString()
              : ts
            messages.push({
              id: `msg-${msgIdx++}`,
              timestamp: responseTs,
              fromAgent: agentId,
              toAgent: senderId,
              type: 'send',
              content: responseText.slice(0, contentLimit),
              sessionKey: key,
            })
          }
        }
      }
    }

    // ── Direct sessions with activity → log events ──────────────
    for (const session of directSessions) {
      if (!session.outputTokens || session.outputTokens === 0) continue

      // Skip sessions that already have peer messages extracted (avoid duplicate noise)
      if (directSessionsWithPeerMsgs.has(session.key)) continue

      // Apply agent filter
      if (agentFilter && !agentFilter.has(session.agentId)) continue

      const ts = session.updatedAt ? new Date(session.updatedAt).toISOString() : new Date().toISOString()
      const { name } = parseSessionKey(session.key)
      messages.push({
        id: `msg-${msgIdx++}`,
        timestamp: ts,
        fromAgent: 'user',
        toAgent: session.agentId,
        type: 'log',
        content: `Session "${name}" — ${session.outputTokens} output tokens, model: ${session.model || 'default'}`,
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
      source: 'gateway',
    })
  } catch (e) {
    return NextResponse.json(
      { error: String(e), messages: [], source: 'error' },
      { status: 502 }
    )
  }
}
