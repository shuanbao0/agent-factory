'use client'
import { useAppStore } from '@/lib/store'
import { useTranslation } from '@/lib/i18n'
import { LogList } from '@/components/log-list'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollText, Filter, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { LogEntry } from '@/lib/types'

export default function LogsPage() {
  const logs = useAppStore(s => s.logs)
  const agents = useAppStore(s => s.agents)
  const fetchLogs = useAppStore(s => s.fetchLogs)
  const { t } = useTranslation()
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [agentFilter, setAgentFilter] = useState<string>('all')

  const levels = ['all', 'info', 'warn', 'error', 'debug']

  const filtered = logs.filter(l => {
    if (levelFilter !== 'all' && l.level !== levelFilter) return false
    if (agentFilter !== 'all' && l.agent !== agentFilter) return false
    return true
  })

  const errorCount = logs.filter(l => l.level === 'error').length
  const warnCount = logs.filter(l => l.level === 'warn').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="w-6 h-6" /> {t('logs.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('logs.subtitle')}</p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => fetchLogs()}
            className="p-2 text-muted-foreground hover:text-foreground"
            title={t('common.refresh')}>
            <RefreshCw className="w-4 h-4" />
          </button>
          <Badge variant="danger">{errorCount} {t('common.errors')}</Badge>
          <Badge variant="warning">{warnCount} {t('common.warnings')}</Badge>
          <Badge variant="muted">{logs.length} {t('common.total')}</Badge>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">{t('logs.level')}:</span>
          {levels.map(l => (
            <button key={l} onClick={() => setLevelFilter(l)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                levelFilter === l ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('logs.agent')}:</span>
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="bg-muted border border-border rounded px-2 py-1 text-xs text-foreground"
          >
            <option value="all">{t('common.allAgents')}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.role}</option>)}
          </select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('logs.agentTimeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {agents.map(a => {
              const agentLogs = logs.filter(l => l.agent === a.id).length
              return (
                <div key={a.id} className="flex flex-col items-center gap-1 min-w-[60px]">
                  <div className="text-lg">{
                    ({ pm: '📋', product: '📦', designer: '🎨', frontend: '💻', backend: '⚙️', tester: '🧪', researcher: '🔬', ceo: '👔', marketing: '📣', analyst: '📊', writer: '✍️' } as Record<string, string>)[a.role] || '🤖'
                  }</div>
                  <span className="text-[10px] text-muted-foreground">{a.role}</span>
                  <div className="w-full bg-muted rounded-full h-8 relative overflow-hidden">
                    <div className="bg-primary/30 h-full rounded-full" style={{ width: `${Math.min(100, agentLogs * 10)}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">{agentLogs}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('logs.logStream')} ({filtered.length} {t('logs.entries')})</CardTitle>
        </CardHeader>
        <CardContent>
          <LogList logs={filtered} maxItems={50} />
        </CardContent>
      </Card>
    </div>
  )
}
