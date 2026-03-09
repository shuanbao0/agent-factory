import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import type { Task } from '@/lib/types'
import {
  normalizeTask,
  readStandaloneTasks,
  writeStandaloneTasks,
  readProjectTasks,
  readProjectMeta,
  writeProjectMeta,
  updateProjectTask,
  deleteProjectTask,
} from '@/lib/task-storage'
import { getDepartmentWorkflow } from '@/lib/department-workflow'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

/** Create pipeline follow-up task when a task completes */
function createPipelineTask(completedTask: Task): Task | null {
  if (!completedTask.type || !completedTask.projectId) return null

  // Get project's department to find workflow
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
    parentTaskId: completedTask.parentTaskId,
    createdAt: now,
    updatedAt: now,
  }
}

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
      const stored = { ...task }
      if (stored.status === 'in_progress') (stored as Record<string, unknown>).status = 'running'
      meta.tasks.push(stored)
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
      const merged = { ...standalone[sIdx], ...updates }
      if (updates.assignees) merged.assignedAgent = updates.assignees[0] || undefined
      standalone[sIdx] = merged
      writeStandaloneTasks(standalone)

      // Pipeline: auto-create follow-up task
      let pipelineTask: Task | null = null
      if (updates.status === 'completed') {
        pipelineTask = createPipelineTask(merged)
        if (pipelineTask) {
          standalone.push(pipelineTask)
          writeStandaloneTasks(standalone)
        }
      }

      return NextResponse.json({ task: merged, pipelineTask, ok: true })
    }

    // Try project tasks
    const projectTasks = readProjectTasks()
    const pt = projectTasks.find(t => t.id === id)
    if (pt && pt.projectId) {
      const success = updateProjectTask(pt.projectId, id, updates)
      if (success) {
        const merged = { ...pt, ...updates }

        // Pipeline: auto-create follow-up task
        let pipelineTask: Task | null = null
        if (updates.status === 'completed') {
          pipelineTask = createPipelineTask(merged as Task)
          if (pipelineTask && pt.projectId) {
            const meta = readProjectMeta(pt.projectId)
            if (meta) {
              if (!meta.tasks) meta.tasks = []
              const stored = { ...pipelineTask }
              if (stored.status === 'in_progress') (stored as Record<string, unknown>).status = 'running';
              (meta.tasks as Record<string, unknown>[]).push(stored)
              writeProjectMeta(pt.projectId, meta)
            }
          }
        }

        return NextResponse.json({ task: merged, pipelineTask, ok: true })
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
