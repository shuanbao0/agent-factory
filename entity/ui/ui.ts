/**
 * UI-only entity types — display layer, no CJS needed.
 */

export interface Skill {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  usageCount?: number
  source?: 'builtin' | 'project' | 'clawhub'
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  agent: string
  message: string
  details?: string
}

export interface TimelineMessage {
  id: string
  timestamp: string
  fromAgent: string
  toAgent: string
  type: 'spawn' | 'send' | 'complete' | 'error' | 'log'
  content: string
  sessionKey: string
}

export interface Channel {
  id: string
  type: 'project' | 'pair'
  label: string
  agents: string[]
  messageCount: number
  lastTimestamp: string
  projectId?: string
}
