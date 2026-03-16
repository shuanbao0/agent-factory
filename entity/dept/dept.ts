/**
 * Department entity — config, workflow, and runtime state types.
 */

export interface DepartmentFurnitureItem {
  type: string
  count: number
}

export interface Department {
  id: string
  name: string
  nameEn: string
  emoji: string
  order: number
  floorColor: { h: number; s: number; b: number; c: number }
  furniture: DepartmentFurnitureItem[]
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

export interface DepartmentWorkflow {
  phases: PhaseDefinition[]
  taskTypes: TaskTypeDefinition[]
  directories: string[]
  pipeline: import('../task/quality-validator').PipelineStep[]
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

export const DEFAULT_DEPT_STATE: DepartmentLoopState = {
  status: 'stopped',
  pid: null,
  cycleCount: 0,
  lastCycleAt: null,
  lastCycleResult: null,
  history: [],
  tokensUsedToday: 0,
  budgetResetAt: null,
}
