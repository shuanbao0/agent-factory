'use client'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Save, FileText, Check, AlertCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

interface MissionCardProps {
  viewKey: string
  actionKey: string
  titleKey: string
  descKey: string
  filePath: string
  placeholder?: string
}

function MissionCard({ viewKey, actionKey, titleKey, descKey, filePath, placeholder }: MissionCardProps) {
  const { t } = useTranslation()
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  const fetchContent = useCallback(async () => {
    try {
      const res = await fetch(`/api/autopilot?view=${viewKey}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setContent(data.content || '')
      setOriginal(data.content || '')
    } catch {
      setError(t(`autopilot.${viewKey === 'base-mission' ? 'baseMission' : 'mission'}.loadFailed`))
    }
  }, [t, viewKey])

  useEffect(() => {
    fetchContent()
  }, [fetchContent])

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    setError('')
    try {
      const res = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionKey, content }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || t('autopilot.error.actionFailed'))
        setSaveStatus('error')
        return
      }
      setOriginal(content)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (e) {
      setError(String(e))
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const isDirty = content !== original
  const saveKey = viewKey === 'base-mission' ? 'autopilot.baseMission.save' : 'autopilot.mission.save'
  const savingKey = viewKey === 'base-mission' ? 'autopilot.baseMission.saving' : 'autopilot.mission.saving'
  const savedKey = viewKey === 'base-mission' ? 'autopilot.baseMission.saved' : 'autopilot.mission.saved'

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {t(titleKey)}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t(descKey)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Check className="w-3 h-3" /> {t(savedKey)}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-md text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <Save className="w-3 h-3" />
              {saving ? t(savingKey) : t(saveKey)}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-1.5 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2 mb-3">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
        <div className="relative">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => {
              if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (isDirty) handleSave()
              }
            }}
            className="w-full bg-background border border-muted rounded-lg px-4 py-3 text-sm font-mono leading-relaxed resize-vertical min-h-[400px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30"
            placeholder={placeholder || '# Mission\n\n...'}
            spellCheck={false}
          />
          {isDirty && (
            <div className="absolute top-2 right-2">
              <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-1.5 py-0.5">
                unsaved
              </span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          {filePath} · Cmd+S {t(saveKey).toLowerCase()}
        </p>
      </CardContent>
    </Card>
  )
}

export function MissionEditor() {
  return (
    <div className="space-y-4">
      <MissionCard
        viewKey="mission"
        actionKey="set-mission"
        titleKey="autopilot.mission.title"
        descKey="autopilot.mission.desc"
        filePath="config/mission.md"
        placeholder="# Company Mission&#10;&#10;..."
      />
      <MissionCard
        viewKey="base-mission"
        actionKey="set-base-mission"
        titleKey="autopilot.baseMission.title"
        descKey="autopilot.baseMission.desc"
        filePath="config/base-mission.md"
        placeholder="# Base Department Guidelines&#10;&#10;..."
      />
    </div>
  )
}
