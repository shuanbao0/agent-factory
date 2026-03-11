import { create } from 'zustand'
import {
  Agent, AgentTemplate, Project, Skill, LogEntry, Task, Department
} from './types'
import type { AgentMessage } from './data-fetchers'
import type { BudgetSummary } from './types'
import type { AutopilotState, DeptInfo } from './autopilot-shared'

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
        // Map gateway agents to the Agent interface
        const agents: Agent[] = data.agents.map((a: Record<string, string>) => ({
          id: a.id,
          templateId: a.templateId || null,
          role: a.role || 'pm',
          name: a.name || a.id,
          status: a.status || 'online',
          description: a.description || '',
          department: a.department || undefined,
          tokensUsed: 0,
          messagesCount: 0,
          tasksCompleted: 0,
          tasksInProgress: 0,
          lastActive: new Date().toISOString(),
          currentTask: a.isDefault ? 'Default agent' : undefined,
        }))
        // Merge token usage from usageByAgent
        const byAgent = get().usageByAgent
        for (const a of agents) {
          const usage = byAgent.find(u => u.agentId === a.id || a.id.includes(u.agentId))
          if (usage) {
            a.tokensUsed = usage.totals.totalTokens
            a.messagesCount = usage.totals.totalMessages || 0
          }
        }
        // Merge task counts from tasks
        const tasks = get().tasks
        for (const a of agents) {
          const agentTasks = tasks.filter(t => t.assignees?.includes(a.id) || t.assignedAgent === a.id)
          a.tasksCompleted = agentTasks.filter(t => t.status === 'completed').length
          a.tasksInProgress = agentTasks.filter(t => t.status === 'in_progress' || t.status === 'assigned').length
          const inProgressTask = agentTasks.find(t => t.status === 'in_progress')
          if (inProgressTask) {
            a.currentTask = inProgressTask.name
            a.currentProject = inProgressTask.projectId || undefined
          }
        }
        set({ agents, connected: true, dataSource: 'gateway' })
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
        // Update agent token counts and message counts
        const agents = [...get().agents]
        for (const a of agents) {
          const usage = byAgent.find((u: UsageByAgent) => u.agentId === a.id || a.id.includes(u.agentId))
          if (usage) {
            a.tokensUsed = usage.totals.totalTokens
            a.messagesCount = usage.totals.totalMessages || 0
          }
        }
        set({ agents })
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
    const es = new EventSource('/api/events')

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
          const agents: Agent[] = data.agents.map((a: Record<string, string>) => ({
            id: a.id,
            templateId: a.templateId || null,
            role: a.role || 'pm',
            name: a.name || a.id,
            status: a.status || 'online',
            description: a.description || '',
            department: a.department || undefined,
            tokensUsed: 0,
            messagesCount: 0,
            tasksCompleted: 0,
            tasksInProgress: 0,
            lastActive: new Date().toISOString(),
            currentTask: a.isDefault ? 'Default agent' : undefined,
          }))
          const byAgent = get().usageByAgent
          for (const a of agents) {
            const usage = byAgent.find(u => u.agentId === a.id || a.id.includes(u.agentId))
            if (usage) {
              a.tokensUsed = usage.totals.totalTokens
              a.messagesCount = usage.totals.totalMessages || 0
            }
          }
          // Merge task counts
          const tasks = get().tasks
          for (const a of agents) {
            const agentTasks = tasks.filter(t => t.assignees?.includes(a.id) || t.assignedAgent === a.id)
            a.tasksCompleted = agentTasks.filter(t => t.status === 'completed').length
            a.tasksInProgress = agentTasks.filter(t => t.status === 'in_progress' || t.status === 'assigned').length
            const inProgressTask = agentTasks.find(t => t.status === 'in_progress')
            if (inProgressTask) {
              a.currentTask = inProgressTask.name
              a.currentProject = inProgressTask.projectId || undefined
            }
          }
          set({ agents, connected: true, dataSource: 'gateway' })
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
          const agents = [...get().agents]
          for (const a of agents) {
            const usage = byAgent.find((u: UsageByAgent) => u.agentId === a.id || a.id.includes(u.agentId))
            if (usage) {
              a.tokensUsed = usage.totals.totalTokens
              a.messagesCount = usage.totals.totalMessages || 0
            }
          }
          set({ agents })
        }
      } catch { /* ignore */ }
    })

    es.addEventListener('tasks', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        if (data.tasks) {
          // Normalize legacy fields
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
          // Re-merge task counts into agents
          const agents = [...get().agents]
          for (const a of agents) {
            const agentTasks = tasks.filter(t => t.assignees?.includes(a.id) || t.assignedAgent === a.id)
            a.tasksCompleted = agentTasks.filter(t => t.status === 'completed').length
            a.tasksInProgress = agentTasks.filter(t => t.status === 'in_progress' || t.status === 'assigned').length
            const inProgressTask = agentTasks.find(t => t.status === 'in_progress')
            if (inProgressTask) {
              a.currentTask = inProgressTask.name
              a.currentProject = inProgressTask.projectId || undefined
            } else {
              a.currentTask = undefined
              a.currentProject = undefined
            }
          }
          set({ agents })
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
    }
  },
}))
