/**
 * Type definitions for Agent Factory data models.
 * All data comes from the internal Gateway API — no mock data.
 */

export type AgentRole = 'pm' | 'researcher' | 'product' | 'designer' | 'frontend' | 'backend' | 'tester'

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

export interface DepartmentFurnitureItem {
  type: string   // FurnitureType key: 'desk' | 'plant' | 'bookshelf' etc.
  count: number
}

export interface Department {
  id: string
  name: string       // Chinese name
  nameEn: string     // English name
  emoji: string
  order: number
  floorColor: { h: number; s: number; b: number; c: number }
  furniture: DepartmentFurnitureItem[]
}

export interface Agent {
  id: string
  templateId: string | null
  role: AgentRole | string
  name: string
  status: 'online' | 'busy'
  currentTask?: string
  currentTool?: string | null
  tokensUsed: number
  tasksCompleted: number
  lastActive: string
  description: string
  department?: string
}

export interface TaskQuality {
  selfCheck?: {
    passed: boolean
    score: number
    checklist: string[]
    at: string
  }
  peerReview?: {
    reviewer: string
    passed: boolean
    score: number
    comments: string
    at: string
  }
  headApproval?: {
    approver: string
    passed: boolean
    at: string
  }
}

export interface Task {
  id: string
  name: string
  description?: string
  projectId?: string | null      // null = standalone task
  phase?: number
  status: 'pending' | 'assigned' | 'in_progress' | 'review' | 'completed' | 'failed' | 'rework'
  priority: 'P0' | 'P1' | 'P2'
  assignees: string[]            // supports multi-agent assignment
  assignedAgent?: string         // legacy compat
  creator: 'user' | string       // 'user' or agent-id
  progress: number
  dependencies: string[]
  output?: string
  tags?: string[]
  type?: string                  // structured task type from workflow
  parentTaskId?: string          // sub-task relationship
  quality?: TaskQuality
  reworkCount?: number
  reworkFromId?: string
  validationErrors?: string[]
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface DepartmentLoopState {
  status: 'running' | 'stopped' | 'cycling' | 'idle' | 'error'
  pid: number | null
  cycleCount: number
  lastCycleAt: string | null
  lastCycleResult: string | null
  history: Array<{
    cycle: number
    startedAt: string
    completedAt: string
    elapsedSec: number
    result: string
  }>
  tokensUsedToday: number
  budgetResetAt: string | null
}

export interface PhaseDefinition {
  key: string
  labelZh: string
  labelEn: string
}

export interface TaskTypeDefinition {
  value: string
  labelZh: string
  labelEn: string
  color: string
}

export interface QualityGateConfig {
  minScore?: number
  requireSelfCheck?: boolean
  requirePeerReview?: boolean
  maxReworks?: number
  validators?: string[]
  validatorConfig?: Record<string, unknown>
}

export interface PipelineStep {
  from: string
  to: string
  qualityGate?: QualityGateConfig
}

export interface DepartmentWorkflow {
  phases: PhaseDefinition[]
  taskTypes: TaskTypeDefinition[]
  directories: string[]
  pipeline: PipelineStep[]
}

export interface DepartmentConfig {
  id: string
  name: string
  head: string
  interval: number
  enabled: boolean
  agents: string[]
  budget?: {
    dailyTokenLimit: number
    alertThreshold: number
  }
  kpis?: Record<string, { target: number; unit: string }>
  workflow?: DepartmentWorkflow
}

export interface BudgetSummary {
  company: {
    dailyLimit: number
    used: number
    ratio: number
  }
  departments: Record<string, {
    limit: number
    used: number
    ratio: number
  }>
}

export interface Project {
  id: string
  name: string
  description: string
  status: 'planning' | 'in-progress' | 'completed' | 'paused'
  currentPhase: number
  totalPhases: number
  tasks: Task[]
  createdAt: string
  tokensUsed: number
  phases?: PhaseDefinition[]
  department?: string
}

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
