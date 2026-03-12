'use client'
import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { Task, TaskTypeDefinition } from '@/lib/types'
import { X, Loader2 } from 'lucide-react'

const DEFAULT_TASK_TYPES: TaskTypeDefinition[] = [
  { value: 'research', labelZh: '调研', labelEn: 'Research', color: 'blue' },
  { value: 'design', labelZh: '设计', labelEn: 'Design', color: 'purple' },
  { value: 'coding', labelZh: '开发', labelEn: 'Coding', color: 'green' },
  { value: 'testing', labelZh: '测试', labelEn: 'Testing', color: 'amber' },
  { value: 'review', labelZh: '评审', labelEn: 'Review', color: 'pink' },
]

interface TaskFormProps {
  editTask?: Task | null
  onClose: () => void
  onSaved: () => void
}

export function TaskForm({ editTask, onClose, onSaved }: TaskFormProps) {
  const { t, locale } = useTranslation()
  const agents = useAppStore(s => s.agents)
  const projects = useAppStore(s => s.projects)
  const tasks = useAppStore(s => s.tasks)
  const isEdit = !!editTask

  const [name, setName] = useState(editTask?.name || '')
  const [description, setDescription] = useState(editTask?.description || '')
  const [priority, setPriority] = useState<'P0' | 'P1' | 'P2'>(editTask?.priority || 'P1')
  const [assignees, setAssignees] = useState<string[]>(editTask?.assignees || [])
  const [projectId, setProjectId] = useState<string>(editTask?.projectId || '')
  const [dependencies, setDependencies] = useState<string[]>(editTask?.dependencies || [])
  const [tags, setTags] = useState(editTask?.tags?.join(', ') || '')
  const [status, setStatus] = useState<Task['status']>(editTask?.status || 'pending')
  const [taskType, setTaskType] = useState<string>(editTask?.type || '')
  const [taskTypes, setTaskTypes] = useState<TaskTypeDefinition[]>(DEFAULT_TASK_TYPES)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Load task types from project's department workflow
  useEffect(() => {
    if (!projectId) {
      setTaskTypes(DEFAULT_TASK_TYPES)
      return
    }
    const proj = projects.find(p => p.id === projectId)
    const dept = proj?.department
    if (!dept) {
      setTaskTypes(DEFAULT_TASK_TYPES)
      return
    }
    fetch(`/api/departments/${dept}/workflow`)
      .then(r => r.json())
      .then(data => {
        if (data.workflow?.taskTypes?.length > 0) {
          setTaskTypes(data.workflow.taskTypes)
        } else {
          setTaskTypes(DEFAULT_TASK_TYPES)
        }
      })
      .catch(() => setTaskTypes(DEFAULT_TASK_TYPES))
  }, [projectId, projects])

  const toggleAssignee = (agentId: string) => {
    setAssignees(prev =>
      prev.includes(agentId) ? prev.filter(a => a !== agentId) : [...prev, agentId]
    )
  }

  const toggleDep = (taskId: string) => {
    setDependencies(prev =>
      prev.includes(taskId) ? prev.filter(d => d !== taskId) : [...prev, taskId]
    )
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t('agents.nameRequired'))
      return
    }
    setSaving(true)
    setError('')

    const parsedTags = tags.split(',').map(s => s.trim()).filter(Boolean)
    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || undefined,
      priority,
      assignees,
      projectId: projectId || null,
      dependencies,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
      type: taskType || undefined,
    }

    if (isEdit) {
      body.id = editTask!.id
      body.status = status
    }

    try {
      const res = await fetch('/api/tasks', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed')
        setSaving(false)
        return
      }
      onSaved()
    } catch (err) {
      setError(String(err))
      setSaving(false)
    }
  }

  // Available tasks for dependency selection (exclude self)
  const availableDeps = tasks.filter(t => t.id !== editTask?.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {isEdit ? t('tasks.editTask') : t('tasks.createTask')}
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Task name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.taskName')}</label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('tasks.taskName')}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.taskDesc')}</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('tasks.taskDesc')}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.priority')}</label>
            <div className="flex gap-2">
              {(['P0', 'P1', 'P2'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    priority === p
                      ? p === 'P0' ? 'bg-red-500/20 text-red-400 border-red-500/40'
                        : p === 'P1' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Status (edit mode only) */}
          {isEdit && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={status}
                onChange={e => setStatus(e.target.value as Task['status'])}
              >
                {(['pending', 'assigned', 'in_progress', 'review', 'completed', 'failed'] as const).map(s => (
                  <option key={s} value={s}>
                    {t(`tasks.col${s === 'pending' || s === 'assigned' ? 'Pending' : s === 'in_progress' ? 'InProgress' : s === 'review' ? 'Review' : s === 'completed' ? 'Completed' : 'Failed'}`)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Task Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.type')}</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTaskType('')}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                  !taskType
                    ? 'bg-primary/20 text-primary border-primary/40'
                    : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                }`}
              >
                -
              </button>
              {taskTypes.map(tt => (
                <button
                  key={tt.value}
                  onClick={() => setTaskType(tt.value)}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    taskType === tt.value
                      ? `bg-${tt.color}-500/20 text-${tt.color}-400 border-${tt.color}-500/40`
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                  }`}
                >
                  {locale === 'zh' ? tt.labelZh : tt.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Assign Agents */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.assignAgent')}</label>
            <div className="flex flex-wrap gap-1.5">
              {agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => toggleAssignee(agent.id)}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    assignees.includes(agent.id)
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                  }`}
                >
                  {agent.name}
                </button>
              ))}
              {agents.length === 0 && (
                <span className="text-xs text-muted-foreground">{t('agents.noAgents')}</span>
              )}
            </div>
          </div>

          {/* Link to Project */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.selectProject')}</label>
            <select
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
            >
              <option value="">{t('tasks.standalone')}</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Dependencies */}
          {availableDeps.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.dependencies')}</label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {availableDeps.map(dt => (
                  <button
                    key={dt.id}
                    onClick={() => toggleDep(dt.id)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                      dependencies.includes(dt.id)
                        ? 'bg-primary/20 text-primary border-primary/40'
                        : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                    }`}
                  >
                    {dt.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('tasks.tags')}</label>
            <input
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="tag1, tag2, ..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
