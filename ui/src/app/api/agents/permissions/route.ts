import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { logError } from '@/lib/error-logger'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')

/**
 * GET /api/agents/permissions
 *
 * Returns the communication permissions matrix.
 * Read from each agent's agent.json → peers field.
 * { permissions: { "pm": ["researcher", "product"], ... } }
 */
export async function GET() {
  try {
    const permissions: Record<string, string[]> = {}

    const { readdirSync } = require('fs')
    if (!existsSync(AGENTS_DIR)) {
      return NextResponse.json({ permissions: {} })
    }

    const dirs = readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter((d: { isDirectory: () => boolean }) => d.isDirectory())

    for (const dir of dirs) {
      const agentJsonPath = join(AGENTS_DIR, dir.name, 'agent.json')
      if (existsSync(agentJsonPath)) {
        try {
          const data = JSON.parse(readFileSync(agentJsonPath, 'utf-8'))
          permissions[dir.name] = data.peers || []
        } catch {
          permissions[dir.name] = []
        }
      } else {
        permissions[dir.name] = []
      }
    }

    return NextResponse.json({ permissions })
  } catch (e) {
    return NextResponse.json({ error: String(e), permissions: {} }, { status: 500 })
  }
}

/**
 * PUT /api/agents/permissions
 *
 * Save the full permissions matrix.
 * Body: { permissions: { "pm": ["researcher", "product"], ... } }
 * Writes to each agent's agent.json → peers field.
 */
export async function PUT(req: NextRequest) {
  try {
    const { permissions } = await req.json() as {
      permissions: Record<string, string[]>
    }

    if (!permissions || typeof permissions !== 'object') {
      return NextResponse.json({ error: 'permissions object required' }, { status: 400 })
    }

    for (const [agentId, peers] of Object.entries(permissions)) {
      const agentJsonPath = join(AGENTS_DIR, agentId, 'agent.json')

      // Security: validate agent directory exists
      const agentDir = join(AGENTS_DIR, agentId)
      if (!existsSync(agentDir)) continue

      // Read existing agent.json or create new
      let data: Record<string, unknown> = {}
      if (existsSync(agentJsonPath)) {
        try {
          data = JSON.parse(readFileSync(agentJsonPath, 'utf-8'))
        } catch (err) { logError('agents-permissions/read-agent-json', err) }
      }

      // Update peers
      data.peers = Array.isArray(peers) ? peers : []

      writeFileSync(agentJsonPath, JSON.stringify(data, null, 4) + '\n')
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
