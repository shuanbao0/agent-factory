/**
 * Agent entity — identity types and metadata.
 */

export type AgentRole = 'pm' | 'researcher' | 'product' | 'designer' | 'frontend' | 'backend' | 'tester'

export interface Agent {
  id: string
  templateId: string | null
  role: AgentRole | string
  name: string
  status: 'online' | 'busy'
  currentTask?: string
  currentProject?: string
  currentTool?: string | null
  tokensUsed: number
  messagesCount: number
  tasksCompleted: number
  tasksInProgress: number
  lastActive: string
  description: string
  department?: string
}

export interface AgentMeta {
  id?: string
  templateId?: string
  name?: string
  role?: string
  description?: string
  department?: string
  model?: string
  skills?: string[]
  peers?: string[]
  [key: string]: unknown
}

export interface AgentTemplate {
  id: string
  name: string
  description: string
  emoji: string
  category: 'builtin' | 'custom'
  group?: string
  hidden?: boolean
  hasIdentityFiles?: boolean
  defaults: {
    model: string
    skills: string[]
    peers: string[]
  }
}

export interface AgentConfigEntry {
  id: string
  workspace: string
  model?: string
  subagents?: {
    allowAgents?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}
