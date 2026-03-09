'use client'
import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import type { PipelineStep, TaskTypeDefinition } from '@/lib/types'

interface TaskPipelineProps {
  taskType: string
  projectId: string
  department?: string
}

interface WorkflowData {
  pipeline: PipelineStep[]
  taskTypes: TaskTypeDefinition[]
}

const DEFAULT_PIPELINE: PipelineStep[] = [
  { from: 'coding', to: 'review' },
  { from: 'review', to: 'testing' },
]

export function TaskPipeline({ taskType, projectId, department }: TaskPipelineProps) {
  const { t, locale } = useTranslation()
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null)

  useEffect(() => {
    if (!department) {
      setWorkflow({ pipeline: DEFAULT_PIPELINE, taskTypes: [] })
      return
    }
    fetch(`/api/departments/${department}/workflow`)
      .then(r => r.json())
      .then(data => {
        if (data.workflow) {
          setWorkflow({ pipeline: data.workflow.pipeline || [], taskTypes: data.workflow.taskTypes || [] })
        }
      })
      .catch(() => setWorkflow({ pipeline: DEFAULT_PIPELINE, taskTypes: [] }))
  }, [department])

  if (!workflow) return null

  // Build chain: find all steps involving this type
  const chain: string[] = []
  // Find the start of the chain
  const allFroms = new Set(workflow.pipeline.map(p => p.from))
  const allTos = new Set(workflow.pipeline.map(p => p.to))

  // Find steps connected to current type
  let current = taskType
  // Walk backwards to find start
  const backwards: string[] = [current]
  let prev = workflow.pipeline.find(p => p.to === current)
  while (prev) {
    backwards.unshift(prev.from)
    prev = workflow.pipeline.find(p => p.to === prev!.from)
  }
  // Walk forward from last
  let last = backwards[backwards.length - 1]
  let next = workflow.pipeline.find(p => p.from === last)
  while (next && !backwards.includes(next.to)) {
    backwards.push(next.to)
    next = workflow.pipeline.find(p => p.from === next!.to)
  }

  // Only show if this type is in the chain
  if (!backwards.includes(taskType)) return null
  if (backwards.length <= 1) return null

  const getLabel = (value: string) => {
    const tt = workflow.taskTypes.find(t => t.value === value)
    if (tt) return locale === 'zh' ? tt.labelZh : tt.labelEn
    return value
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {backwards.map((step, i) => (
        <div key={step} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded',
            step === taskType
              ? 'bg-primary/20 text-primary font-semibold'
              : 'bg-muted text-muted-foreground'
          )}>
            {getLabel(step)}
          </span>
        </div>
      ))}
    </div>
  )
}
