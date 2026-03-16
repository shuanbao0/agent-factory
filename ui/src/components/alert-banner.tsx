'use client'
import { X, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { useTranslation } from '@/lib/i18n'

const severityConfig = {
  error: {
    icon: AlertCircle,
    bg: 'bg-red-500/10 border-red-500/30',
    text: 'text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-yellow-500/10 border-yellow-500/30',
    text: 'text-yellow-400',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-500/10 border-blue-500/30',
    text: 'text-blue-400',
  },
}

function formatAlertMessage(type: string, data: Record<string, unknown>, t: (key: string) => string): string {
  switch (type) {
    case 'cost_exceeded':
      return t('alerts.costExceeded')
        .replace('{cost}', `$${data.totalCost}`)
        .replace('{threshold}', `$${data.threshold}`)
    case 'cycle_slowdown':
      return t('alerts.cycleSlowdown').replace('{dept}', String(data.deptId || ''))
    case 'budget_blocked':
      return t('alerts.budgetBlocked')
        .replace('{dept}', String(data.deptId || ''))
        .replace('{reason}', String(data.reason || ''))
    default:
      return type
  }
}

export function AlertBanner() {
  const alerts = useAppStore(s => s.alerts)
  const dismissAlert = useAppStore(s => s.dismissAlert)
  const { t } = useTranslation()

  if (!alerts || alerts.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {alerts.slice(0, 5).map(alert => {
        const config = severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.info
        const Icon = config.icon
        return (
          <div
            key={alert.id}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${config.bg} ${config.text}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="text-sm flex-1">
              {formatAlertMessage(alert.type, alert.data, t)}
            </span>
            <button
              onClick={() => dismissAlert(alert.id)}
              className="p-1 rounded hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
