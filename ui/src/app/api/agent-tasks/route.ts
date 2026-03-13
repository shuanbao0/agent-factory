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
import {
  checkQualityGate,
  createPipelineTask,
  createReworkTask,
  persistNewTask,
  getWorkflowForTask,
} from '@/lib/quality-gate'

export const dynamic = 'force-dynamic'

const INTERNAL_TOKEN = process.env.AGENT_FACTORY_TOKEN || 'agent-factory-internal-token-2026'

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  return token === INTERNAL_TOKEN
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

  let tasks = findAllTasks().filter(t => t.assignees.includes(agent) || t.creator === agent)

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
    const { agent, name, description, projectId, type, priority, parentTaskId, dependencies, assignees } = body

    if (!agent || !name) {
      return NextResponse.json({ error: 'agent and name are required' }, { status: 400 })
    }

    // Validate projectId exists if provided
    if (projectId) {
      const meta = readProjectMeta(projectId)
      if (!meta) {
        return NextResponse.json({
          error: `Project "${projectId}" not found. Create the project first via /api/projects, or omit projectId for standalone task.`,
          hint: 'Available projects can be listed via GET /api/projects',
        }, { status: 404 })
      }
    }

    const now = new Date().toISOString()
    const task: Task = {
      id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      description: description || undefined,
      projectId: projectId || null,
      status: 'pending',
      priority: priority || 'P1',
      assignees: Array.isArray(assignees) && assignees.length > 0 ? assignees : [agent],
      assignedAgent: Array.isArray(assignees) && assignees.length > 0 ? assignees[0] : agent,
      creator: agent,
      progress: 0,
      dependencies: dependencies || [],
      type: type || undefined,
      parentTaskId: parentTaskId || undefined,
      createdAt: now,
      updatedAt: now,
    }

    persistNewTask(task)
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
    let { agent, taskId, status, progress, output, quality, reworkCount } = body

    if (!agent || !taskId) {
      return NextResponse.json({ error: 'agent and taskId are required' }, { status: 400 })
    }

    // Validate status value to prevent non-standard states
    const VALID_STATUSES = ['pending', 'assigned', 'in_progress', 'review', 'completed', 'failed', 'rework']
    if (status && !VALID_STATUSES.includes(status)) {
      if (status === 'running') {
        status = 'in_progress'
      } else {
        return NextResponse.json({ error: `Invalid status: ${status}. Valid values: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
      }
    }

    const found = findTaskById(taskId)
    if (!found) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check agent is in assignees or is the creator
    if (!found.task.assignees.includes(agent) && found.task.creator !== agent) {
      return NextResponse.json({ error: 'Agent is not assigned to or creator of this task' }, { status: 403 })
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
    if (reworkCount !== undefined) {
      updates.reworkCount = reworkCount
    }

    // Quality gate check on completion
    if (status === 'completed') {
      const mergedTask = { ...found.task, ...updates } as Task
      const workflow = getWorkflowForTask(mergedTask)
      const gate = checkQualityGate(mergedTask, workflow)

      if (!gate.passed) {
        if (gate.escalate) {
          updates.status = 'failed'
          updates.validationErrors = [...gate.errors, 'Max reworks exceeded']
          const updated = updateTaskInPlace(taskId, updates)
          return NextResponse.json({ task: updated, qualityGate: gate, ok: true })
        }
        if (gate.shouldRework) {
          updates.status = 'rework'
          updates.validationErrors = gate.errors
          const updated = updateTaskInPlace(taskId, updates)
          const reworkTask = createReworkTask(updated!, gate.errors)
          persistNewTask(reworkTask)
          return NextResponse.json({ task: updated, reworkTask, qualityGate: gate, ok: true })
        }
        return NextResponse.json({ error: 'Quality gate failed', qualityGate: gate }, { status: 422 })
      }

      updates.completedAt = new Date().toISOString()
      const updated = updateTaskInPlace(taskId, updates)
      const pipelineTask = createPipelineTask(updated!, workflow)
      if (pipelineTask) persistNewTask(pipelineTask)
      return NextResponse.json({ task: updated, pipelineTask, ok: true })
    }

    const updated = updateTaskInPlace(taskId, updates)
    if (!updated) {
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
    }

    return NextResponse.json({ task: updated, ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
