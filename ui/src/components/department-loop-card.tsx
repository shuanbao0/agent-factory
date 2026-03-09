'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogHeader, DialogContent } from '@/components/ui/dialog'
import { Play, Square, RotateCw, Send, FileText, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { getDeptStatusConfig } from '@/lib/autopilot-shared'
import type { DeptInfo } from '@/lib/autopilot-shared'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function DepartmentLoopCard({ dept, sendAction, loading, onRefresh }: {
  dept: DeptInfo
  sendAction: (action: string, extra?: Record<string, unknown>) => void
  loading: boolean
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const [modalOpen, setModalOpen] = useState(false)
  const [directiveText, setDirectiveText] = useState('')
  const [missionText, setMissionText] = useState(dept.mission || '')
  const [saving, setSaving] = useState(false)
  const [missionSaving, setMissionSaving] = useState(false)
  const [missionSaved, setMissionSaved] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [error, setError] = useState('')

  const deptStatusConfig = getDeptStatusConfig(t)
  const sc = deptStatusConfig[dept.state.status] || deptStatusConfig.stopped
  const isRunning = dept.state.status === 'running' || dept.state.status === 'cycling'
  const hasDirectives = dept.directives && dept.directives.length > 0
  const headMissing = dept.headExists === false

  const saveDirectives = async () => {
    if (!directiveText.trim()) return
    setSaving(true)
    setError('')
    try {
      const lines = directiveText.split('\n').map(l => l.trim()).filter(Boolean)
      const existing = dept.directives || []
      const res = await fetch('/api/autopilot/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId: dept.id, directives: [...existing, ...lines] }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || t('autopilot.error.actionFailed'))
        return
      }
      setDirectiveText('')
      onRefresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const clearDirectives = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/autopilot/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId: dept.id, directives: [] }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || t('autopilot.error.actionFailed'))
        return
      }
      onRefresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const saveMission = async () => {
    setMissionSaving(true)
    setError('')
    try {
      const res = await fetch('/api/autopilot/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId: dept.id, mission: missionText }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || t('autopilot.error.actionFailed'))
        return
      }
      setMissionSaved(true)
      setTimeout(() => setMissionSaved(false), 2000)
      onRefresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setMissionSaving(false)
    }
  }

  const tokens = dept.state.tokensUsedToday || 0
  const tokensLabel = tokens > 1000 ? `${(tokens / 1000).toFixed(0)}k` : String(tokens)

  return (
    <>
      <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-muted/50">
        {/* Row 1: Emoji + Name + warnings/badges + status — click title to open modal */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity cursor-pointer"
          >
            <span className="text-sm shrink-0">{dept.emoji || '🏢'}</span>
            <span className="text-sm font-semibold truncate">{dept.name || dept.id}</span>
            {headMissing && (
              <span title={t('autopilot.dept.headMissing').replace('{head}', dept.head || '—')}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </span>
            )}
            {hasDirectives && (
              <span className="text-[10px] text-amber-400 shrink-0">{dept.directives!.length}D</span>
            )}
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge className={`text-[10px] px-1.5 py-0 ${sc.color}`}>{sc.label}</Badge>
          </div>
        </div>

        {/* Row 2: Compact inline stats */}
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span>{dept.state.cycleCount} {t('autopilot.dept.cycles')}</span>
          <span className="opacity-40">|</span>
          <span>{Math.round(dept.interval / 60)}m</span>
          <span className="opacity-40">|</span>
          <span>{tokensLabel} tok</span>
          <span className="opacity-40">|</span>
          <span>{dept.state.lastCycleAt ? timeAgo(dept.state.lastCycleAt) : '—'}</span>
        </div>

        {/* Row 3: Icon-only buttons */}
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <button
              onClick={() => sendAction('stop-dept', { deptId: dept.id })}
              disabled={loading}
              title={t('autopilot.dept.stopTip')}
              className="p-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => sendAction('start-dept', { deptId: dept.id, interval: dept.interval })}
              disabled={loading || headMissing}
              title={headMissing ? t('autopilot.dept.headMissing').replace('{head}', dept.head || '—') : t('autopilot.dept.startTip').replace('{head}', dept.head || dept.id)}
              className="p-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => sendAction('dept-cycle', { deptId: dept.id })}
            disabled={loading || dept.state.status === 'cycling' || headMissing}
            title={headMissing ? t('autopilot.dept.headMissing').replace('{head}', dept.head || '—') : t('autopilot.dept.cycleTip').replace('{head}', dept.head || dept.id)}
            className="p-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded hover:bg-blue-500/20 transition-colors disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${dept.state.status === 'cycling' ? 'animate-spin' : ''}`} />
          </button>
          {dept.report && (
            <button
              onClick={() => { setShowReport(true); setModalOpen(true) }}
              title={t('autopilot.dept.reportTip')}
              className="p-1.5 bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent rounded transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={modalOpen} onClose={() => { setModalOpen(false); setShowReport(false) }}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="text-base">{dept.emoji || '🏢'}</span>
            <span className="text-sm font-semibold">{dept.name || dept.id}</span>
            <Badge className={`text-[10px] px-1.5 py-0 ${sc.color}`}>{sc.label}</Badge>
          </div>
        </DialogHeader>
        <DialogContent>
          {/* Error */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1">
              {error}
            </div>
          )}

          {/* Head info */}
          <div className="text-xs text-muted-foreground">
            {t('autopilot.dept.head')}: {dept.head || '—'}
          </div>

          {/* Head missing warning */}
          {headMissing && (
            <div className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded px-2.5 py-1.5">
              {t('autopilot.dept.headMissing').replace('{head}', dept.head || '—')}
            </div>
          )}

          {/* Last cycle result */}
          {dept.state.lastCycleResult && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-medium">{t('autopilot.dept.lastRun')}</span>
              <p className="text-xs text-muted-foreground leading-relaxed">{dept.state.lastCycleResult}</p>
            </div>
          )}

          {/* Report */}
          {dept.report && (
            <div className="space-y-1">
              <button
                onClick={() => setShowReport(!showReport)}
                className="text-xs text-muted-foreground font-medium hover:text-foreground transition-colors flex items-center gap-1"
              >
                <FileText className="w-3 h-3" />
                {t('autopilot.dept.reportTip')}
              </button>
              {showReport && (
                <div className="bg-muted/50 rounded-md p-3 text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border border-muted">
                  {dept.report}
                </div>
              )}
            </div>
          )}

          {/* Department Mission */}
          <div className="space-y-2 bg-muted/30 rounded-md p-3 border border-muted/50">
            <span className="text-xs font-medium text-foreground">{t('autopilot.dept.mission')}</span>
            <textarea
              value={missionText}
              onChange={e => setMissionText(e.target.value)}
              placeholder={t('autopilot.dept.missionPlaceholder')}
              className="w-full bg-background border border-muted rounded px-3 py-2.5 text-sm leading-relaxed resize-vertical placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30 min-h-[80px] max-h-[200px]"
              rows={4}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveMission}
                disabled={missionSaving}
                className="px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {missionSaving ? t('common.saving') : t('common.save')}
              </button>
              {missionSaved && (
                <span className="text-xs text-emerald-400">{t('autopilot.dept.missionSaved')}</span>
              )}
            </div>
          </div>

          {/* CEO Directives */}
          <div className="space-y-2 bg-muted/30 rounded-md p-3 border border-muted/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">{t('autopilot.dept.ceoDirectives')}</span>
              {hasDirectives && (
                <button
                  onClick={clearDirectives}
                  disabled={saving}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {t('autopilot.dept.clearAll')}
                </button>
              )}
            </div>

            {hasDirectives && (
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {dept.directives!.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/10 rounded px-3 py-2">
                    <span className="text-amber-400 text-xs mt-0.5 shrink-0 font-mono">#{i + 1}</span>
                    <span className="text-sm leading-relaxed break-words whitespace-pre-wrap">{d}</span>
                  </div>
                ))}
              </div>
            )}

            {/* New directive input */}
            <div className="flex gap-1.5">
              <textarea
                value={directiveText}
                onChange={e => setDirectiveText(e.target.value)}
                placeholder={t('autopilot.dept.directivePlaceholder')}
                className="flex-1 bg-background border border-muted rounded px-3 py-2.5 text-sm leading-relaxed resize-vertical placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30 min-h-[48px] max-h-[120px]"
                rows={2}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    saveDirectives()
                  }
                }}
              />
              <button
                onClick={saveDirectives}
                disabled={saving || !directiveText.trim()}
                className="self-end flex items-center gap-1 px-3 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-xs font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('autopilot.dept.directiveHint')}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
