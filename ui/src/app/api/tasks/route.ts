import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
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

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

// ── GET /api/tasks ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const status = url.searchParams.get('status')
  const assignee = url.searchParams.get('assignee')
  const type = url.searchParams.get('type')

  let tasks = [...readProjectTasks(), ...readStandaloneTasks()]

  // Filters
  if (projectId) {
    tasks = tasks.filter(t => projectId === 'standalone' ? !t.projectId : t.projectId === projectId)
  }
  if (status) {
    tasks = tasks.filter(t => t.status === status)
  }
  if (assignee) {
    tasks = tasks.filter(t => t.assignees.includes(assignee))
  }
  if (type) {
    tasks = tasks.filter(t => t.type === type)
  }

  // Sort: by priority (P0 first), then updatedAt desc
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 }
  tasks.sort((a, b) => {
    const pd = (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1)
    if (pd !== 0) return pd
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  return NextResponse.json({ tasks, source: 'filesystem' })
}

// ── POST /api/tasks ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const now = new Date().toISOString()
    const id = body.id || `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    const task: Task = {
      id,
      name: body.name || 'Untitled Task',
      description: body.description || undefined,
      projectId: body.projectId || null,
      phase: body.phase || undefined,
      status: body.status || 'pending',
      priority: body.priority || 'P1',
      assignees: body.assignees || [],
      assignedAgent: (body.assignees || [])[0] || undefined,
      creator: body.creator || 'user',
      progress: body.progress || 0,
      dependencies: body.dependencies || [],
      output: body.output || undefined,
      tags: body.tags || undefined,
      type: body.type || undefined,
      parentTaskId: body.parentTaskId || undefined,
      createdAt: now,
      updatedAt: now,
    }

    if (task.projectId) {
      // Add to project meta
      const metaPath = join(PROJECTS_DIR, task.projectId, '.project-meta.json')
      if (!existsSync(metaPath)) {
        return NextResponse.json({ error: `Project ${task.projectId} not found` }, { status: 404 })
      }
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      if (!meta.tasks) meta.tasks = []
      meta.tasks.push({ ...task })
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

// ── PUT /api/tasks ──────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

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
            if (updates.assignees) merged.assignedAgent = updates.assignees[0] || undefined
            standalone[sIdx] = merged
            writeStandaloneTasks(standalone)
            return NextResponse.json({ task: merged, qualityGate: gate, ok: true })
          }
          if (gate.shouldRework) {
            updates.status = 'rework'
            updates.validationErrors = gate.errors
            delete updates.completedAt
            const merged = { ...currentTask, ...updates }
            if (updates.assignees) merged.assignedAgent = updates.assignees[0] || undefined
            standalone[sIdx] = merged
            writeStandaloneTasks(standalone)
            const reworkTask = createReworkTask(merged as Task, gate.errors)
            persistNewTask(reworkTask)
            return NextResponse.json({ task: merged, reworkTask, qualityGate: gate, ok: true })
          }
          return NextResponse.json({ error: 'Quality gate failed', qualityGate: gate }, { status: 422 })
        }

        // Quality passed
        const merged = { ...currentTask, ...updates }
        if (updates.assignees) merged.assignedAgent = updates.assignees[0] || undefined
        standalone[sIdx] = merged
        writeStandaloneTasks(standalone)

        const pipelineTask = createPipelineTask(merged as Task, workflow)
        if (pipelineTask) {
          persistNewTask(pipelineTask)
        }

        return NextResponse.json({ task: merged, pipelineTask, ok: true })
      }

      // Non-completion update
      const merged = { ...currentTask, ...updates }
      if (updates.assignees) merged.assignedAgent = updates.assignees[0] || undefined
      standalone[sIdx] = merged
      writeStandaloneTasks(standalone)
      return NextResponse.json({ task: merged, ok: true })
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
            return NextResponse.json({ task: merged, qualityGate: gate, ok: true })
          }
          if (gate.shouldRework) {
            updates.status = 'rework'
            updates.validationErrors = gate.errors
            delete updates.completedAt
            updateProjectTask(pt.projectId, id, updates)
            const merged = { ...pt, ...updates }
            const reworkTask = createReworkTask(merged as Task, gate.errors)
            persistNewTask(reworkTask)
            return NextResponse.json({ task: merged, reworkTask, qualityGate: gate, ok: true })
          }
          return NextResponse.json({ error: 'Quality gate failed', qualityGate: gate }, { status: 422 })
        }

        // Quality passed
        const success = updateProjectTask(pt.projectId, id, updates)
        if (success) {
          const merged = { ...pt, ...updates }
          const pipelineTask = createPipelineTask(merged as Task, workflow)
          if (pipelineTask) {
            persistNewTask(pipelineTask)
          }
          return NextResponse.json({ task: merged, pipelineTask, ok: true })
        }
      } else {
        // Non-completion update
        const success = updateProjectTask(pt.projectId, id, updates)
        if (success) {
          const merged = { ...pt, ...updates }
          return NextResponse.json({ task: merged, ok: true })
        }
      }
    }

    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

// ── DELETE /api/tasks ───────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Try standalone tasks first
    const standalone = readStandaloneTasks()
    const sIdx = standalone.findIndex(t => t.id === id)
    if (sIdx !== -1) {
      standalone.splice(sIdx, 1)
      writeStandaloneTasks(standalone)
      return NextResponse.json({ ok: true })
    }

    // Try project tasks
    const projectTasks = readProjectTasks()
    const pt = projectTasks.find(t => t.id === id)
    if (pt && pt.projectId) {
      const success = deleteProjectTask(pt.projectId, id)
      if (success) return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
