'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAppStore } from '@/lib/store'
import { useTranslation } from '@/lib/i18n'
import { StatCard } from '@/components/stat-card'
import { AgentCard } from '@/components/agent-card'
import { TokenChart } from '@/components/token-chart'
import { AgentTokenChart } from '@/components/agent-token-chart'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PhaseProgress } from '@/components/phase-progress'
import { Users, FolderKanban, Zap, Activity, AlertTriangle, X, RefreshCw } from 'lucide-react'
import { formatNumber } from '@/lib/utils'

export default function DashboardPage() {
  const agents = useAppStore(s => s.agents)
  const projects = useAppStore(s => s.projects)
  const dataSource = useAppStore(s => s.dataSource)
  const realTotalTokens = useAppStore(s => s.totalTokens)
  const totalCost = useAppStore(s => s.totalCost)
  const connected = useAppStore(s => s.connected)
  const fetchAgents = useAppStore(s => s.fetchAgents)
  const fetchLogs = useAppStore(s => s.fetchLogs)
  const fetchUsage = useAppStore(s => s.fetchUsage)
  const { t } = useTranslation()
  const [showBanner, setShowBanner] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([fetchAgents(), fetchLogs(), fetchUsage()])
    } finally {
      setRefreshing(false)
    }
  }, [fetchAgents, fetchLogs, fetchUsage])

  useEffect(() => {
    fetch('/api/gateway/status')
      .then(r => r.json())
      .then(data => {
        if (data.status === 'no-key' || data.status === 'stopped') {
          setShowBanner(true)
        }
      })
      .catch(() => {})
  }, [])

  const totalTokens = useMemo(() => realTotalTokens > 0 ? realTotalTokens : agents.reduce((s, a) => s + a.tokensUsed, 0), [realTotalTokens, agents])
  const onlineAgents = agents.length
  const activeProjects = useMemo(() => projects.filter(p => p.status !== 'completed').length, [projects])
  const runningTasks = useMemo(() => projects.flatMap(p => p.tasks).filter(t => t.status === 'in_progress').length, [projects])

  return (
    <div className="space-y-6">
      {showBanner && !bannerDismissed && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{t('dashboard.noProviderBanner')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="rounded-md bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/30 transition-colors"
            >
              {t('dashboard.goToSettings')}
            </Link>
            <button
              onClick={() => setBannerDismissed(true)}
              className="rounded p-0.5 hover:bg-amber-500/20 transition-colors"
            >
              <X className="h-4 w-4 text-amber-400" />
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleRefreshAll} disabled={refreshing}
            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            title={t('common.refresh')}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <Badge variant="default">{dataSource === 'gateway' ? '🟢 Live' : dataSource === 'loading' ? '⏳ Loading' : '📋 Mock'}</Badge>
          {totalCost > 0 && <Badge variant="muted">${totalCost.toFixed(2)} total</Badge>}
          <Badge variant={connected ? 'success' : 'muted'}>{connected ? t('common.connected') : 'Disconnected'}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('dashboard.activeAgents')} value={`${onlineAgents}/${agents.length}`} icon={Users} trend={{ value: 14, label: t('common.vsYesterday') }} />
        <StatCard title={t('dashboard.activeProjects')} value={activeProjects} subtitle={`${projects.length} ${t('common.total')}`} icon={FolderKanban} />
        <StatCard title={t('dashboard.runningTasks')} value={runningTasks} icon={Activity} trend={{ value: 8, label: t('common.thisWeek') }} />
        <StatCard title={t('dashboard.totalTokens')} value={formatNumber(totalTokens)} subtitle={t('common.thisWeek')} icon={Zap} trend={{ value: -12, label: t('common.vsLastWeek') }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.tokenUsage7d')}</CardTitle>
          </CardHeader>
          <CardContent>
            <TokenChart />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.usageByAgent')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AgentTokenChart />
          </CardContent>
        </Card>
      </div>

      {/* Agent Status */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('dashboard.agentStatus')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.slice(0, 6).map(a => <AgentCard key={a.id} agent={a} />)}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('dashboard.activeProjectsList')}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projects.filter(p => p.status !== 'completed').map(p => (
            <Card key={p.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  <Badge variant={p.status === 'in-progress' ? 'success' : 'muted'}>{p.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{p.description}</p>
                <PhaseProgress current={p.currentPhase} total={p.totalPhases} />
                <div className="text-xs text-muted-foreground">
                  {formatNumber(p.tokensUsed)} {t('common.tokens')} · {p.tasks.length} {t('common.tasks')}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
