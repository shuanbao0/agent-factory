'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { Task } from '@/lib/types'
import { TaskCard } from '@/components/task-card'
import { TaskForm } from '@/components/task-form'
import { TaskPipeline } from '@/components/task-pipeline'
import { TaskQuality } from '@/components/task-quality'
import {
  CheckSquare, Plus, LayoutGrid, List, X,
  ChevronRight, User, FolderKanban, Clock, Trash2, Edit3, Tag, Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ViewMode = 'kanban' | 'list'
type GroupBy = 'status' | 'agent' | 'type'

// Kanban columns: merge pending+assigned into one column
const KANBAN_COLS = [
  { key: 'todo', statuses: ['pending', 'assigned'], labelKey: 'tasks.colPending' },
  { key: 'in_progress', statuses: ['in_progress'], labelKey: 'tasks.colInProgress' },
  { key: 'review', statuses: ['review'], labelKey: 'tasks.colReview' },
  { key: 'completed', statuses: ['completed'], labelKey: 'tasks.colCompleted' },
  { key: 'failed', statuses: ['failed'], labelKey: 'tasks.colFailed' },
] as const

const statusDot: Record<string, string> = {
  pending: 'bg-zinc-400',
  assigned: 'bg-indigo-400',
  in_progress: 'bg-sky-400',
  review: 'bg-purple-400',
  completed: 'bg-emerald-400',
  failed: 'bg-red-400',
}

export default function TasksPage() {
  const { t } = useTranslation()
  const { tasks, agents, projects, fetchTasks } = useAppStore()

  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('af-task-view') as ViewMode) || 'kanban'
    }
    return 'kanban'
  })
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('af-task-groupby') as GroupBy) || 'status'
    }
    return 'status'
  })
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)

  // Filters
  const [filterProject, setFilterProject] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  useEffect(() => { fetchTasks() }, [fetchTasks])
  useEffect(() => { localStorage.setItem('af-task-view', view) }, [view])
  useEffect(() => { localStorage.setItem('af-task-groupby', groupBy) }, [groupBy])

  // Filtered tasks
  const filtered = useMemo(() => {
    let result = [...tasks]
    if (filterProject) {
      result = result.filter(t =>
        filterProject === 'standalone' ? !t.projectId : t.projectId === filterProject
      )
    }
    if (filterAgent) {
      result = result.filter(t => t.assignees?.includes(filterAgent))
    }
    if (filterStatus) {
      result = result.filter(t => t.status === filterStatus)
    }
    if (filterType) {
      result = result.filter(t => filterType === '_none' ? !t.type : t.type === filterType)
    }
    return result
  }, [tasks, filterProject, filterAgent, filterStatus, filterType])

  // Group for kanban by status
  const kanbanGroups = useMemo(() => {
    if (groupBy === 'status') {
      const groups: Record<string, Task[]> = {}
      for (const col of KANBAN_COLS) {
        groups[col.key] = filtered.filter(t => col.statuses.includes(t.status as never))
      }
      return groups
    }
    if (groupBy === 'agent') {
      const groups: Record<string, Task[]> = { _unassigned: [] }
      for (const task of filtered) {
        if (!task.assignees || task.assignees.length === 0) {
          groups._unassigned.push(task)
        } else {
          for (const a of task.assignees) {
            if (!groups[a]) groups[a] = []
            groups[a].push(task)
          }
        }
      }
      return groups
    }
    // groupBy === 'type'
    const groups: Record<string, Task[]> = { _untyped: [] }
    for (const task of filtered) {
      const key = task.type || '_untyped'
      if (!groups[key]) groups[key] = []
      groups[key].push(task)
    }
    return groups
  }, [filtered, groupBy])

  const kanbanColumns = useMemo(() => {
    if (groupBy === 'status') {
      return KANBAN_COLS.map(col => ({ key: col.key, label: t(col.labelKey) }))
    }
    return Object.keys(kanbanGroups).map(key => ({
      key,
      label: key === '_unassigned' ? t('tasks.standalone') : key === '_untyped' ? '-' : key,
    }))
  }, [groupBy, kanbanGroups, t])

  const handleSaved = useCallback(() => {
    setShowForm(false)
    setEditTask(null)
    fetchTasks()
  }, [fetchTasks])

  const handleDelete = useCallback(async (taskId: string) => {
    if (!confirm(t('tasks.confirmDelete'))) return
    try {
      await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' })
      fetchTasks()
      if (detailTask?.id === taskId) setDetailTask(null)
    } catch { /* ignore */ }
  }, [fetchTasks, detailTask, t])

  const handleStatusChange = useCallback(async (task: Task, newStatus: Task['status']) => {
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: newStatus }),
      })
      fetchTasks()
    } catch { /* ignore */ }
  }, [fetchTasks])

  // Unique project names for filter
  const projectOptions = useMemo(() => {
    const ids = new Set(tasks.map(t => t.projectId).filter(Boolean) as string[])
    return Array.from(ids)
  }, [tasks])

  // Unique task types for filter
  const typeOptions = useMemo(() => {
    const types = new Set(tasks.map(t => t.type).filter(Boolean) as string[])
    return Array.from(types)
  }, [tasks])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <CheckSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{t('tasks.title')}</h1>
              <p className="text-sm text-muted-foreground">{t('tasks.subtitle')}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Group by selector */}
          <select
            className="px-2 py-1.5 text-xs rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as GroupBy)}
          >
            <option value="status">{t('tasks.groupByStatus')}</option>
            <option value="agent">{t('tasks.groupByAgent')}</option>
            <option value="type">{t('tasks.groupByType')}</option>
          </select>
          {/* View toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setView('kanban')}
              className={cn('p-1.5 rounded-md transition-colors', view === 'kanban' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              title={t('tasks.viewKanban')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('p-1.5 rounded-md transition-colors', view === 'list' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              title={t('tasks.viewList')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => { setEditTask(null); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('tasks.createTask')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          className="px-3 py-1.5 text-xs rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
        >
          <option value="">{t('tasks.allProjects')}</option>
          <option value="standalone">{t('tasks.standalone')}</option>
          {projectOptions.map(id => {
            const proj = projects.find(p => p.id === id)
            return <option key={id} value={id}>{proj?.name || id}</option>
          })}
        </select>
        <select
          className="px-3 py-1.5 text-xs rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
        >
          <option value="">{t('tasks.allAgents')}</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          className="px-3 py-1.5 text-xs rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">{t('tasks.allStatuses')}</option>
          {(['pending', 'assigned', 'in_progress', 'review', 'completed', 'failed'] as const).map(s => (
            <option key={s} value={s}>
              {t(`tasks.col${s === 'pending' || s === 'assigned' ? 'Pending' : s === 'in_progress' ? 'InProgress' : s === 'review' ? 'Review' : s === 'completed' ? 'Completed' : 'Failed'}`)}
            </option>
          ))}
        </select>
        <select
          className="px-3 py-1.5 text-xs rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">{t('tasks.filterByType')}</option>
          <option value="_none">-</option>
          {typeOptions.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <CheckSquare className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">{t('tasks.noTasks')}</p>
          <button
            onClick={() => { setEditTask(null); setShowForm(true) }}
            className="text-sm text-primary hover:underline"
          >
            {t('tasks.createFirst')}
          </button>
        </div>
      )}

      {/* Kanban view */}
      {view === 'kanban' && tasks.length > 0 && (
        <div className={cn(
          'grid gap-4 min-h-[400px]',
          kanbanColumns.length <= 5 ? `grid-cols-1 md:grid-cols-3 lg:grid-cols-${Math.min(kanbanColumns.length, 5)}` : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-5'
        )} style={kanbanColumns.length > 5 ? { gridTemplateColumns: `repeat(${kanbanColumns.length}, minmax(180px, 1fr))`, overflowX: 'auto' } : undefined}>
          {kanbanColumns.map(col => (
            <div key={col.key} className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {col.label}
                </h3>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {kanbanGroups[col.key]?.length || 0}
                </span>
              </div>
              <div className="space-y-2 min-h-[200px] p-1.5 rounded-lg bg-muted/30 border border-border/50">
                {(kanbanGroups[col.key] || []).map(task => (
                  <TaskCard key={task.id} task={task} onClick={() => setDetailTask(task)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {view === 'list' && tasks.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">{t('tasks.taskName')}</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">{t('tasks.type')}</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">{t('tasks.assignAgent')}</th>
                <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Project</th>
                <th className="text-left px-4 py-2.5 font-medium">{t('tasks.priority')}</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">{t('tasks.progress')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(task => (
                <tr
                  key={task.id}
                  onClick={() => setDetailTask(task)}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-block w-2.5 h-2.5 rounded-full', statusDot[task.status] || 'bg-zinc-400')} />
                  </td>
                  <td className="px-4 py-2.5 text-foreground font-medium truncate max-w-[200px]">{task.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                    {task.type ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{task.type}</span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                    {task.assignees?.join(', ') || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">
                    {task.projectId || t('tasks.standalone')}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded',
                      task.priority === 'P0' ? 'bg-red-500/20 text-red-400'
                        : task.priority === 'P1' ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-blue-500/20 text-blue-400'
                    )}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${task.progress}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{task.progress}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail side panel */}
      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onEdit={task => { setEditTask(task); setShowForm(true); setDetailTask(null) }}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Form modal */}
      {showForm && (
        <TaskForm
          editTask={editTask}
          onClose={() => { setShowForm(false); setEditTask(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ── Detail side panel ─────────────────────────────────────────

function TaskDetailPanel({
  task, onClose, onEdit, onDelete, onStatusChange
}: {
  task: Task
  onClose: () => void
  onEdit: (t: Task) => void
  onDelete: (id: string) => void
  onStatusChange: (t: Task, s: Task['status']) => void
}) {
  const { t } = useTranslation()
  const { projects } = useAppStore()
  const project = projects.find(p => p.id === task.projectId)

  const statusFlow: Task['status'][] = ['pending', 'assigned', 'in_progress', 'review', 'completed']

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l border-border h-full overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h3 className="text-sm font-semibold text-foreground truncate">{task.name}</h3>
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(task)} className="p-1.5 text-muted-foreground hover:text-foreground">
              <Edit3 className="w-4 h-4" />
            </button>
            <button onClick={() => onDelete(task.id)} className="p-1.5 text-muted-foreground hover:text-red-400">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Status flow */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {statusFlow.map(s => (
                <button
                  key={s}
                  onClick={() => onStatusChange(task, s)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs border transition-colors',
                    task.status === s
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                  )}
                >
                  {t(`tasks.col${s === 'pending' || s === 'assigned' ? 'Pending' : s === 'in_progress' ? 'InProgress' : s === 'review' ? 'Review' : s === 'completed' ? 'Completed' : 'Failed'}`)}
                </button>
              ))}
              <button
                onClick={() => onStatusChange(task, 'failed')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs border transition-colors',
                  task.status === 'failed'
                    ? 'bg-red-500/20 text-red-400 border-red-500/40'
                    : 'bg-muted text-muted-foreground border-border hover:border-red-500/30'
                )}
              >
                {t('tasks.colFailed')}
              </button>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.priority')}</label>
            <span className={cn(
              'text-xs font-bold px-2 py-1 rounded',
              task.priority === 'P0' ? 'bg-red-500/20 text-red-400'
                : task.priority === 'P1' ? 'bg-amber-500/20 text-amber-400'
                : 'bg-blue-500/20 text-blue-400'
            )}>
              {task.priority}
            </span>
          </div>

          {/* Type */}
          {task.type && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.type')}</label>
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                <Tag className="w-3 h-3" />
                {task.type}
              </span>
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.taskDesc')}</label>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Assignees */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.assignAgent')}</label>
            <div className="flex flex-wrap gap-1.5">
              {task.assignees?.length > 0 ? task.assignees.map(a => (
                <span key={a} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-md">
                  <User className="w-3 h-3" /> {a}
                </span>
              )) : <span className="text-xs text-muted-foreground">-</span>}
            </div>
          </div>

          {/* Project */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Project</label>
            <div className="flex items-center gap-1.5 text-xs text-foreground/80">
              <FolderKanban className="w-3 h-3" />
              {project ? project.name : task.projectId || t('tasks.standalone')}
            </div>
          </div>

          {/* Progress */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.progress')}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${task.progress}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{task.progress}%</span>
            </div>
          </div>

          {/* Pipeline indicator */}
          {task.type && task.projectId && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.pipeline')}</label>
              <TaskPipeline taskType={task.type} projectId={task.projectId} department={project?.department} />
            </div>
          )}

          {/* Quality */}
          {task.quality && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">{t('tasks.quality')}</label>
              <TaskQuality quality={task.quality} />
            </div>
          )}

          {/* Creator */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.createdBy')}</label>
            <span className="text-xs text-foreground/80">{task.creator || 'user'}</span>
          </div>

          {/* Output */}
          {task.output && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.output')}</label>
              <span className="text-xs text-foreground/80 font-mono">{task.output}</span>
            </div>
          )}

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.tags')}</label>
              <div className="flex flex-wrap gap-1">
                {task.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="text-[11px] text-muted-foreground space-y-1 pt-2 border-t border-border">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Created: {new Date(task.createdAt).toLocaleString()}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Updated: {new Date(task.updatedAt).toLocaleString()}
            </div>
            {task.completedAt && (
              <div className="flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                Completed: {new Date(task.completedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
