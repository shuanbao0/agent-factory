import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const PROJECT_ROOT = resolve(process.cwd(), '..')

export const dynamic = 'force-dynamic'

function getAgentJsonPath(agentId: string): string {
  return resolve(PROJECT_ROOT, 'agents', agentId, 'agent.json')
}

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('id')
  if (!agentId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const path = getAgentJsonPath(agentId)
  if (!existsSync(path)) return NextResponse.json({ model: null })
  
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    return NextResponse.json({ model: data.model || null })
  } catch {
    return NextResponse.json({ model: null })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { agentId, model } = await req.json()
    if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })

    const path = getAgentJsonPath(agentId)
    let data: Record<string, unknown> = {}
    if (existsSync(path)) {
      try { data = JSON.parse(readFileSync(path, 'utf-8')) } catch { /* */ }
    }
    
    if (model) {
      data.model = model
    } else {
      delete data.model
    }

    // Ensure directory exists
    const dir = resolve(path, '..')
    const { mkdirSync } = require('fs')
    mkdirSync(dir, { recursive: true })

    writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
