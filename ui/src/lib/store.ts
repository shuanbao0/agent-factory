import { create } from 'zustand'
import {
  Agent, AgentTemplate, Project, Skill, LogEntry, Task, Department
} from './types'
import type { AgentMessage } from './data-fetchers'
import type { BudgetSummary } from './types'
import type { AutopilotState, DeptInfo } from './autopilot-shared'

// === Agent enrichment scheduling (Fix 1: deferred merge to unblock event loop) ===
let _enrichTimer: ReturnType<typeof setTimeout> | null = null

function scheduleAgentEnrichment(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
) {
  if (_enrichTimer) return // already scheduled
  _enrichTimer = setTimeout(() => {
    _enrichTimer = null
    const { agents, usageByAgent, tasks } = get()
    if (!agents.length) return

    // Build lookup maps — O(agents + tasks) instead of O(agents × tasks)
    const usageMap = new Map<string, UsageByAgent>()
    for (const u of usageByAgent) usageMap.set(u.agentId, u)

    const tasksByAgent = new Map<string, Task[]>()
    for (const t of tasks) {
      const ids = [...(t.assignees || [])]
      if (t.assignedAgent && !ids.includes(t.assignedAgent)) ids.push(t.assignedAgent)
      for (const id of ids) {
        let arr = tasksByAgent.get(id)
        if (!arr) { arr = []; tasksByAgent.set(id, arr) }
        arr.push(t)
      }
    }

    const enriched: Agent[] = agents.map(a => {
      const copy = { ...a }
      // Usage
      const usage = usageMap.get(a.id)
        || (usageByAgent.find(u => a.id.includes(u.agentId)))
      if (usage) {
        copy.tokensUsed = usage.totals.totalTokens
        copy.messagesCount = usage.totals.totalMessages || 0
      }
      // Tasks
      const agentTasks = tasksByAgent.get(a.id) || []
      copy.tasksCompleted = agentTasks.filter(t => t.status === 'completed').length
      copy.tasksInProgress = agentTasks.filter(t => t.status === 'in_progress' || t.status === 'assigned').length
      const inProgressTask = agentTasks.find(t => t.status === 'in_progress')
      if (inProgressTask) {
        copy.currentTask = inProgressTask.name
        copy.currentProject = inProgressTask.projectId || undefined
      } else if (a.status === 'busy') {
        const pendingTask = agentTasks
          .filter(t => t.status === 'pending' || t.status === 'assigned')
          .sort((x, y) => (y.updatedAt || y.createdAt || '').localeCompare(x.updatedAt || x.createdAt || ''))
          [0]
        if (pendingTask) {
          copy.currentTask = pendingTask.name
          copy.currentProject = pendingTask.projectId || undefined
        } else {
          copy.currentTask = undefined
          copy.currentProject = undefined
        }
      } else {
        copy.currentTask = a.currentTask
        copy.currentProject = a.currentProject
      }
      return copy
    })
    set({ agents: enriched })
  }, 0)
}

// === Fix 4: SSE connection cache ===
let _activeEventSource: EventSource | null = null

// === Real data types from Gateway ===
export interface UsageDaily {
  date: string
  tokens: number
  cost: number
  messages: number
  toolCalls: number
  errors: number
}

export interface UsageByAgent {
  agentId: string
  totals: {
    totalTokens: number
    totalCost: number
    totalMessages?: number
  }
}

export interface HealthData {
  gatewayOk: boolean
  channels: Record<string, { configured: boolean; running: boolean }>
  sessionCount: number
}

export interface ModelInfo {
  ref: string
  provider: string
  alias: string
  modelId: string
  hasApiKey: boolean
  baseUrl?: string
  isDefault: boolean
}

export interface ProviderInfo {
  apiKey: string
  baseUrl?: string
  api?: string
  models: Record<string, string>
  hasApiKey: boolean
  // Unified auth info
  authMode: 'setup-token' | 'oauth' | 'env-var' | 'config' | 'none'
  authDetail?: string
  hasSetupToken: boolean
  setupTokenPreview?: string | null
  setupTokenProfileId?: string | null
}

interface AppState {
  // Mode
  mode: 'attached' | 'standalone'
  setMode: (m: 'attached' | 'standalone') => void

  // Connection
  connected: boolean
  setConnected: (c: boolean) => void

  // Data source indicator
  dataSource: 'error' | 'gateway' | 'loading'

  // Agents
  agents: Agent[]
  setAgents: (a: Agent[]) => void

  // Templates
  templates: AgentTemplate[]
  fetchTemplates: () => Promise<void>

  // Departments
  departments: Department[]
  fetchDepartments: () => Promise<void>

  // Projects
  projects: Project[]
  setProjects: (p: Project[]) => void

  // Skills
  skills: Skill[]
  setSkills: (s: Skill[]) => void

  // Logs
  logs: LogEntry[]
  addLog: (l: LogEntry) => void
  setLogs: (l: LogEntry[]) => void

  // Usage (real data)
  usageDaily: UsageDaily[]
  usageByAgent: UsageByAgent[]
  totalCost: number
  totalTokens: number

  // Health
  health: HealthData | null

  // Models
  modelsList: ModelInfo[]
  providers: Record<string, ProviderInfo>
  defaultModel: string
  agentModels: Record<string, string>  // agentId -> model ref
  fetchModels: () => Promise<void>
  fetchAgentModel: (agentId: string) => Promise<void>
  setAgentModel: (agentId: string, model: string) => Promise<void>
  setDefaultModel: (ref: string) => Promise<void>

  // Settings
  settings: {
    gatewayUrl: string
    apiKey: string
    model: string
    standalonePort: number
  }
  updateSettings: (s: Partial<AppState['settings']>) => void

  // Pixel Office rich state data
  agentMessages: AgentMessage[]
  agentActivePairs: Array<{ from: string; to: string; type: 'spawn' | 'send' }>
  agentErrors: Record<string, number>
  lastActivityTimestamps: Record<string, number>

  // Tasks
  tasks: Task[]
  setTasks: (t: Task[]) => void
  fetchTasks: () => Promise<void>

  // Autopilot
  autopilotState: AutopilotState | null
  autopilotDepts: DeptInfo[]
  autopilotError: string
  autopilotLoading: boolean
  fetchAutopilot: () => Promise<void>
  fetchAutopilotDepts: () => Promise<void>
  sendAutopilotAction: (action: string, extra?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
  budgetSummary: BudgetSummary | null
  fetchBudget: () => Promise<void>

  // Tab visibility
  tabVisible: boolean
  setTabVisible: (v: boolean) => void

  // SSE connection
  connectSSE: () => () => void

  // Actions (kept for manual refresh)
  fetchAgents: () => Promise<void>
  fetchUsage: () => Promise<void>
  fetchLogs: () => Promise<void>
  fetchHealth: () => Promise<void>
  fetchSessions: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: 'standalone',
  setMode: (mode) => set({ mode }),

  connected: false,
  setConnected: (connected) => set({ connected }),

  dataSource: 'loading',

  agents: [],
  setAgents: (agents) => set({ agents }),

  templates: [],
  fetchTemplates: async () => {
    try {
      const res = await fetch('/api/templates')
      if (!res.ok) return
      const data = await res.json()
      set({ templates: data.templates || [] })
    } catch {}
  },

  departments: [],
  fetchDepartments: async () => {
    try {
      const res = await fetch('/api/departments')
      if (!res.ok) return
      const data = await res.json()
      set({ departments: data.departments || [] })
    } catch {}
  },

  projects: [],
  setProjects: (projects) => set({ projects }),

  skills: [],
  setSkills: (skills) => set({ skills }),

  logs: [],
  addLog: (log) => set((state) => ({ logs: [log, ...state.logs].slice(0, 500) })),
  setLogs: (logs) => set({ logs }),

  usageDaily: [],
  usageByAgent: [],
  totalCost: 0,
  totalTokens: 0,

  health: null,

  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  fetchTasks: async () => {
    try {
      const res = await fetch('/api/tasks')
      if (!res.ok) return
      const data = await res.json()
      set({ tasks: data.tasks || [] })
    } catch { /* ignore */ }
  },

  agentMessages: [],
  agentActivePairs: [],
  agentErrors: {},
  lastActivityTimestamps: {},

  // Autopilot
  autopilotState: null,
  autopilotDepts: [],
  autopilotError: '',
  autopilotLoading: false,
  fetchAutopilot: async () => {
    try {
      const res = await fetch('/api/autopilot')
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      set({ autopilotState: data, autopilotError: '' })
    } catch (e) {
      set({ autopilotError: String(e) })
    }
  },
  fetchAutopilotDepts: async () => {
    try {
      const res = await fetch('/api/autopilot?view=departments')
      if (!res.ok) return
      const data = await res.json()
      set({ autopilotDepts: data.departments || [] })
    } catch { /* ignore */ }
  },
  sendAutopilotAction: async (action: string, extra?: Record<string, unknown>) => {
    set({ autopilotLoading: true })
    try {
      const res = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        const error = data.error || 'Action failed'
        set({ autopilotError: error, autopilotLoading: false })
        return { ok: false, error }
      }
      // Immediately refresh state after successful action
      await get().fetchAutopilot()
      set({ autopilotLoading: false })
      return { ok: true }
    } catch (e) {
      const error = String(e)
      set({ autopilotError: error, autopilotLoading: false })
      return { ok: false, error }
    }
  },
  budgetSummary: null,
  fetchBudget: async () => {
    try {
      const res = await fetch('/api/autopilot?view=budgets')
      if (!res.ok) return
      set({ budgetSummary: await res.json() })
    } catch { /* ignore */ }
  },

  tabVisible: true,
  setTabVisible: (v) => set({ tabVisible: v }),

  modelsList: [],
  providers: {},
  defaultModel: 'anthropic/sonnet',
  agentModels: {},

  fetchModels: async () => {
    try {
      const res = await fetch('/api/models')
      if (!res.ok) return
      const data = await res.json()
      set({
        modelsList: data.models || [],
        providers: data.providers || {},
        defaultModel: data.default || '',
      })
    } catch { /* ignore */ }
  },

  fetchAgentModel: async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/model?id=${agentId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.model) {
        set(state => ({ agentModels: { ...state.agentModels, [agentId]: data.model } }))
      }
    } catch { /* ignore */ }
  },

  setAgentModel: async (agentId: string, model: string) => {
    try {
      await fetch('/api/agents/model', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, model }),
      })
      set(state => ({ agentModels: { ...state.agentModels, [agentId]: model } }))
    } catch { /* ignore */ }
  },

  setDefaultModel: async (ref: string) => {
    try {
      await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setDefault', ref }),
      })
      set({ defaultModel: ref })
      get().fetchModels()
    } catch { /* ignore */ }
  },

  settings: {
    gatewayUrl: 'ws://127.0.0.1:19100',
    apiKey: '',
    model: 'claude-sonnet-4-20250514',
    standalonePort: 19100,
  },
  updateSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),

  fetchAgents: async () => {
    try {
      const res = await fetch('/api/agents')
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      if (data.source === 'gateway' && data.agents?.length) {
        // Preserve enriched fields from previous state to avoid flicker
        const prev = new Map(get().agents.map(a => [a.id, a]))
        const agents: Agent[] = data.agents.map((a: Record<string, string>) => {
          const old = prev.get(a.id)
          return {
            id: a.id,
            templateId: a.templateId || null,
            role: a.role || 'pm',
            name: a.name || a.id,
            status: a.status || 'online',
            description: a.description || '',
            department: a.department || undefined,
            tokensUsed: old?.tokensUsed || 0,
            messagesCount: old?.messagesCount || 0,
            tasksCompleted: old?.tasksCompleted || 0,
            tasksInProgress: old?.tasksInProgress || 0,
            lastActive: new Date().toISOString(),
            currentTask: old?.currentTask ?? (a.isDefault ? 'Default agent' : undefined),
            currentProject: old?.currentProject,
          }
        })
        set({ agents, connected: true, dataSource: 'gateway' })
        scheduleAgentEnrichment(get, set)
      }
    } catch {
      set({ dataSource: 'error' })
    }
  },

  fetchUsage: async () => {
    try {
      const res = await fetch('/api/usage')
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      if (data.source === 'gateway' && data.aggregates) {
        const daily: UsageDaily[] = (data.aggregates.daily || []).map((d: UsageDaily) => ({
          date: d.date,
          tokens: d.tokens,
          cost: d.cost,
          messages: d.messages,
          toolCalls: d.toolCalls,
          errors: d.errors,
        }))
        const byAgent: UsageByAgent[] = (data.aggregates.byAgent || []).map((a: { agentId: string; totals: { totalTokens: number; totalCost: number; totalMessages?: number } }) => ({
          agentId: a.agentId,
          totals: { totalTokens: a.totals.totalTokens, totalCost: a.totals.totalCost, totalMessages: a.totals.totalMessages || 0 },
        }))
        set({
          usageDaily: daily,
          usageByAgent: byAgent,
          totalCost: data.totals?.totalCost || 0,
          totalTokens: data.totals?.totalTokens || 0,
          connected: true,
          dataSource: 'gateway',
        })
        scheduleAgentEnrichment(get, set)
      }
    } catch {
      // API failed
    }
  },

  fetchLogs: async () => {
    try {
      const res = await fetch('/api/logs')
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      if (data.source === 'gateway' && data.logs?.length) {
        set({ logs: data.logs })
      }
    } catch {
      // API failed
    }
  },

  fetchHealth: async () => {
    try {
      const res = await fetch('/api/health')
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      if (data.source === 'gateway') {
        const h = data.health
        set({
          health: {
            gatewayOk: h?.ok || false,
            channels: h?.channels || {},
            sessionCount: Object.keys(data.status?.sessions?.byAgent || {}).reduce(
              (sum: number, k: string) => sum + ((data.status?.sessions?.byAgent as Record<string, number[]>)?.[k]?.length || 0), 0
            ),
          },
          connected: true,
        })
      }
    } catch {
      set({ health: null })
    }
  },

  fetchSessions: async () => {
    try {
      const res = await fetch('/api/sessions?limit=20')
      if (!res.ok) return
    } catch { /* ignore */ }
  },

  connectSSE: () => {
    // Fix 4: reuse existing connection if still alive
    if (_activeEventSource && _activeEventSource.readyState !== EventSource.CLOSED) {
      return () => {} // no-op cleanup — connection already managed
    }

    const es = new EventSource('/api/events')
    _activeEventSource = es

    es.addEventListener('health', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        if (data.source === 'gateway') {
          const h = data.health
          set({
            health: {
              gatewayOk: h?.ok || false,
              channels: h?.channels || {},
              sessionCount: Object.keys(data.status?.sessions?.byAgent || {}).reduce(
                (sum: number, k: string) => sum + ((data.status?.sessions?.byAgent as Record<string, number[]>)?.[k]?.length || 0), 0
              ),
            },
            connected: true,
          })
        }
      } catch { /* ignore parse errors */ }
    })

    es.addEventListener('agents', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        if (data.source === 'gateway' && data.agents?.length) {
          // Preserve enriched fields from previous state to avoid flicker
          const prev = new Map(get().agents.map(a => [a.id, a]))
          const agents: Agent[] = data.agents.map((a: Record<string, string>) => {
            const old = prev.get(a.id)
            return {
              id: a.id,
              templateId: a.templateId || null,
              role: a.role || 'pm',
              name: a.name || a.id,
              status: a.status || 'online',
              description: a.description || '',
              department: a.department || undefined,
              tokensUsed: old?.tokensUsed || 0,
              messagesCount: old?.messagesCount || 0,
              tasksCompleted: old?.tasksCompleted || 0,
              tasksInProgress: old?.tasksInProgress || 0,
              lastActive: new Date().toISOString(),
              currentTask: old?.currentTask ?? (a.isDefault ? 'Default agent' : undefined),
              currentProject: old?.currentProject,
            }
          })
          set({ agents, connected: true, dataSource: 'gateway' })
          scheduleAgentEnrichment(get, set)
        }
      } catch { /* ignore */ }
    })

    es.addEventListener('logs', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        if (data.source === 'gateway' && data.logs?.length) {
          set({ logs: data.logs })
        }
      } catch { /* ignore */ }
    })

    es.addEventListener('usage', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        if (data.source === 'gateway' && data.aggregates) {
          const daily: UsageDaily[] = (data.aggregates.daily || []).map((d: UsageDaily) => ({
            date: d.date,
            tokens: d.tokens,
            cost: d.cost,
            messages: d.messages,
            toolCalls: d.toolCalls,
            errors: d.errors,
          }))
          const byAgent: UsageByAgent[] = (data.aggregates.byAgent || []).map((a: { agentId: string; totals: { totalTokens: number; totalCost: number; totalMessages?: number } }) => ({
            agentId: a.agentId,
            totals: { totalTokens: a.totals.totalTokens, totalCost: a.totals.totalCost, totalMessages: a.totals.totalMessages || 0 },
          }))
          set({
            usageDaily: daily,
            usageByAgent: byAgent,
            totalCost: data.totals?.totalCost || 0,
            totalTokens: data.totals?.totalTokens || 0,
            connected: true,
            dataSource: 'gateway',
          })
          scheduleAgentEnrichment(get, set)
        }
      } catch { /* ignore */ }
    })

    es.addEventListener('tasks', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        if (data.tasks) {
          const tasks: Task[] = (data.tasks as Record<string, unknown>[]).map(t => ({
            id: t.id as string,
            name: t.name as string,
            description: t.description as string | undefined,
            projectId: (t.projectId as string | null) ?? null,
            phase: t.phase as number | undefined,
            status: (t.status as Task['status']) || 'pending',
            priority: (t.priority as Task['priority']) || 'P1',
            assignees: (t.assignees as string[]) || [],
            assignedAgent: t.assignedAgent as string | undefined,
            creator: (t.creator as string) || 'user',
            progress: (t.progress as number) || 0,
            dependencies: (t.dependencies as string[]) || [],
            output: t.output as string | undefined,
            tags: t.tags as string[] | undefined,
            createdAt: (t.createdAt as string) || '',
            updatedAt: (t.updatedAt as string) || '',
            completedAt: t.completedAt as string | undefined,
          }))
          set({ tasks })
          scheduleAgentEnrichment(get, set)
        }
      } catch { /* ignore */ }
    })

    es.addEventListener('messages', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        if (data.source === 'gateway') {
          set({
            agentMessages: data.messages || [],
            agentActivePairs: data.activePairs || [],
            agentErrors: data.agentErrors || {},
            lastActivityTimestamps: data.lastActivity || {},
          })
        }
      } catch { /* ignore */ }
    })

    es.addEventListener('error', () => {
      set({ health: null })
    })

    return () => {
      es.close()
      if (_activeEventSource === es) _activeEventSource = null
    }
  },
}))
