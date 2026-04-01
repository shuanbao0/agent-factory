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

const DEFAULT_TASK_NAME = 'Untitled Task'

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
  const dbOpts: Record<string, unknown> = {}
  if (filters.status) dbOpts.status = filters.status
  if (filters.projectId && filters.projectId !== 'standalone') dbOpts.projectId = filters.projectId
  if (filters.assignee) dbOpts.assignee = filters.assignee
  if (filters.type) dbOpts.type = filters.type

  let tasks = core.db.taskQueries.findAllTasksFromDb(dbOpts) as Task[]
  // Handle 'standalone' special value (tasks with no project)
  if (filters.projectId === 'standalone') {
    tasks = tasks.filter(t => !t.projectId)
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
  const name = (body.name as string) || DEFAULT_TASK_NAME
  const projectId = (body.projectId as string) || null
  const assignees = (body.assignees as string[]) || []

  // Infer task type if not provided
  let resolvedType = body.type as string | undefined
  if (!resolvedType && assignees.length > 0) {
    try {
      const agentMeta = core.repo.agentMetaRepo.readMeta(assignees[0])
      resolvedType = core.task.inferTaskType(name, agentMeta)
    } catch (e) {
      core.common.logger.warn('task-api', 'Task type inference failed', { taskId: id, assignee: assignees[0], error: String(e) })
    }
  }

  // Enrich description with standards if not provided
  let description = body.description as string | undefined
  if (!description) {
    try {
      const parts: string[] = []
      if (resolvedType) {
        const standards = core.common.taskStandards.getStandardsForType(resolvedType)
        if (standards.typeStandards) {
          const completionMatch = standards.typeStandards.match(/\*\*完成定义[：:]\*\*\s*(.+)/)
          const doMatch = standards.typeStandards.match(/\*\*DO[：:]\*\*\s*(.+)/)
          const dontMatch = standards.typeStandards.match(/\*\*DON'T[：:]\*\*\s*(.+)/)
          if (completionMatch) parts.push(`完成定义: ${completionMatch[1]}`)
          if (doMatch) parts.push(`要求: ${doMatch[1]}`)
          if (dontMatch) parts.push(`禁止: ${dontMatch[1]}`)
        }
      }
      if (projectId) {
        const projMeta = core.repo.projectMetaRepo.readMeta(projectId)
        const projStandards = core.common.projectStandards?.loadProjectStandards?.()
        if (projMeta && projStandards?.lifecycle && projMeta.currentPhase && projMeta.phases) {
          const phase = (projMeta.phases as Array<{ labelEn?: string; labelZh?: string }>)[projMeta.currentPhase - 1]
          const phaseKey = phase?.labelEn?.toLowerCase()
          if (phaseKey) {
            const phaseStd = core.common.projectStandards.getPhaseStandards(projStandards.lifecycle, phaseKey)
            if (phaseStd) {
              const exitMatch = phaseStd.match(/\*\*出口条件[：:]\*\*\s*(.+)/)
              if (exitMatch) parts.push(`项目阶段: ${phase.labelZh || phase.labelEn} | 出口条件: ${exitMatch[1]}`)
            }
          }
        }
      }
      if (parts.length > 0) description = parts.join('\n')
    } catch (e) {
      core.common.logger.debug('task-api', 'Standards enrichment failed', { taskId: id, error: String(e) })
    }
  }

  const task: Task = {
    id,
    name,
    description,
    projectId,
    phase: (body.phase as number) || undefined,
    status: (body.status as Task['status']) || 'pending',
    priority: (body.priority as Task['priority']) || 'P1',
    assignees,
    assignedAgent: assignees[0] || undefined,
    creator: (body.creator as string) || 'user',
    progress: (body.progress as number) || 0,
    dependencies: (body.dependencies as string[]) || [],
    output: (body.output as string) || undefined,
    tags: (body.tags as string[]) || undefined,
    type: resolvedType || undefined,
    parentTaskId: (body.parentTaskId as string) || undefined,
    createdAt: now,
    updatedAt: now,
  }

  if (task.projectId) {
    const meta = core.repo.taskRepo.readProjectMeta(task.projectId)
    if (!meta) {
      return { error: `Project ${task.projectId} not found`, status: 404 }
    }
    if (!meta.tasks) meta.tasks = []
    meta.tasks.push({ ...task })
    writeProjectMeta(task.projectId, meta)
  } else {
    const tasks = readStandaloneTasks()
    tasks.push(task)
    writeStandaloneTasks(tasks)
  }

  core.common.logger.info('task-api', 'Task created', { taskId: id, name, projectId, type: resolvedType })
  return { task, ok: true }
}

// ── Shared completion workflow ────────────────────────────────────

function applyCompletionWorkflow(
  currentTask: Task,
  updates: Record<string, unknown>,
  persistFn: (merged: Task) => void,
): UpdateTaskResult {
  const mergedTask = { ...currentTask, ...updates } as Task
  const workflow = getWorkflowForTask(mergedTask)
  const gate = checkQualityGate(mergedTask, workflow)

  if (!gate.passed) {
    if (gate.escalate) {
      updates.status = 'failed'
      updates.validationErrors = [...gate.errors, 'Max reworks exceeded']
      updates.failureReason = `质量审核不通过且超过最大返工次数: ${gate.errors.join('; ')}`
      const merged = { ...currentTask, ...updates } as Task
      if (updates.assignees) merged.assignedAgent = (updates.assignees as string[])[0] || undefined
      persistFn(merged)
      return { task: merged, qualityGate: gate, ok: true }
    }
    if (gate.shouldRework) {
      updates.status = 'rework'
      updates.validationErrors = gate.errors
      delete updates.completedAt
      const merged = { ...currentTask, ...updates } as Task
      if (updates.assignees) merged.assignedAgent = (updates.assignees as string[])[0] || undefined
      persistFn(merged)
      const reworkTask = createReworkTask(merged, gate.errors)
      persistNewTask(reworkTask)
      return { task: merged, reworkTask, qualityGate: gate, ok: true }
    }
    return { error: 'Quality gate failed', qualityGate: gate, status: 422 }
  }

  // Quality passed
  const merged = { ...currentTask, ...updates } as Task
  if (updates.assignees) merged.assignedAgent = (updates.assignees as string[])[0] || undefined
  persistFn(merged)

  const pipelineTask = createPipelineTask(merged, workflow)
  if (pipelineTask) persistNewTask(pipelineTask)

  return { task: merged, pipelineTask, ok: true }
}

// ── updateTask ───────────────────────────────────────────────────

export function updateTask(id: string, updates: Record<string, unknown>): UpdateTaskResult {
  updates.updatedAt = new Date().toISOString()

  // Handle completion timestamp
  if (updates.status === 'completed' && !updates.completedAt) {
    updates.completedAt = updates.updatedAt
  }
  // Record failureReason when failing via API
  if (updates.status === 'failed' && updates.failureReason === undefined) {
    updates.failureReason = updates.failureReason || undefined
  }

  // Helper: recover failed task to completed (skip quality gate)
  const recoverFailed = (currentTask: Task, persistFn: (merged: Task) => void): UpdateTaskResult => {
    const merged = { ...currentTask, ...updates, failureReason: undefined, completedAt: updates.updatedAt } as Task
    if (updates.assignees) merged.assignedAgent = (updates.assignees as string[])[0] || undefined
    persistFn(merged)
    return { task: merged, ok: true }
  }

  // Try standalone tasks first
  const standalone = readStandaloneTasks()
  const sIdx = standalone.findIndex(t => t.id === id)
  if (sIdx !== -1) {
    const currentTask = standalone[sIdx]

    // Recovery from failed → completed: skip quality gate
    if (updates.status === 'completed' && currentTask.status === 'failed') {
      return recoverFailed(currentTask, (merged) => {
        standalone[sIdx] = merged
        writeStandaloneTasks(standalone)
      })
    }

    if (updates.status === 'completed') {
      return applyCompletionWorkflow(currentTask, updates, (merged) => {
        standalone[sIdx] = merged
        writeStandaloneTasks(standalone)
      })
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
    // Recovery from failed → completed: skip quality gate
    if (updates.status === 'completed' && pt.status === 'failed') {
      return recoverFailed(pt, (merged) => {
        updateProjectTask(pt.projectId!, id, merged)
      })
    }

    if (updates.status === 'completed') {
      return applyCompletionWorkflow(pt, updates, (merged) => {
        updateProjectTask(pt.projectId!, id, merged)
      })
    }
    // Non-completion update
    const success = updateProjectTask(pt.projectId, id, updates)
    if (success) {
      const merged = { ...pt, ...updates }
      return { task: merged as Task, ok: true }
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
    core.common.logger.info('task-api', 'Task deleted', { taskId: id })
    return { ok: true }
  }

  // Try project tasks
  const projectTasks = readProjectTasks()
  const pt = projectTasks.find(t => t.id === id)
  if (pt && pt.projectId) {
    const success = deleteProjectTask(pt.projectId, id)
    if (success) {
      core.common.logger.info('task-api', 'Task deleted', { taskId: id, projectId: pt.projectId })
      return { ok: true }
    }
  }

  return { error: 'Task not found', status: 404 }
}
