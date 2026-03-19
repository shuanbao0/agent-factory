'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n'
import { logError } from '@/lib/error-logger'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Save, Loader2, CheckCircle2 } from 'lucide-react'

interface BudgetConfig {
  company: {
    dailyTokenLimit: number
    monthlyTokenLimit: number
    alertThreshold: number
  }
  agentDailyLimit: number
  overBudgetAction: string
}

export function BudgetSettings() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<BudgetConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/budget')
      if (res.ok) setConfig(await res.json())
    } catch (err) { logError('budget/load', err) }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (err) { logError('budget/save', err) }
    setSaving(false)
  }

  if (!config) return null

  const update = (path: string, value: number | string) => {
    setConfig(prev => {
      if (!prev) return prev
      const next = { ...prev }
      if (path.startsWith('company.')) {
        const key = path.replace('company.', '') as keyof BudgetConfig['company']
        next.company = { ...next.company, [key]: value }
      } else {
        (next as Record<string, unknown>)[path] = value
      }
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.budget.title')}</CardTitle>
        <CardDescription>{t('settings.budget.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Company Limits */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">{t('settings.budget.companyLimits')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('settings.budget.dailyTokenLimit')}</label>
              <input
                type="number"
                value={config.company.dailyTokenLimit}
                onChange={e => update('company.dailyTokenLimit', Number(e.target.value))}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('settings.budget.monthlyTokenLimit')}</label>
              <input
                type="number"
                value={config.company.monthlyTokenLimit}
                onChange={e => update('company.monthlyTokenLimit', Number(e.target.value))}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>

        {/* Alert Threshold */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('settings.budget.alertThreshold')}</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(config.company.alertThreshold * 100)}
              onChange={e => update('company.alertThreshold', Number(e.target.value) / 100)}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-12 text-right">
              {Math.round(config.company.alertThreshold * 100)}%
            </span>
          </div>
        </div>

        {/* Agent Daily Limit */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('settings.budget.agentDailyLimit')}</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              step="0.5"
              value={config.agentDailyLimit}
              onChange={e => update('agentDailyLimit', Number(e.target.value))}
              className="w-32 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Over-budget Action */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('settings.budget.overBudgetAction')}</label>
          <select
            value={config.overBudgetAction}
            onChange={e => update('overBudgetAction', e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="pause_and_notify">{t('settings.budget.actionPauseNotify')}</option>
            <option value="notify_only">{t('settings.budget.actionNotifyOnly')}</option>
            <option value="hard_stop">{t('settings.budget.actionHardStop')}</option>
          </select>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? t('common.saving') : saved ? t('settings.budget.saved') : t('common.save')}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
