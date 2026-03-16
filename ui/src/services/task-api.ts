import type { Task } from '@/lib/types'
import {
  readStandaloneTasks,
  writeStandaloneTasks,
  readProjectTasks,
  writeProjectMeta,
  updateProjectTask,
  deleteProjectTask,
} from '@/lib/task-storage'
import {
  checkQualityGate,
  createPipelineTask,
  createReworkTask,
  persistNewTask,
  getWorkflowForTask,
} from '@/lib/quality-gate'
import core from '@/lib/core-bridge'

// ── Types ────────────────────────────────────────────────────────

export interface TaskFilters {
  projectId?: string | null
  status?: string | null
  assignee?: string | null
  type?: string | null
}

export interface ListTasksResult {
  tasks: Task[]
  source: 'filesystem'
}

export interface CreateTaskResult {
  task?: Task
  ok?: boolean
  error?: string
  status?: number
}

export interface UpdateTaskResult {
  task?: Task
  ok?: boolean
  qualityGate?: ReturnType<typeof checkQualityGate>
  reworkTask?: Task
  pipelineTask?: Task | null
  error?: string
  status?: number
}

export interface DeleteTaskResult {
  ok?: boolean
  error?: string
  status?: number
}

// ── listTasks ────────────────────────────────────────────────────

export function listTasks(filters: TaskFilters): ListTasksResult {
  let tasks = [...readProjectTasks(), ...readStandaloneTasks()]

  if (filters.projectId) {
    const pid = filters.projectId
    tasks = tasks.filter(t => pid === 'standalone' ? !t.projectId : t.projectId === pid)
  }
  if (filters.status) {
    const s = filters.status
    tasks = tasks.filter(t => t.status === s)
  }
  if (filters.assignee) {
    const a = filters.assignee
    tasks = tasks.filter(t => t.assignees.includes(a))
  }
  if (filters.type) {
    const tp = filters.type
    tasks = tasks.filter(t => t.type === tp)
  }

  // Sort: by priority (P0 first), then updatedAt desc
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 }
  tasks.sort((a, b) => {
    const pd = (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1)
    if (pd !== 0) return pd
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  return { tasks, source: 'filesystem' }
}

// ── createTask ───────────────────────────────────────────────────

export function createTask(body: Record<string, unknown>): CreateTaskResult {
  const now = new Date().toISOString()
  const id = (body.id as string) || `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  const task: Task = {
    id,
    name: (body.name as string) || 'Untitled Task',
    description: (body.description as string) || undefined,
    projectId: (body.projectId as string) || null,
    phase: (body.phase as number) || undefined,
    status: (body.status as Task['status']) || 'pending',
    priority: (body.priority as Task['priority']) || 'P1',
    assignees: (body.assignees as string[]) || [],
    assignedAgent: ((body.assignees as string[]) || [])[0] || undefined,
    creator: (body.creator as string) || 'user',
    progress: (body.progress as number) || 0,
    dependencies: (body.dependencies as string[]) || [],
    output: (body.output as string) || undefined,
    tags: (body.tags as string[]) || undefined,
    type: (body.type as string) || undefined,
    parentTaskId: (body.parentTaskId as string) || undefined,
    createdAt: now,
    updatedAt: now,
  }

  if (task.projectId) {
    const meta = core.repo.taskRepo.readProjectMeta(task.projectId) as Record<string, unknown> | null
    if (!meta) {
      return { error: `Project ${task.projectId} not found`, status: 404 }
    }
    if (!meta.tasks) meta.tasks = []
    ;(meta.tasks as Record<string, unknown>[]).push({ ...task })
    writeProjectMeta(task.projectId, meta)
  } else {
    const tasks = readStandaloneTasks()
    tasks.push(task)
    writeStandaloneTasks(tasks)
  }

  return { task, ok: true }
}

// ── updateTask ───────────────────────────────────────────────────

export function updateTask(id: string, updates: Record<string, unknown>): UpdateTaskResult {
  updates.updatedAt = new Date().toISOString()

  // Handle completion timestamp
  if (updates.status === 'completed' && !updates.completedAt) {
    updates.completedAt = updates.updatedAt
  }

  // Try standalone tasks first
  const standalone = readStandaloneTasks()
  const sIdx = standalone.findIndex(t => t.id === id)
  if (sIdx !== -1) {
    const currentTask = standalone[sIdx]

    if (updates.status === 'completed') {
      const mergedTask = { ...currentTask, ...updates } as Task
      const workflow = getWorkflowForTask(mergedTask)
      const gate = checkQualityGate(mergedTask, workflow)

      if (!gate.passed) {
        if (gate.escalate) {
          updates.status = 'failed'
          updates.validationErrors = [...gate.errors, 'Max reworks exceeded']
          const merged = { ...currentTask, ...updates }
          if (updates.assignees) merged.assignedAgent = (updates.assignees as string[])[0] || undefined
          standalone[sIdx] = merged as Task
          writeStandaloneTasks(standalone)
          return { task: merged as Task, qualityGate: gate, ok: true }
        }
        if (gate.shouldRework) {
          updates.status = 'rework'
          updates.validationErrors = gate.errors
          delete updates.completedAt
          const merged = { ...currentTask, ...updates }
          if (updates.assignees) merged.assignedAgent = (updates.assignees as string[])[0] || undefined
          standalone[sIdx] = merged as Task
          writeStandaloneTasks(standalone)
          const reworkTask = createReworkTask(merged as Task, gate.errors)
          persistNewTask(reworkTask)
          return { task: merged as Task, reworkTask, qualityGate: gate, ok: true }
        }
        return { error: 'Quality gate failed', qualityGate: gate, status: 422 }
      }

      // Quality passed
      const merged = { ...currentTask, ...updates }
      if (updates.assignees) merged.assignedAgent = (updates.assignees as string[])[0] || undefined
      standalone[sIdx] = merged as Task
      writeStandaloneTasks(standalone)

      const pipelineTask = createPipelineTask(merged as Task, workflow)
      if (pipelineTask) {
        persistNewTask(pipelineTask)
      }

      return { task: merged as Task, pipelineTask, ok: true }
    }

    // Non-completion update
    const merged = { ...currentTask, ...updates }
    if (updates.assignees) merged.assignedAgent = (updates.assignees as string[])[0] || undefined
    standalone[sIdx] = merged as Task
    writeStandaloneTasks(standalone)
    return { task: merged as Task, ok: true }
  }

  // Try project tasks
  const projectTasks = readProjectTasks()
  const pt = projectTasks.find(t => t.id === id)
  if (pt && pt.projectId) {
    if (updates.status === 'completed') {
      const mergedTask = { ...pt, ...updates } as Task
      const workflow = getWorkflowForTask(mergedTask)
      const gate = checkQualityGate(mergedTask, workflow)

      if (!gate.passed) {
        if (gate.escalate) {
          updates.status = 'failed'
          updates.validationErrors = [...gate.errors, 'Max reworks exceeded']
          updateProjectTask(pt.projectId, id, updates)
          const merged = { ...pt, ...updates }
          return { task: merged as Task, qualityGate: gate, ok: true }
        }
        if (gate.shouldRework) {
          updates.status = 'rework'
          updates.validationErrors = gate.errors
          delete updates.completedAt
          updateProjectTask(pt.projectId, id, updates)
          const merged = { ...pt, ...updates }
          const reworkTask = createReworkTask(merged as Task, gate.errors)
          persistNewTask(reworkTask)
          return { task: merged as Task, reworkTask, qualityGate: gate, ok: true }
        }
        return { error: 'Quality gate failed', qualityGate: gate, status: 422 }
      }

      // Quality passed
      const success = updateProjectTask(pt.projectId, id, updates)
      if (success) {
        const merged = { ...pt, ...updates }
        const pipelineTask = createPipelineTask(merged as Task, workflow)
        if (pipelineTask) {
          persistNewTask(pipelineTask)
        }
        return { task: merged as Task, pipelineTask, ok: true }
      }
    } else {
      // Non-completion update
      const success = updateProjectTask(pt.projectId, id, updates)
      if (success) {
        const merged = { ...pt, ...updates }
        return { task: merged as Task, ok: true }
      }
    }
  }

  return { error: 'Task not found', status: 404 }
}

// ── deleteTask ───────────────────────────────────────────────────

export function deleteTask(id: string): DeleteTaskResult {
  // Try standalone tasks first
  const standalone = readStandaloneTasks()
  const sIdx = standalone.findIndex(t => t.id === id)
  if (sIdx !== -1) {
    standalone.splice(sIdx, 1)
    writeStandaloneTasks(standalone)
    return { ok: true }
  }

  // Try project tasks
  const projectTasks = readProjectTasks()
  const pt = projectTasks.find(t => t.id === id)
  if (pt && pt.projectId) {
    const success = deleteProjectTask(pt.projectId, id)
    if (success) return { ok: true }
  }

  return { error: 'Task not found', status: 404 }
}
