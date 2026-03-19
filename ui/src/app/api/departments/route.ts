import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

/** GET — list all departments */
export async function GET() {
  try {
    const departments = core.repo.deptRegistryRepo.readAll()
    return NextResponse.json({ departments })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** POST — create a new department */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = core.common.departmentService.createDepartment(body)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    return NextResponse.json({ ok: true, id: result.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** PUT — update a department */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    const result = core.common.departmentService.updateDepartment(id, updates)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** DELETE — remove a department (agents become unassigned) */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    const result = core.common.departmentService.deleteDepartment(id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    return NextResponse.json({ ok: true, clearedAgents: result.clearedAgents })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
