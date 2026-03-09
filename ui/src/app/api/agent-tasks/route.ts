import { NextRequest, NextResponse } from 'next/server'
import type { Task } from '@/lib/types'
import {
  findAllTasks,
  findTaskById,
  updateTaskInPlace,
  readStandaloneTasks,
  writeStandaloneTasks,
  readProjectMeta,
  writeProjectMeta,
} from '@/lib/task-storage'
import { getDepartmentWorkflow } from '@/lib/department-workflow'

export const dynamic = 'force-dynamic'

const INTERNAL_TOKEN = process.env.AGENT_FACTORY_TOKEN || 'agent-factory-internal-token-2026'

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  return token === INTERNAL_TOKEN
}

/** Create pipeline follow-up task when a task completes */
function createPipelineTask(completedTask: Task): Task | null {
  if (!completedTask.type || !completedTask.projectId) return null
  const meta = readProjectMeta(completedTask.projectId)
  if (!meta) return null
  const dept = (meta.department as string) || undefined
  const workflow = getDepartmentWorkflow(dept)
  const step = workflow.pipeline.find(p => p.from === completedTask.type)
  if (!step) return null
  const toType = workflow.taskTypes.find(tt => tt.value === step.to)
  const label = toType ? toType.labelEn : step.to
  const now = new Date().toISOString()
  return {
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: `${label}: ${completedTask.name}`,
    description: `Auto-created from pipeline: ${completedTask.type} -> ${step.to}`,
    projectId: completedTask.projectId,
    status: 'pending',
    priority: completedTask.priority,
    assignees: [],
    creator: 'pipeline',
    progress: 0,
    dependencies: [completedTask.id],
    type: step.to,
    createdAt: now,
    updatedAt: now,
  }
}

// ── GET /api/agent-tasks ────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const agent = url.searchParams.get('agent')
  if (!agent) {
    return NextResponse.json({ error: 'agent parameter is required' }, { status: 400 })
  }

  const status = url.searchParams.get('status')
  const projectId = url.searchParams.get('projectId')
  const type = url.searchParams.get('type')

  let tasks = findAllTasks().filter(t => t.assignees.includes(agent))

  if (status) tasks = tasks.filter(t => t.status === status)
  if (projectId) tasks = tasks.filter(t => t.projectId === projectId)
  if (type) tasks = tasks.filter(t => t.type === type)

  return NextResponse.json({ tasks, agent })
}

// ── POST /api/agent-tasks ───────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { agent, name, description, projectId, type, priority, parentTaskId, dependencies } = body

    if (!agent || !name) {
      return NextResponse.json({ error: 'agent and name are required' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const task: Task = {
      id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      description: description || undefined,
      projectId: projectId || null,
      status: 'pending',
      priority: priority || 'P1',
      assignees: [agent],
      assignedAgent: agent,
      creator: agent,
      progress: 0,
      dependencies: dependencies || [],
      type: type || undefined,
      parentTaskId: parentTaskId || undefined,
      createdAt: now,
      updatedAt: now,
    }

    if (task.projectId) {
      const meta = readProjectMeta(task.projectId)
      if (!meta) {
        return NextResponse.json({ error: `Project ${task.projectId} not found` }, { status: 404 })
      }
      if (!meta.tasks) meta.tasks = []
      const stored = { ...task }
      if (stored.status === 'in_progress') (stored as Record<string, unknown>).status = 'running';
      (meta.tasks as Record<string, unknown>[]).push(stored)
      writeProjectMeta(task.projectId, meta)
    } else {
      const tasks = readStandaloneTasks()
      tasks.push(task)
      writeStandaloneTasks(tasks)
    }

    return NextResponse.json({ task, ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

// ── PUT /api/agent-tasks ────────────────────────────────────────

export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { agent, taskId, status, progress, output, quality } = body

    if (!agent || !taskId) {
      return NextResponse.json({ error: 'agent and taskId are required' }, { status: 400 })
    }

    const found = findTaskById(taskId)
    if (!found) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check agent is in assignees
    if (!found.task.assignees.includes(agent)) {
      return NextResponse.json({ error: 'Agent is not assigned to this task' }, { status: 403 })
    }

    // Dependency check: cannot start if dependencies not complete
    if (status === 'in_progress' && found.task.dependencies.length > 0) {
      const allTasks = findAllTasks()
      const unfinished = found.task.dependencies.filter(depId => {
        const dep = allTasks.find(t => t.id === depId)
        return !dep || dep.status !== 'completed'
      })
      if (unfinished.length > 0) {
        return NextResponse.json({
          error: `Dependencies not completed: ${unfinished.join(', ')}`,
          unfinishedDependencies: unfinished,
        }, { status: 409 })
      }
    }

    const updates: Partial<Task> = {}
    if (status !== undefined) updates.status = status
    if (progress !== undefined) updates.progress = progress
    if (output !== undefined) updates.output = output
    if (quality !== undefined) {
      updates.quality = { ...(found.task.quality || {}), ...quality }
    }

    if (status === 'completed') {
      updates.completedAt = new Date().toISOString()
    }

    const updated = updateTaskInPlace(taskId, updates)
    if (!updated) {
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
    }

    // Pipeline auto-creation
    let pipelineTask: Task | null = null
    if (status === 'completed') {
      pipelineTask = createPipelineTask(updated)
      if (pipelineTask) {
        if (updated.projectId) {
          const meta = readProjectMeta(updated.projectId)
          if (meta) {
            if (!meta.tasks) meta.tasks = []
            const stored = { ...pipelineTask }
            if (stored.status === 'in_progress') (stored as Record<string, unknown>).status = 'running';
            (meta.tasks as Record<string, unknown>[]).push(stored)
            writeProjectMeta(updated.projectId, meta)
          }
        } else {
          const tasks = readStandaloneTasks()
          tasks.push(pipelineTask)
          writeStandaloneTasks(tasks)
        }
      }
    }

    return NextResponse.json({ task: updated, pipelineTask, ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
