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
  } catch { /* sessions.list not available */ }

  // Check autopilot state
  try {
    const ap = core.common.loadState()
    if (ap.status === 'cycling') busyAgentIds.add('ceo')
  } catch { /* ignore */ }

  // Read agent instance metadata via repo
  const agentInstances = new Map<string, AgentMeta>()
  try {
    const agentIds = core.repo.agentMetaRepo.listAllAgentIds()
    for (const id of agentIds) {
      const meta = core.repo.agentMetaRepo.readMeta(id)
      if (meta) agentInstances.set(id, meta as AgentMeta)
    }
  } catch { /* ignore */ }

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
  } catch { /* logs.tail not available */ }

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

  if (!hasParams) {
    _usageCache = { data, ts: Date.now() }
  }

  return data
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

// ── Costs ────────────────────────────────────────────────────

export interface CostsSummaryItem {
  date: string
  source: string
  cost: number
  inputTokens: number
  outputTokens: number
  calls: number
}

export interface CostsResult {
  summary: CostsSummaryItem[]
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
}

export async function fetchCostsData(): Promise<CostsResult> {
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const { getDailySummary } = require('../../../shared/cost-tracker.cjs')

  const summary = getDailySummary(7) as CostsSummaryItem[]
  let totalCost = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  for (const s of summary) {
    totalCost += s.cost || 0
    totalInputTokens += s.inputTokens || 0
    totalOutputTokens += s.outputTokens || 0
  }

  return {
    summary,
    totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
    totalInputTokens,
    totalOutputTokens,
  }
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
  } catch { /* ignore */ }
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
    } catch { /* logs not available */ }
  } catch { /* gateway not available */ }

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
  } catch { /* skip */ }
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
  } catch { /* skip */ }
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
  } catch { /* skip */ }
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
  } catch { /* skip */ }
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
  } catch { /* skip */ }
  return { budget, source: 'filesystem' }
}
