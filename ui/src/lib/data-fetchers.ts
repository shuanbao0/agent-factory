/**
 * Shared data fetching functions — used by both API routes and SSE endpoint.
 * All functions use gwCallAsync (non-blocking) and return the same structure
 * as the original API JSON responses.
 */
import { gwCallAsync } from '@/lib/gateway-client'
import core from '@/lib/core-bridge'
import type { Task } from '@entity/task'
import type { CostEntry, CompanyBudget } from '@entity/observe'

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
  // 1. Agent list from DB
  type AgentRow = { id: string; templateId?: string; name: string; role?: string; description?: string; department?: string }
  let agentList: AgentRow[] = []
  let defaultAgentId = ''
  try {
    agentList = core.db.agentQueries.findAllAgents()
  } catch (e) { core.common.logger.debug('data-fetchers', 'Agent DB query failed', { error: String(e) }) }

  // Read defaultAgent from config
  try {
    const cfg = core.repo.configRepo.getConfig()
    defaultAgentId = (cfg as Record<string, unknown>).defaultAgent as string || ''
  } catch { /* ignore */ }

  // 2. Busy status: still needs Gateway sessions (best-effort)
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

  // 3. Build result
  const agents: AgentItem[] = agentList.map(a => ({
    id: a.id,
    templateId: a.templateId || null,
    role: a.role || a.id,
    name: a.name || a.id,
    description: a.description || `Agent: ${a.id}`,
    status: (busyAgentIds.has(a.id) ? 'busy' : 'online') as 'busy' | 'online',
    isDefault: a.id === defaultAgentId,
    department: a.department || undefined,
  }))

  return { agents, source: 'gateway' }
}

// ── Logs ─────────────────────────────────────────────────────────

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

export async function fetchLogsData(): Promise<LogsResult> {
  const entries: LogItem[] = []
  let idx = 0

  // 1. Agent activity from DB messages table (replaces sessions.list)
  try {
    const result = core.db.messageQueries.queryMessages({ limit: 100 })
    for (const row of result.messages) {
      const tokens = ((row.inputTokens as number) || 0) + ((row.outputTokens as number) || 0)
      entries.push({
        id: `activity-${idx++}`,
        timestamp: String(row.ts),
        level: row.ok === 0 ? 'error' as const : 'info' as const,
        agent: String(row.agentId || 'system'),
        message: `${row.messageType || 'chat'} [${row.direction}] — ${tokens} tokens`,
      })
    }
  } catch (e) { core.common.logger.debug('data-fetchers', 'Messages DB query failed (logs)', { error: String(e) }) }

  // 2. Gateway system logs (best-effort, only available when Gateway is running)
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

  // DB-only: aggregate from cost_entries table
  const agg = core.db.costQueries.getUsageAggregatesFromDb(30)
  const data: UsageResult = {
    source: 'gateway',
    aggregates: {
      daily: agg.daily.map((d: { date: string; tokens: number; cost: number; calls: number }) => ({
        date: d.date,
        tokens: d.tokens || 0,
        cost: d.cost || 0,
        messages: d.calls || 0,
        toolCalls: 0,
        errors: 0,
      })),
      byAgent: agg.byAgent.map((a: { agentId: string; totalTokens: number; totalCost: number }) => ({
        agentId: a.agentId,
        totals: { totalTokens: a.totalTokens || 0, totalCost: a.totalCost || 0 },
      })),
    },
    totals: { totalCost: agg.totals.totalCost || 0, totalTokens: agg.totals.totalTokens || 0 },
  }

  if (!hasParams) {
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
  type: 'spawn' | 'send' | 'error' | 'log' | string
  messageType?: string
  direction?: string
  channel?: string
  content?: string
  inputTokens?: number
  outputTokens?: number
  cost?: number
}

export interface MessagesResult {
  messages: AgentMessage[]
  activePairs: Array<{ from: string; to: string; type: 'spawn' | 'send' }>
  agentErrors: Record<string, number>
  lastActivity: Record<string, number>
  source: 'gateway'
}


export async function fetchMessagesData(): Promise<MessagesResult> {
  const messages: AgentMessage[] = []
  const agentErrors: Record<string, number> = {}
  const lastActivity: Record<string, number> = {}
  const activePairs: Array<{ from: string; to: string; type: 'spawn' | 'send' }> = []

  try {
    const result = core.db.messageQueries.queryMessages({ limit: 200 })

    const recentThreshold = Date.now() - 300_000 // 5 minutes

    for (const row of result.messages) {
      const fromAgent = row.direction === 'request'
        ? (row.fromAgent || 'system') as string
        : row.agentId as string
      const toAgent = row.direction === 'request'
        ? row.agentId as string
        : (row.fromAgent || 'system') as string

      const agentId = row.agentId as string
      const ts = new Date(row.ts as string).getTime()

      // Track last activity
      if (ts > (lastActivity[agentId] || 0)) {
        lastActivity[agentId] = ts
      }

      // Track errors
      if (row.ok === 0 && ts > (agentErrors[agentId] || 0)) {
        agentErrors[agentId] = ts
      }

      // Active pairs from recent responses
      if (row.direction === 'response' && ts > recentThreshold) {
        activePairs.push({ from: fromAgent, to: toAgent, type: 'send' })
      }

      messages.push({
        timestamp: row.ts as string,
        fromAgent,
        toAgent,
        type: row.ok === 0 ? 'error' : 'send',
        messageType: row.messageType as string,
        direction: row.direction as string,
        channel: row.channel as string,
        inputTokens: row.inputTokens as number,
        outputTokens: row.outputTokens as number,
        cost: row.cost as number,
      })
    }
  } catch (e) {
    core.common.logger.debug('data-fetchers', 'Messages DB query failed', { error: String(e) })
  }

  return { messages, activePairs, agentErrors, lastActivity, source: 'gateway' }
}

// ── Costs ───────────────────────────────────────────────────────

export interface CostsResult {
  entries: CostEntry[]
  totalCost: number
  source: 'filesystem'
}

export async function fetchCostsData(): Promise<CostsResult & { summary?: unknown; totalInputTokens?: number; totalOutputTokens?: number }> {
  const result = core.db.costQueries.queryCostEntries({ from: _last30dDate() })
  const entries = result.entries.slice(-200)
  const summary = core.db.costQueries.getDailySummaryFromDb(30)
  return {
    entries,
    totalCost: result.totalCost,
    summary,
    totalInputTokens: result.totalInputTokens || 0,
    totalOutputTokens: result.totalOutputTokens || 0,
    source: 'filesystem',
  }
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
