import { NextRequest, NextResponse } from 'next/server'
import { listTasks, createTask, updateTask, deleteTask } from '@/services/task-api'

export const dynamic = 'force-dynamic'

// ── GET /api/tasks ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const result = listTasks({
    projectId: url.searchParams.get('projectId'),
    status: url.searchParams.get('status'),
    assignee: url.searchParams.get('assignee'),
    type: url.searchParams.get('type'),
  })
  return NextResponse.json(result)
}

// ── POST /api/tasks ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = createTask(body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ task: result.task, ok: true })
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

    const result = updateTask(id, updates)
    if (result.error) {
      return NextResponse.json(
        { error: result.error, ...(result.qualityGate ? { qualityGate: result.qualityGate } : {}) },
        { status: result.status },
      )
    }
    const resp: Record<string, unknown> = { task: result.task, ok: true }
    if (result.qualityGate) resp.qualityGate = result.qualityGate
    if (result.reworkTask) resp.reworkTask = result.reworkTask
    if (result.pipelineTask !== undefined) resp.pipelineTask = result.pipelineTask
    return NextResponse.json(resp)
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

    const result = deleteTask(id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
