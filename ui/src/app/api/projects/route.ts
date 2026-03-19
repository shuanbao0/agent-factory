import { NextRequest, NextResponse } from 'next/server'
import { getDepartmentWorkflow } from '@/lib/department-workflow'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const projects = core.common.projectService.listProjects()
    return NextResponse.json({ projects, source: 'filesystem' })
  } catch (e) {
    return NextResponse.json({ error: String(e), projects: [], source: 'error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { name: string; description?: string; department?: string }
    const workflow = getDepartmentWorkflow(body.department)
    const result = core.common.projectService.createProject(body, workflow)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    return NextResponse.json({ ok: true, project: result.project })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
