import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

interface EnvEntry {
  key: string
  value: string
}

// GET: return env keys (masked values)
export async function GET() {
  const vars = core.common.envManager.readEnv()
  const masked: Record<string, string> = {}
  for (const [key, value] of Object.entries(vars)) {
    if (key.includes('KEY') || key.includes('TOKEN') || key.includes('SECRET')) {
      masked[key] = value ? `${value.slice(0, 8)}...${value.slice(-4)}` : ''
    } else {
      masked[key] = value
    }
  }
  return NextResponse.json({ vars: masked, hasFile: core.common.envManager.hasEnvFile() })
}

// PUT: upsert env vars
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const entries: EnvEntry[] = body.entries || []

    const current = core.common.envManager.readEnv()
    for (const { key, value } of entries) {
      if (!key.match(/^[A-Z_][A-Z0-9_]*$/)) {
        return NextResponse.json({ error: `Invalid key: ${key}` }, { status: 400 })
      }
      if (value) {
        current[key] = value
      } else {
        delete current[key]
      }
    }

    core.common.envManager.writeEnv(current)
    // Also update process.env so gateway-manager picks it up immediately
    for (const { key, value } of entries) {
      if (value) {
        process.env[key] = value
      } else {
        delete process.env[key]
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
