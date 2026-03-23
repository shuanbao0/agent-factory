import { NextRequest, NextResponse } from 'next/server'
import type { Task } from '@/lib/types'
import { STATUSES, TRANSITIONS, normalizeStatus, isTerminal, getValidTransitions } from '@entity/task'
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
import { relayEvent } from '@/lib/event-relay'
import core from '@/lib/core-bridge'

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

    // Infer task type if not explicitly provided
    let resolvedType = type
    if (!resolvedType) {
      try {
        const assignee = Array.isArray(assignees) && assignees.length > 0 ? assignees[0] : agent
        const agentMeta = core.repo.agentMetaRepo.readMeta(assignee)
        resolvedType = core.task.inferTaskType(name, agentMeta)
      } catch { /* fallback: no type */ }
    }

    // Enrich description with task + project standards if not already provided
    let enrichedDescription = description
    if (!description) {
      try {
        const parts: string[] = []
        // Task standards
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
        // Project phase standards
        if (projectId) {
          const projMeta = core.repo.projectMetaRepo.readMeta(projectId)
          const projStandards = core.common.projectStandards?.loadProjectStandards?.()
          if (projMeta && projStandards?.lifecycle && projMeta.currentPhase && projMeta.phases) {
            const phase = projMeta.phases[projMeta.currentPhase - 1]
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
        if (parts.length > 0) enrichedDescription = parts.join('\n')
      } catch { /* non-blocking */ }
    }

    const now = new Date().toISOString()
    const task: Task = {
      id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      description: enrichedDescription || undefined,
      projectId: projectId || null,
      status: 'pending',
      priority: priority || 'P1',
      assignees: Array.isArray(assignees) && assignees.length > 0 ? assignees : [agent],
      assignedAgent: Array.isArray(assignees) && assignees.length > 0 ? assignees[0] : agent,
      creator: agent,
      progress: 0,
      dependencies: dependencies || [],
      type: resolvedType || undefined,
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
    let { agent, taskId, status, progress, output, quality, reworkCount, failureReason } = body

    if (!agent || !taskId) {
      return NextResponse.json({ error: 'agent and taskId are required' }, { status: 400 })
    }

    // Validate status value to prevent non-standard states
    if (status) {
      const normalized = normalizeStatus(status)
      if (normalized !== status) {
        status = normalized
      } else if (!STATUSES.includes(status)) {
        return NextResponse.json({ error: `Invalid status: ${status}. Valid values: ${STATUSES.join(', ')}` }, { status: 400 })
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

    // State transition guard: only allow valid transitions (via shared state machine)
    if (status) {
      const allowed = TRANSITIONS[found.task.status as keyof typeof TRANSITIONS] || []
      if (!allowed.includes(status)) {
        return NextResponse.json({
          error: `Invalid transition: ${found.task.status} → ${status}`,
          currentStatus: found.task.status,
          allowedTransitions: getValidTransitions(found.task.status),
        }, { status: 409 })
      }
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
    if (status === 'failed' && failureReason) {
      updates.failureReason = failureReason
    }

    // Recovery from failed → completed: skip quality gate (user/system override)
    if (status === 'completed' && found.task.status === 'failed') {
      updates.completedAt = new Date().toISOString()
      updates.failureReason = undefined
      const updated = updateTaskInPlace(taskId, updates)
      relayEvent('task.status_changed', {
        taskId, taskName: found.task.name || '', agentId: agent,
        department: found.task.projectId || '', from: 'failed', to: 'completed',
      })
      return NextResponse.json({ task: updated, ok: true })
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
          updates.failureReason = `质量审核不通过且超过最大返工次数: ${gate.errors.join('; ')}`
          const updated = updateTaskInPlace(taskId, updates)
          relayEvent('task.status_changed', {
            taskId, taskName: found.task.name || '', agentId: agent,
            department: found.task.projectId || '', from: found.task.status, to: 'failed',
          })
          return NextResponse.json({ task: updated, qualityGate: gate, ok: true })
        }
        if (gate.shouldRework) {
          updates.status = 'rework'
          updates.validationErrors = gate.errors
          const updated = updateTaskInPlace(taskId, updates)
          relayEvent('task.status_changed', {
            taskId, taskName: found.task.name || '', agentId: agent,
            department: found.task.projectId || '', from: found.task.status, to: 'rework',
          })
          // Dedup: skip if there's already an active rework task from this task
          const allTasks = findAllTasks()
          const existingRework = allTasks.find(t =>
            t.reworkFromId === taskId &&
            !isTerminal(t.status)
          )
          if (!existingRework) {
            const reworkTask = createReworkTask(updated!, gate.errors)
            persistNewTask(reworkTask)
            return NextResponse.json({ task: updated, reworkTask, qualityGate: gate, ok: true })
          }
          return NextResponse.json({ task: updated, existingRework: existingRework.id, qualityGate: gate, ok: true })
        }
        return NextResponse.json({ error: 'Quality gate failed', qualityGate: gate }, { status: 422 })
      }

      updates.completedAt = new Date().toISOString()
      // Relay completion event to Autopilot
      relayEvent('task.status_changed', {
        taskId,
        taskName: found.task.name || '',
        agentId: agent,
        department: found.task.projectId || '',
        from: found.task.status,
        to: 'completed',
      })
      const updated = updateTaskInPlace(taskId, updates)

      // Close parent chain: walk up reworkFromId links and close all rework ancestors
      let ancestorId = found.task.reworkFromId
      while (ancestorId) {
        const ancestor = findTaskById(ancestorId)
        if (ancestor && ancestor.task.status === 'rework') {
          updateTaskInPlace(ancestorId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
          })
          ancestorId = ancestor.task.reworkFromId
        } else {
          break
        }
      }

      // Pipeline task dedup: skip if identical pipeline task already exists
      const pipelineTask = createPipelineTask(updated!, workflow)
      if (pipelineTask) {
        const allTasks = findAllTasks()
        const existingPipeline = allTasks.find(t =>
          t.type === pipelineTask.type &&
          t.dependencies?.includes(taskId) &&
          t.creator === 'pipeline'
        )
        if (!existingPipeline) {
          persistNewTask(pipelineTask)
        }
      }
      return NextResponse.json({ task: updated, pipelineTask, ok: true })
    }

    const updated = updateTaskInPlace(taskId, updates)
    if (!updated) {
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
    }

    // Relay status change to Autopilot via signal file
    if (status && status !== found.task.status) {
      relayEvent('task.status_changed', {
        taskId,
        taskName: found.task.name || '',
        agentId: agent,
        department: found.task.projectId || '',
        from: found.task.status,
        to: status,
      })
    }

    return NextResponse.json({ task: updated, ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
