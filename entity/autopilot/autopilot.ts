/**
 * Autopilot entity — state types and defaults.
 */

export const DEFAULT_INTERVAL_SEC = 1800

export const DEFAULT_AUTOPILOT_STATE = {
  status: 'stopped' as const,
  pid: null as number | null,
  cycleCount: 0,
  lastCycleAt: null as string | null,
  lastCycleResult: null as string | null,
  intervalSeconds: DEFAULT_INTERVAL_SEC,
  history: [] as Array<{
    cycle: number
    startedAt: string
    completedAt: string
    elapsedSec: number
    result: string
    tokens: number
    cycleType?: string
  }>,
}

export interface AutopilotState {
  status: 'running' | 'stopped' | 'cycling' | 'error'
  pid: number | null
  cycleCount: number
  lastCycleAt: string | null
  lastCycleResult: string | null
  intervalSeconds: number
  missionSummary?: string
  mode?: 'all' | null
  departments?: DeptInfo[]
  history: Array<{
    cycle: number
    startedAt: string
    completedAt: string
    elapsedSec: number
    result: string
    tokens: number
    cycleType?: string
  }>
  recentHistory?: Array<{
    cycle: number
    startedAt: string
    completedAt: string
    elapsedSec: number
    result: string
    tokens: number
    cycleType?: string
  }>
}

export interface DeptInfo {
  id: string
  name: string
  emoji?: string
  head: string
  enabled: boolean
  interval: number
  directives?: string[]
  mission?: string
  standards?: string
  report?: string
  headExists?: boolean
  state: {
    status: string
    cycleCount: number
    lastCycleAt?: string
    lastCycleResult?: string
    tokensUsedToday?: number
    pid?: number | null
    [key: string]: unknown
  }
}
