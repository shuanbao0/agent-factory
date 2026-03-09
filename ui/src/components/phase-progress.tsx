'use client'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import type { PhaseDefinition } from '@/lib/types'

const phaseKeys = ['phases.research', 'phases.design', 'phases.develop', 'phases.test', 'phases.deploy']

export function PhaseProgress({ current, total, phases }: { current: number; total: number; phases?: PhaseDefinition[] }) {
  const { t, locale } = useTranslation()
  const count = phases ? phases.length : total
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: count }, (_, i) => {
        const phase = i + 1
        const done = phase < current
        const active = phase === current
        const label = phases
          ? (locale === 'zh' ? phases[i].labelZh : phases[i].labelEn)
          : (phaseKeys[i] ? t(phaseKeys[i]) : `P${phase}`)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className={cn(
              'w-full h-2 rounded-full transition-colors',
              done ? 'bg-emerald-500' : active ? 'bg-primary animate-pulse' : 'bg-muted'
            )} />
            <span className={cn(
              'text-[10px]',
              done ? 'text-emerald-400' : active ? 'text-primary' : 'text-muted-foreground'
            )}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
