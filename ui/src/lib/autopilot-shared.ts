import { useState, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Interfaces & Types
// ---------------------------------------------------------------------------

export interface DeptInfo {
  id: string
  name: string
  emoji?: string
  head: string
  enabled: boolean
  interval: number
  directives?: string[]
  mission?: string
  report?: string
  headExists?: boolean
  state: {
    status: string
    cycleCount: number
    lastCycleAt?: string
    lastCycleResult?: string
    tokensUsedToday?: number
  }
}

export interface AutopilotState {
  status: 'running' | 'stopped' | 'cycling' | 'error'
  pid: number | null
  cycleCount: number
  lastCycleAt: string | null
  lastCycleResult: string | null
  intervalSeconds: number
  missionSummary: string
  mode?: 'all' | null
  departments?: DeptInfo[]
  recentHistory: Array<{
    cycle: number
    startedAt: string
    completedAt: string
    elapsedSec: number
    result: string
    tokens: number
    cycleType?: string
  }>
}

export type TabId = 'overview' | 'departments' | 'budget' | 'mission'

// ---------------------------------------------------------------------------
// Status config helpers
// ---------------------------------------------------------------------------

export function getStatusConfig(t: (key: string) => string): Record<string, { label: string; color: string }> {
  return {
    running: { label: `🟢 ${t('autopilot.status.running')}`, color: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' },
    stopped: { label: `⏹ ${t('autopilot.status.stopped')}`, color: 'bg-gray-400/10 text-gray-400 border-gray-400/20' },
    cycling: { label: `🔄 ${t('autopilot.status.cycling')}`, color: 'bg-blue-400/10 text-blue-400 border-blue-400/20' },
    error: { label: `❌ ${t('autopilot.status.error')}`, color: 'bg-red-400/10 text-red-400 border-red-400/20' },
  }
}

export function getDeptStatusConfig(t: (key: string) => string): Record<string, { label: string; color: string }> {
  return {
    running: { label: t('autopilot.dept.running'), color: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' },
    idle: { label: t('autopilot.dept.idle'), color: 'bg-blue-400/10 text-blue-400 border-blue-400/20' },
    stopped: { label: t('autopilot.dept.stopped'), color: 'bg-gray-400/10 text-gray-400 border-gray-400/20' },
    cycling: { label: t('autopilot.dept.cycling'), color: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
    error: { label: t('autopilot.dept.error'), color: 'bg-red-400/10 text-red-400 border-red-400/20' },
  }
}

// ---------------------------------------------------------------------------
// Countdown hook
// ---------------------------------------------------------------------------

export function useCountdown(state: AutopilotState | null): string {
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    if (!state || state.status !== 'running' || !state.lastCycleAt) {
      setCountdown('')
      return
    }
    const update = () => {
      const nextAt = new Date(state.lastCycleAt!).getTime() + state.intervalSeconds * 1000
      const remaining = Math.max(0, nextAt - Date.now())
      if (remaining <= 0) {
        setCountdown('soon...')
        return
      }
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [state?.status, state?.lastCycleAt, state?.intervalSeconds])

  return countdown
}
