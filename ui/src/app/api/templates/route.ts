import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')

// ── GET: List all templates ─────────────────────────────────────
export async function GET() {
  try {
    const all = core.repo.listTemplates()
    const visible = all.filter(t => !t.hidden)
    return NextResponse.json({ templates: visible })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── POST: Create a custom template ──────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, description, emoji, defaults } = body as {
      id: string
      name: string
      description?: string
      emoji?: string
      defaults?: { model?: string; skills?: string[]; peers?: string[] }
    }

    if (!id || !name) {
      return NextResponse.json({ error: 'id and name are required' }, { status: 400 })
    }

    if (!/^[a-z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: 'ID must be lowercase alphanumeric with hyphens' }, { status: 400 })
    }

    const templateDir = join(PROJECT_ROOT, 'templates', 'custom', id)
    if (existsSync(templateDir)) {
      return NextResponse.json({ error: `Template "${id}" already exists` }, { status: 409 })
    }

    // Also check builtin
    if (existsSync(join(PROJECT_ROOT, 'templates', 'builtin', id))) {
      return NextResponse.json({ error: `Template "${id}" conflicts with a builtin template` }, { status: 409 })
    }

    const template = {
      id,
      name,
      description: description || '',
      emoji: emoji || '🤖',
      category: 'custom',
      defaults: {
        model: defaults?.model || '',
        skills: defaults?.skills || [],
        peers: defaults?.peers || [],
      },
    }

    core.repo.createCustomTemplate(id, template)

    return NextResponse.json({ ok: true, template })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
