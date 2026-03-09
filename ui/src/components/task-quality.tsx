'use client'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Circle } from 'lucide-react'
import type { TaskQuality as TQ } from '@/lib/types'

interface TaskQualityProps {
  quality: TQ
  validationErrors?: string[]
}

export function TaskQuality({ quality, validationErrors }: TaskQualityProps) {
  const { t } = useTranslation()

  const stages = [
    {
      key: 'selfCheck',
      label: t('tasks.selfCheck'),
      data: quality.selfCheck,
    },
    {
      key: 'peerReview',
      label: t('tasks.peerReview'),
      data: quality.peerReview,
    },
    {
      key: 'headApproval',
      label: t('tasks.headApproval'),
      data: quality.headApproval,
    },
  ]

  return (
    <div className="space-y-2">
      {stages.map(stage => {
        const d = stage.data as Record<string, unknown> | undefined
        if (!d) {
          return (
            <div key={stage.key} className="flex items-center gap-2 text-xs text-muted-foreground/50">
              <Circle className="w-3.5 h-3.5" />
              <span>{stage.label}</span>
              <span className="ml-auto">-</span>
            </div>
          )
        }

        const passed = d.passed as boolean
        const score = d.score as number | undefined

        return (
          <div key={stage.key} className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              {passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-400" />
              )}
              <span className={cn(
                passed ? 'text-emerald-400' : 'text-red-400'
              )}>
                {stage.label}
              </span>
              <span className="ml-auto text-muted-foreground">
                {passed ? t('tasks.passed') : t('tasks.failed')}
              </span>
            </div>
            {score !== undefined && (
              <div className="flex items-center gap-2 ml-5">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[120px]">
                  <div
                    className={cn('h-full rounded-full', score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                    style={{ width: `${Math.min(score, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{score}/100</span>
              </div>
            )}
            {typeof d.comments === 'string' && d.comments && (
              <p className="text-[10px] text-muted-foreground/80 ml-5">{d.comments}</p>
            )}
          </div>
        )
      })}
      {validationErrors && validationErrors.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-[10px] font-medium text-red-400 mb-1">{t('tasks.validationErrors')}</p>
          <ul className="text-[10px] text-red-400/80 space-y-0.5">
            {validationErrors.map((e, i) => <li key={i}>- {e}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
