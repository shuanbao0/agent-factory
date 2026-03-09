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

export default function AutopilotPage() {
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

  if (!state) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('autopilot.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('autopilot.subtitle')}</p>
        </div>
        <div className="text-muted-foreground text-sm">{t('autopilot.loading')}</div>
      </div>
    )
  }

  const statusConfig = getStatusConfig(t)
  const sc = statusConfig[state.status] || statusConfig.stopped

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: t('autopilot.tabOverview'), icon: <Rocket className="w-4 h-4" /> },
    { id: 'departments', label: t('autopilot.tabDepartments'), icon: <Building2 className="w-4 h-4" /> },
    { id: 'budget', label: t('autopilot.tabBudget'), icon: <Wallet className="w-4 h-4" /> },
    { id: 'mission', label: t('autopilot.tabMission'), icon: <FileText className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {t('autopilot.title')}
            {state.mode === 'all' && (
              <Badge className="bg-purple-400/10 text-purple-400 border-purple-400/20 text-xs">{t('autopilot.startAll')}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('autopilot.subtitle')}</p>
        </div>
        <Badge className={`text-sm ${sc.color}`}>{sc.label}</Badge>
      </div>

      {/* Error display */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewPanel
          state={state}
          loading={loading}
          countdown={countdown}
          sendAction={sendAction}
        />
      )}
      {activeTab === 'departments' && (
        <DepartmentsPanel
          departments={depts}
          sendAction={sendAction}
          loading={loading}
          onRefresh={() => { fetchAutopilot(); fetchAutopilotDepts() }}
        />
      )}
      {activeTab === 'budget' && (
        <BudgetDashboard />
      )}
      {activeTab === 'mission' && (
        <MissionEditor />
      )}
    </div>
  )
}

function OverviewPanel({ state, loading, countdown, sendAction }: {
  state: AutopilotState
  loading: boolean
  countdown: string
  sendAction: (action: string, extra?: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Controls + Stats */}
      <div className="lg:col-span-1 space-y-4">
        {/* Controls */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('autopilot.controls')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {state.status === 'running' ? (
                <button
                  onClick={() => sendAction('stop')}
                  disabled={loading}
                  title={t('autopilot.stopTip')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <Square className="w-4 h-4" /> {t('autopilot.stop')}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => sendAction('start', { interval: 1800 })}
                    disabled={loading}
                    title={t('autopilot.startLoopTip')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" /> {t('autopilot.startLoop')}
                  </button>
                  <button
                    onClick={() => sendAction('start-all')}
                    disabled={loading}
                    title={t('autopilot.startAllTip')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-md text-sm font-medium hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                  >
                    <Building2 className="w-4 h-4" /> {t('autopilot.startAll')}
                  </button>
                </>
              )}
              <button
                onClick={() => sendAction('cycle')}
                disabled={loading || state.status === 'cycling'}
                title={t('autopilot.runCycleTip')}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-sm font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                <RotateCw className={`w-4 h-4 ${state.status === 'cycling' ? 'animate-spin' : ''}`} /> {t('autopilot.runCycle')}
              </button>
            </div>

            {/* Next cycle countdown */}
            {state.status === 'running' && countdown && (
              <div className="flex items-center justify-between bg-primary/5 border border-primary/10 rounded-lg px-4 py-3">
                <span className="text-sm text-muted-foreground">{t('autopilot.nextCycle')}</span>
                <span className="text-lg font-mono font-bold text-primary">{countdown}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('autopilot.stats')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-2xl font-bold">{state.cycleCount}</div>
                <div className="text-xs text-muted-foreground">{t('autopilot.cycles')}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-2xl font-bold flex items-center justify-center gap-1">
                  <Clock className="w-4 h-4" />
                  {state.intervalSeconds >= 3600
                    ? `${(state.intervalSeconds / 3600).toFixed(0)}h`
                    : `${(state.intervalSeconds / 60).toFixed(0)}m`}
                </div>
                <div className="text-xs text-muted-foreground">{t('autopilot.interval')}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-2xl font-bold flex items-center justify-center gap-1">
                  <Zap className="w-4 h-4" />
                  {state.recentHistory.reduce((s, h) => s + h.tokens, 0) > 1000
                    ? `${(state.recentHistory.reduce((s, h) => s + h.tokens, 0) / 1000).toFixed(0)}k`
                    : state.recentHistory.reduce((s, h) => s + h.tokens, 0)}
                </div>
                <div className="text-xs text-muted-foreground">{t('autopilot.tokens')}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: Last result + History */}
      <div className="lg:col-span-2 space-y-4">
        {/* Last cycle result */}
        {state.lastCycleResult && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t('autopilot.lastCycle')} <span className="text-xs font-normal text-muted-foreground ml-1">CEO</span></CardTitle>
                {state.lastCycleAt && (
                  <span className="text-xs text-muted-foreground">{timeAgo(state.lastCycleAt)}</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{state.lastCycleResult}</p>
            </CardContent>
          </Card>
        )}

        {/* Recent history */}
        {state.recentHistory.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('autopilot.history')} <span className="text-xs font-normal text-muted-foreground ml-1">CEO</span></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {state.recentHistory.slice(-10).reverse().map(h => (
                  <div key={h.cycle} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground font-mono w-8">#{h.cycle}</span>
                    {h.cycleType && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-muted/50">{h.cycleType}</Badge>
                    )}
                    <span className="text-muted-foreground text-xs">{h.elapsedSec}s</span>
                    <span className="text-muted-foreground text-xs">{h.tokens > 0 ? `${(h.tokens / 1000).toFixed(1)}k` : '-'}</span>
                    <span className="flex-1 truncate text-xs">{h.result}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function DepartmentsPanel({ departments, sendAction, loading, onRefresh }: {
  departments: AutopilotState['departments']
  sendAction: (action: string, extra?: Record<string, unknown>) => void
  loading: boolean
  onRefresh: () => void
}) {
  const { t } = useTranslation()

  if (!departments || departments.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>{t('autopilot.dept.noDepartments')}</p>
        <p className="mt-1 text-xs">{t('autopilot.dept.noDepartmentsHint')}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
