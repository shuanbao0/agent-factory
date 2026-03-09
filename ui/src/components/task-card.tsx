'use client'
import { Task } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Clock, User, FolderKanban, Shield, Tag } from 'lucide-react'

interface TaskCardProps {
  task: Task
  onClick?: () => void
}

const priorityColors: Record<string, string> = {
  P0: 'bg-red-500/20 text-red-400 border-red-500/30',
  P1: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  P2: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

const statusColors: Record<string, string> = {
  pending: 'bg-zinc-500/20 text-zinc-400',
  assigned: 'bg-indigo-500/20 text-indigo-400',
  in_progress: 'bg-sky-500/20 text-sky-400',
  review: 'bg-purple-500/20 text-purple-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const { t } = useTranslation()

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-lg border border-border bg-card/80 hover:bg-card',
        'cursor-pointer transition-all hover:shadow-md hover:border-primary/30',
        'space-y-2'
      )}
    >
      {/* Header: priority + status */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', priorityColors[task.priority] || priorityColors.P1)}>
          {task.priority}
        </span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded', statusColors[task.status] || statusColors.pending)}>
          {t(`tasks.col${task.status === 'pending' || task.status === 'assigned' ? 'Pending' : task.status === 'in_progress' ? 'InProgress' : task.status === 'review' ? 'Review' : task.status === 'completed' ? 'Completed' : 'Failed'}`)}
        </span>
      </div>

      {/* Task name + type badge */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{task.name}</p>
        <div className="flex items-center gap-1.5">
          {task.type && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              <Tag className="w-2.5 h-2.5" />
              {task.type}
            </span>
          )}
          {task.quality && (
            <Shield className={cn('w-3 h-3',
              task.quality.headApproval?.passed ? 'text-emerald-400' :
              task.quality.selfCheck ? 'text-amber-400' : 'text-muted-foreground'
            )} />
          )}
        </div>
      </div>

      {/* Assignees */}
      {task.assignees.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <User className="w-3 h-3" />
          <span className="truncate">{task.assignees.join(', ')}</span>
        </div>
      )}

      {/* Progress bar */}
      {task.progress > 0 && (
        <div className="space-y-0.5">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(task.progress, 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{task.progress}%</span>
        </div>
      )}

      {/* Footer: project tag + time */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          {task.projectId ? (
            <>
              <FolderKanban className="w-3 h-3" />
              <span className="truncate max-w-[100px]">{task.projectId}</span>
            </>
          ) : (
            <span className="text-muted-foreground/60">{t('tasks.standalone')}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{timeAgo(task.updatedAt)}</span>
        </div>
      </div>

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
