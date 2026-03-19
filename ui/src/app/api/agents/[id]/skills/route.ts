import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

interface AgentConfig {
  model?: string
  skills?: string[]
  [key: string]: unknown
}

// ── GET: List all skills for an agent ────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  if (!core.repo.agentMetaRepo.exists(id)) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const config = (core.repo.agentMetaRepo.readMeta(id) || {}) as AgentConfig
  const enabledSlugs = new Set(config.skills || [])
  const allSkills = await core.common.skillSymlinks.listAllSkills()
  const skills = allSkills.map(s => ({
    slug: s.slug,
    enabled: enabledSlugs.has(s.slug),
    hasSkillMd: s.hasSkillMd,
    source: s.source,
    description: s.description,
  }))

  return NextResponse.json({
    skills,
    enabledCount: enabledSlugs.size,
    totalCount: skills.length,
  })
}

// ── PUT: Update enabled skills for an agent ──────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  if (!core.repo.agentMetaRepo.exists(id)) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const body = await req.json()
  const { skills } = body as { skills: string[] }

  if (!Array.isArray(skills)) {
    return NextResponse.json({ error: 'skills must be an array of slugs' }, { status: 400 })
  }

  // Validate all slugs exist
  const allSkills = await core.common.skillSymlinks.listAllSkills()
  const allSlugs = new Set(allSkills.map(s => s.slug))
  const validSlugs = skills.filter(s => allSlugs.has(s))

  const config = (core.repo.agentMetaRepo.readMeta(id) || {}) as AgentConfig
  config.skills = validSlugs
  core.repo.agentMetaRepo.writeMeta(id, config as Record<string, unknown>)
  await core.common.skillSymlinks.syncSkillSymlinks(id, validSlugs)

  return NextResponse.json({ skills: validSlugs, synced: true })
}
