import { NextRequest, NextResponse } from 'next/server'
import { getDepartmentWorkflow } from '@/lib/department-workflow'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const workflow = getDepartmentWorkflow(params.id)
  return NextResponse.json({ workflow, department: params.id })
}
