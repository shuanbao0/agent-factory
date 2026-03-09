'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Play, Square, RotateCw, Rocket, Clock, Zap, Building2, Wallet, FileText } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { DepartmentLoopCard } from '@/components/department-loop-card'
import { BudgetDashboard } from '@/components/budget-dashboard'
import { MissionEditor } from '@/components/mission-editor'
import { getStatusConfig, useCountdown } from '@/lib/autopilot-shared'
import type { AutopilotState, TabId } from '@/lib/autopilot-shared'

export function AutopilotCard() {
  const { t } = useTranslation()
  const state = useAppStore(s => s.autopilotState)
  const depts = useAppStore(s => s.autopilotDepts)
  const loading = useAppStore(s => s.autopilotLoading)
  const error = useAppStore(s => s.autopilotError)
  const sendAutopilotAction = useAppStore(s => s.sendAutopilotAction)
  const fetchAutopilot = useAppStore(s => s.fetchAutopilot)
  const fetchAutopilotDepts = useAppStore(s => s.fetchAutopilotDepts)
  const countdown = useCountdown(state)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const sendAction = async (action: string, extra?: Record<string, unknown>) => {
    await sendAutopilotAction(action, extra)
  }

  if (!state) return null

  const statusConfig = getStatusConfig(t)
  const sc = statusConfig[state.status] || statusConfig.stopped

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: t('autopilot.tabOverview'), icon: <Rocket className="w-3 h-3" /> },
    { id: 'departments', label: t('autopilot.tabDepartments'), icon: <Building2 className="w-3 h-3" /> },
    { id: 'budget', label: t('autopilot.tabBudget'), icon: <Wallet className="w-3 h-3" /> },
    { id: 'mission', label: t('autopilot.tabMission'), icon: <FileText className="w-3 h-3" /> },
  ]

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="w-4 h-4" /> {t('autopilot.title')}
            {state.mode === 'all' && (
              <Badge className="bg-purple-400/10 text-purple-400 border-purple-400/20 text-[10px]">{t('autopilot.startAll')}</Badge>
            )}
          </CardTitle>
          <Badge className={sc.color}>{sc.label}</Badge>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        {activeTab === 'overview' && (
          <OverviewTab
            state={state}
            loading={loading}
            countdown={countdown}
            sendAction={sendAction}
            t={t}
          />
        )}
        {activeTab === 'departments' && (
          <DepartmentsTab
            departments={depts}
            sendAction={sendAction}
            loading={loading}
            onRefresh={() => { fetchAutopilot(); fetchAutopilotDepts() }}
            t={t}
          />
        )}
        {activeTab === 'budget' && (
          <BudgetDashboard />
        )}
        {activeTab === 'mission' && (
          <MissionEditor />
        )}
      </CardContent>
    </Card>
  )
}

function OverviewTab({ state, loading, countdown, sendAction, t }: {
  state: AutopilotState
  loading: boolean
  countdown: string
  sendAction: (action: string, extra?: Record<string, unknown>) => void
  t: (key: string) => string
}) {
  return (
    <>
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {state.status === 'running' ? (
          <button
            onClick={() => sendAction('stop')}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <Square className="w-3 h-3" /> {t('autopilot.stop')}
          </button>
        ) : (
          <>
            <button
              onClick={() => sendAction('start', { interval: 1800 })}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              <Play className="w-3 h-3" /> {t('autopilot.startLoop')}
            </button>
            <button
              onClick={() => sendAction('start-all')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-md text-xs font-medium hover:bg-purple-500/20 transition-colors disabled:opacity-50"
            >
              <Building2 className="w-3 h-3" /> {t('autopilot.startAll')}
            </button>
          </>
        )}
        <button
          onClick={() => sendAction('cycle')}
          disabled={loading || state.status === 'cycling'}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-xs font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        >
          <RotateCw className={`w-3 h-3 ${state.status === 'cycling' ? 'animate-spin' : ''}`} /> {t('autopilot.runCycle')}
        </button>
      </div>

      {/* Next cycle countdown */}
      {state.status === 'running' && countdown && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
          <span className="text-xs text-muted-foreground">{t('autopilot.nextCycle')}</span>
          <span className="text-sm font-mono font-bold text-primary">{countdown}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-lg font-bold">{state.cycleCount}</div>
          <div className="text-[10px] text-muted-foreground">{t('autopilot.cycles')}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-lg font-bold flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" />
            {state.intervalSeconds >= 3600
              ? `${(state.intervalSeconds / 3600).toFixed(0)}h`
              : `${(state.intervalSeconds / 60).toFixed(0)}m`}
          </div>
          <div className="text-[10px] text-muted-foreground">{t('autopilot.interval')}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-lg font-bold flex items-center justify-center gap-1">
            <Zap className="w-3 h-3" />
            {state.recentHistory.reduce((s, h) => s + h.tokens, 0) > 1000
              ? `${(state.recentHistory.reduce((s, h) => s + h.tokens, 0) / 1000).toFixed(0)}k`
              : state.recentHistory.reduce((s, h) => s + h.tokens, 0)}
          </div>
          <div className="text-[10px] text-muted-foreground">{t('autopilot.tokens')}</div>
        </div>
      </div>

      {/* Last cycle result */}
      {state.lastCycleResult && (
        <div className="bg-muted/30 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-medium">{t('autopilot.lastCycle')}</span>
            {state.lastCycleAt && (
              <span className="text-[10px] text-muted-foreground">{timeAgo(state.lastCycleAt)}</span>
            )}
          </div>
          <p className="text-xs leading-relaxed line-clamp-4">{state.lastCycleResult}</p>
        </div>
      )}

      {/* Recent history */}
      {state.recentHistory.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] text-muted-foreground font-medium">{t('autopilot.history')}</span>
          {state.recentHistory.slice(-5).reverse().map(h => (
            <div key={h.cycle} className="flex items-center gap-2 text-[10px]">
              <span className="text-muted-foreground font-mono w-6">#{h.cycle}</span>
              {h.cycleType && (
                <Badge className="text-[8px] px-1 py-0 bg-muted/50">{h.cycleType}</Badge>
              )}
              <span className="text-muted-foreground">{h.elapsedSec}s</span>
              <span className="text-muted-foreground">{h.tokens > 0 ? `${(h.tokens/1000).toFixed(1)}k` : '-'}</span>
              <span className="flex-1 truncate">{h.result}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function DepartmentsTab({ departments, sendAction, loading, onRefresh, t }: {
  departments: AutopilotState['departments']
  sendAction: (action: string, extra?: Record<string, unknown>) => void
  loading: boolean
  onRefresh: () => void
  t: (key: string) => string
}) {
  if (!departments || departments.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-xs py-6">
        <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>{t('autopilot.dept.noDepartments')}</p>
        <p className="mt-1">{t('autopilot.dept.noDepartmentsHint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {departments.map(dept => (
        <DepartmentLoopCard
          key={dept.id}
          dept={dept}
          sendAction={sendAction}
          loading={loading}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  )
}
