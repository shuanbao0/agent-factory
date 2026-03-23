/**
 * Shared data fetching functions — used by both API routes and SSE endpoint.
 * All functions use gwCallAsync (non-blocking) and return the same structure
 * as the original API JSON responses.
 */
import { gwCallAsync } from '@/lib/gateway-client'
import core from '@/lib/core-bridge'
import type { Task } from '@entity/task'
import type { AgentMeta } from '@entity/agent'
import type { CostEntry, CompanyBudget } from '@entity/observe'
import type { AgentConfigEntry } from '@entity/agent'

const BUSY_THRESHOLD_MS = 300_000

// ── Health ───────────────────────────────────────────────────────

export interface HealthResult {
  health: Record<string, unknown>
  status: Record<string, unknown>
  source: 'gateway'
}

export async function fetchHealthData(): Promise<HealthResult> {
  const [health, status] = await Promise.all([
    gwCallAsync('health') as Promise<Record<string, unknown>>,
    gwCallAsync('status') as Promise<Record<string, unknown>>,
  ])
  return { health, status, source: 'gateway' }
}

// ── Agents ───────────────────────────────────────────────────────

export interface AgentItem {
  id: string
  templateId: string | null
  role: string
  name: string
  description: string
  status: 'busy' | 'online'
  isDefault: boolean
  department?: string
}

export interface AgentsResult {
  agents: AgentItem[]
  source: 'gateway'
}

export async function fetchAgentsData(): Promise<AgentsResult> {
  const result = await gwCallAsync('agents.list') as {
    agents: { id: string }[]
    defaultId: string
  }

  // Fetch sessions to determine busy agents
  const busyAgentIds = new Set<string>()
  try {
    const sessResult = await gwCallAsync('sessions.list', { limit: 50 }) as {
      sessions: { key: string; updatedAt?: number }[]
    }
    const now = Date.now()
    for (const s of sessResult.sessions || []) {
      if (!s.updatedAt) continue
      if (now - s.updatedAt < BUSY_THRESHOLD_MS) {
        const parts = s.key.split(':')
        if (parts[0] === 'agent' && parts[1]) {
          busyAgentIds.add(parts[1])
        }
      }
    }
  } catch (e) { core.common.logger.debug('data-fetchers', 'sessions.list fetch failed (agents)', { error: String(e) }) }

  // Check autopilot state
  try {
    const ap = core.common.loadState()
    if (ap.status === 'cycling') busyAgentIds.add('ceo')
  } catch (e) { core.common.logger.debug('data-fetchers', 'Autopilot state read failed', { error: String(e) }) }

  // Read agent instance metadata via repo
  const agentInstances = new Map<string, AgentMeta>()
  try {
    const agentIds = core.repo.agentMetaRepo.listAllAgentIds()
    for (const id of agentIds) {
      const meta = core.repo.agentMetaRepo.readMeta(id)
      if (meta) agentInstances.set(id, meta as AgentMeta)
    }
  } catch (e) { core.common.logger.debug('data-fetchers', 'Agent metadata read failed', { error: String(e) }) }

  const agents: AgentItem[] = result.agents.map(a => {
    const instance = agentInstances.get(a.id)
    return {
      id: a.id,
      templateId: instance?.templateId || null,
      role: instance?.role || a.id,
      name: instance?.name || a.id,
      description: instance?.description || `OpenClaw agent: ${a.id}`,
      status: (busyAgentIds.has(a.id) ? 'busy' : 'online') as 'busy' | 'online',
      isDefault: a.id === result.defaultId,
      department: instance?.department || undefined,
    }
  })

  return { agents, source: 'gateway' }
}

// ── Logs ─────────────────────────────────────────────────────────

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

export interface LogItem {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  agent: string
  message: string
  details?: string
}

export interface LogsResult {
  logs: LogItem[]
  source: 'gateway'
}

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

export async function fetchLogsData(): Promise<LogsResult> {
  const entries: LogItem[] = []
  let idx = 0

  // 1. Gateway system logs from logs.tail
  try {
    const raw = await gwCallAsync('logs.tail', undefined, 20000) as Record<string, unknown>
    const rawLines = (raw.lines || []) as string[]

    for (const line of rawLines.slice(-80)) {
      try {
        const entry = JSON.parse(line)
        const meta = entry._meta as Record<string, unknown> | undefined
        const levelStr = String(meta?.logLevelName || 'INFO').toLowerCase()

        let subsystem = 'gateway'
        const first = entry['0'] as string | undefined
        if (first) {
          try {
            const parsed = JSON.parse(first)
            subsystem = parsed.subsystem || 'gateway'
          } catch { /* not JSON */ }
        }

        const message = String(entry['1'] || first || '').slice(0, 300)
        if (!message || message.length < 3) continue

        const level = levelStr === 'debug' ? 'debug' as const
          : levelStr === 'warn' ? 'warn' as const
          : levelStr === 'error' ? 'error' as const
          : 'info' as const

        entries.push({
          id: `syslog-${idx++}`,
          timestamp: String(entry.time || meta?.date || new Date().toISOString()),
          level,
          agent: subsystem,
          message,
        })
      } catch { /* skip unparseable lines */ }
    }
  } catch (e) { core.common.logger.debug('data-fetchers', 'logs.tail fetch failed', { error: String(e) }) }

  // 2. Agent activity from sessions.list
  try {
    const sessionsResult = await gwCallAsync('sessions.list', { limit: 100 }, 20000) as {
      sessions?: GatewaySession[]
    }
    const sessions = sessionsResult.sessions || []

    for (const session of sessions) {
      const { agentId, isSubagent, name } = parseSessionKey(session.key)
      if (!agentId) continue

      const ts = session.updatedAt
        ? new Date(session.updatedAt).toISOString()
        : new Date().toISOString()

      if (isSubagent) {
        const tokens = session.totalTokens || 0
        const model = session.model || 'default'
        entries.push({
          id: `activity-${idx++}`,
          timestamp: ts,
          level: 'info',
          agent: agentId,
          message: `Subagent session active — ${tokens} tokens, model: ${model}`,
          details: session.label || undefined,
        })
      } else {
        if (!session.outputTokens && !session.inputTokens) continue
        const tokens = session.totalTokens || 0
        const model = session.model || 'default'
        entries.push({
          id: `activity-${idx++}`,
          timestamp: ts,
          level: 'info',
          agent: agentId,
          message: `Session "${name}" — ${tokens} tokens (in: ${session.inputTokens || 0}, out: ${session.outputTokens || 0}), model: ${model}`,
        })
      }
    }
  } catch { /* sessions.list not available */ }

  // Sort by timestamp descending
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return {
    logs: entries.slice(0, 200),
    source: 'gateway',
  }
}

// ── Usage ────────────────────────────────────────────────────────

export interface UsageResult {
  source: 'gateway'
  [key: string]: unknown
}

let _usageCache: { data: UsageResult; ts: number } | null = null
const USAGE_CACHE_TTL = 60_000

export async function fetchUsageData(params?: Record<string, unknown>): Promise<UsageResult> {
  // Return cached data if within TTL (skip cache if custom params are provided)
  const hasParams = params && Object.keys(params).length > 0
  if (!hasParams && _usageCache && Date.now() - _usageCache.ts < USAGE_CACHE_TTL) {
    return _usageCache.data
  }

  const result = await gwCallAsync(
    'sessions.usage',
    hasParams ? params : undefined,
    30000,
  ) as Record<string, unknown>
  const data = { ...result, source: 'gateway' as const }

  // Merge historical cost data from autopilot-costs.jsonl into daily aggregates
  // Gateway only returns data for active sessions; historical sessions that were
  // cleaned up would be missing. The JSONL file preserves all historical costs.
  if (!hasParams) {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const costResult = core.observe.queryCosts({ from: _last30dDate() })
      if (costResult.entries.length > 0) {
        // Aggregate JSONL entries by date
        const costByDate: Record<string, { tokens: number; cost: number }> = {}
        for (const e of costResult.entries) {
          if (!e.date) continue
          if (!costByDate[e.date]) costByDate[e.date] = { tokens: 0, cost: 0 }
          costByDate[e.date].tokens += (e.inputTokens || 0) + (e.outputTokens || 0)
          costByDate[e.date].cost += e.cost || 0
        }

        // Build gateway daily map (today's data from gateway is most accurate)
        const gwDaily = ((data as Record<string, unknown>).aggregates as Record<string, unknown>)?.daily as Array<{
          date: string; tokens: number; cost: number; messages: number; toolCalls: number; errors: number
        }> || []
        const gwDailyMap = new Map<string, typeof gwDaily[0]>()
        for (const d of gwDaily) gwDailyMap.set(d.date, d)

        // Merge: use gateway data for today, JSONL data for past days
        const mergedDaily: Array<{ date: string; tokens: number; cost: number; messages: number; toolCalls: number; errors: number }> = []
        const allDates = new Set(Object.keys(costByDate).concat(Array.from(gwDailyMap.keys())))
        const sortedDates = Array.from(allDates).sort()
        for (const date of sortedDates) {
          const gw = gwDailyMap.get(date)
          if (date === today && gw) {
            // Today: prefer gateway (real-time), but take the higher value
            mergedDaily.push({
              ...gw,
              tokens: Math.max(gw.tokens || 0, costByDate[date]?.tokens || 0),
              cost: Math.max(gw.cost || 0, costByDate[date]?.cost || 0),
            })
          } else if (gw && !costByDate[date]) {
            mergedDaily.push(gw)
          } else {
            // Past days or days only in JSONL: use JSONL data
            const c = costByDate[date]
            if (c) {
              mergedDaily.push({
                date,
                tokens: c.tokens,
                cost: Math.round(c.cost * 1_000_000) / 1_000_000,
                messages: gw?.messages || 0,
                toolCalls: gw?.toolCalls || 0,
                errors: gw?.errors || 0,
              })
            }
          }
        }

        // Patch aggregates.daily
        const agg = (data as Record<string, unknown>).aggregates as Record<string, unknown> | undefined
        if (agg) {
          agg.daily = mergedDaily
        } else {
          ;(data as Record<string, unknown>).aggregates = { daily: mergedDaily, byAgent: [] }
        }
      }
    } catch (e) {
      core.common.logger.debug('data-fetchers', 'Historical cost merge failed', { error: String(e) })
    }

    _usageCache = { data, ts: Date.now() }
  }

  return data
}

/** Returns YYYY-MM-DD for 30 days ago */
function _last30dDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

// ── Tasks ───────────────────────────────────────────────────────

export interface TasksResult {
  tasks: Task[]
  source: 'filesystem'
}

export async function fetchTasksData(): Promise<TasksResult> {
  const tasks = core.repo.taskRepo.findAllTasks()
  return { tasks, source: 'filesystem' }
}

// ── Messages (for pixel-office rich states) ─────────────────

export interface AgentMessage {
  timestamp: string
  fromAgent: string
  toAgent: string
  type: 'spawn' | 'send' | 'error' | 'log'
}

export interface MessagesResult {
  messages: AgentMessage[]
  activePairs: Array<{ from: string; to: string; type: 'spawn' | 'send' }>
  agentErrors: Record<string, number>
  lastActivity: Record<string, number>
  source: 'gateway'
}

function loadAllowAgentsMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  try {
    const config = core.repo.configRepo.getConfig()
    const list = config.agents?.list || []
    for (const agent of list) {
      const allowed = agent.subagents?.allowAgents
      if (Array.isArray(allowed)) {
        map[agent.id] = allowed
      }
    }
  } catch (e) { core.common.logger.debug('data-fetchers', 'AllowAgents map read failed', { error: String(e) }) }
  return map
}

export async function fetchMessagesData(): Promise<MessagesResult> {
  const messages: AgentMessage[] = []
  const agentErrors: Record<string, number> = {}
  const lastActivity: Record<string, number> = {}
  const activePairs: Array<{ from: string; to: string; type: 'spawn' | 'send' }> = []

  try {
    const sessResult = await gwCallAsync('sessions.list', { limit: 100 }, 20000) as {
      sessions?: Array<{
        key: string
        updatedAt?: number
        outputTokens?: number
      }>
    }
    const sessions = sessResult.sessions || []
    const now = Date.now()
    const recentThreshold = 300_000 // 5 minutes

    for (const session of sessions) {
      const parts = session.key.split(':')
      if (parts[0] !== 'agent' || parts.length < 3) continue
      const agentId = parts[1]
      const isSubagent = parts[2] === 'subagent'
      const ts = session.updatedAt || 0

      // Track last activity
      if (ts > (lastActivity[agentId] || 0)) {
        lastActivity[agentId] = ts
      }

      // Only consider recent sessions for active pairs
      if (now - ts > recentThreshold) continue

      if (isSubagent) {
        // With allowAgents=[self], spawn is always self-spawn
        const parentId = agentId

        const msg: AgentMessage = {
          timestamp: new Date(ts).toISOString(),
          fromAgent: parentId,
          toAgent: agentId,
          type: 'spawn',
        }
        messages.push(msg)
        activePairs.push({ from: parentId, to: agentId, type: 'spawn' })

        if (session.outputTokens && session.outputTokens > 0) {
          messages.push({
            timestamp: new Date(ts).toISOString(),
            fromAgent: agentId,
            toAgent: parentId,
            type: 'send',
          })
          activePairs.push({ from: agentId, to: parentId, type: 'send' })
        }
      }
    }

    // Parse gateway logs for errors
    try {
      const raw = await gwCallAsync('logs.tail', undefined, 20000) as { lines?: string[] }
      const lines = raw.lines || []
      for (const line of lines.slice(-50)) {
        try {
          const entry = JSON.parse(line)
          if (entry._meta?.logLevelName === 'ERROR') {
            const time = entry.time || entry._meta?.date
            if (!time) continue
            const errTs = new Date(time).getTime()
            // Try to identify which agent the error relates to
            const msg = String(entry['1'] || '')
            for (const [aid, ts] of Object.entries(lastActivity)) {
              if (msg.includes(aid) && errTs > (agentErrors[aid] || 0)) {
                agentErrors[aid] = errTs
              }
            }
            messages.push({
              timestamp: new Date(errTs).toISOString(),
              fromAgent: 'gateway',
              toAgent: 'system',
              type: 'error',
            })
          }
        } catch { /* skip */ }
      }
    } catch (e) { core.common.logger.debug('data-fetchers', 'logs.tail fetch failed (messages)', { error: String(e) }) }
  } catch (e) { core.common.logger.debug('data-fetchers', 'sessions.list fetch failed (messages)', { error: String(e) }) }

  return { messages, activePairs, agentErrors, lastActivity, source: 'gateway' }
}

// ── Costs ───────────────────────────────────────────────────────

export interface CostsResult {
  entries: CostEntry[]
  totalCost: number
  source: 'filesystem'
}

export async function fetchCostsData(): Promise<CostsResult> {
  try {
    const result = core.observe.queryCosts()
    // Return only the last 200 entries for consistency
    const entries = result.entries.slice(-200)
    const totalCost = entries.reduce((sum, e) => sum + (e.cost || 0), 0)
    return { entries, totalCost, source: 'filesystem' }
  } catch (e) { core.common.logger.debug('data-fetchers', 'Costs data read failed', { error: String(e) }) }
  return { entries: [], totalCost: 0, source: 'filesystem' }
}

// ── Alerts ──────────────────────────────────────────────────────

export interface AlertItem {
  id: string
  type: string
  message: string
  timestamp: string
  severity: 'info' | 'warn' | 'error'
}

export interface AlertsResult {
  alerts: AlertItem[]
  source: 'filesystem'
}

export async function fetchAlertsData(): Promise<AlertsResult> {
  let alerts: AlertItem[] = []
  try {
    const raw = core.observe.reactors.getAlerts()
    alerts = raw.map((a) => ({
      id: a.id,
      type: a.type,
      message: a.data?.reason as string || `${a.type} alert`,
      timestamp: a.ts,
      severity: a.severity as 'info' | 'warn' | 'error',
    }))
  } catch (e) { core.common.logger.debug('data-fetchers', 'Alerts data read failed', { error: String(e) }) }
  return { alerts, source: 'filesystem' }
}

// ── Autopilot Status ────────────────────────────────────────────

export interface AutopilotResult {
  status: string
  pid?: number
  lastCycle?: string
  source: 'filesystem'
}

export async function fetchAutopilotStatusData(): Promise<AutopilotResult> {
  try {
    const data = core.common.loadState()
    return {
      status: data.status || 'stopped',
      pid: data.pid || undefined,
      lastCycle: data.lastCycleAt || undefined,
      source: 'filesystem',
    }
  } catch (e) { core.common.logger.debug('data-fetchers', 'Autopilot status read failed', { error: String(e) }) }
  return { status: 'stopped', source: 'filesystem' }
}

// ── Autopilot Departments ───────────────────────────────────────

export interface AutopilotDeptsResult {
  departments: Record<string, unknown>[]
  source: 'filesystem'
}

export async function fetchAutopilotDeptsData(): Promise<AutopilotDeptsResult> {
  let departments: Record<string, unknown>[] = []
  try {
    departments = core.repo.deptRegistryRepo.readAll()
  } catch (e) { core.common.logger.debug('data-fetchers', 'Department registry read failed', { error: String(e) }) }
  return { departments, source: 'filesystem' }
}

// ── Budget Status ───────────────────────────────────────────────

export interface BudgetResult {
  budget: CompanyBudget
  source: 'filesystem'
}

export async function fetchBudgetStatusData(): Promise<BudgetResult> {
  let budget: CompanyBudget = {}
  try {
    budget = core.observe.loadCompanyBudget()
  } catch (e) { core.common.logger.debug('data-fetchers', 'Budget data read failed', { error: String(e) }) }
  return { budget, source: 'filesystem' }
}
