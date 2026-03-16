import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { logError } from '@/lib/error-logger'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')

/** Parse SKILL.md frontmatter to extract name, description, required bins */
function parseSkillMeta(skillMd: string): { name: string; description: string; bins: string[] } {
  const fmMatch = skillMd.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return { name: '', description: '', bins: [] }
  const fm = fmMatch[1]
  const name = fm.match(/^name:\s*(.+)/m)?.[1]?.trim().replace(/['"]/g, '') || ''
  const description = fm.match(/^description:\s*"?(.+?)"?\s*$/m)?.[1]?.trim() || ''
  const binsMatch = fm.match(/"bins":\s*\[([^\]]+)\]/)
  const bins = binsMatch
    ? binsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean)
    : []
  return { name, description, bins }
}

/** Generate TOOLS.md content from skills in agent.json */
function generateToolsMd(agentId: string, skills: string[], agentDir: string): string {
  const lines: string[] = [`# TOOLS.md — ${agentId} Agent`, '']

  if (skills.length === 0) {
    lines.push('No skills configured for this agent.', '', '---')
    lines.push('_Auto-generated on deploy. Edit agent.json skills[] to update._')
    return lines.join('\n')
  }

  lines.push('## Available Skills', '')

  for (const slug of skills) {
    const skillMdPath = join(agentDir, 'skills', slug, 'SKILL.md')
    if (existsSync(skillMdPath)) {
      try {
        const { name, description, bins } = parseSkillMeta(readFileSync(skillMdPath, 'utf-8'))
        lines.push(`### ${name || slug}`)
        if (description) lines.push(description)
        if (bins.length > 0) lines.push(`- **Requires:** ${bins.map(b => `\`${b}\``).join(', ')} on PATH`)
        lines.push(`- Full docs: \`skills/${slug}/SKILL.md\``, '')
        continue
      } catch (err) { logError('agents-deploy/parse-skill-md', err) }
    }
    lines.push(`### ${slug}`, `- Full docs: \`skills/${slug}/SKILL.md\``, '')
  }

  lines.push('---')
  lines.push('_Auto-generated from agent.json skills[]. Run "Sync Config" to regenerate._')
  return lines.join('\n')
}

/**
 * POST /api/agents/deploy
 *
 * sync-config action: regenerate TOOLS.md in agents/{id}/ from agent.json skills[].
 * Deploy/undeploy are handled atomically by POST/DELETE /api/agents.
 */
export async function POST(req: NextRequest) {
  try {
    const { agentId, action } = await req.json() as {
      agentId: string
      action: 'sync-config'
    }

    if (!agentId || action !== 'sync-config') {
      return NextResponse.json({ error: 'agentId and action "sync-config" required' }, { status: 400 })
    }

    const agentDir = join(AGENTS_DIR, agentId)
    if (!existsSync(agentDir)) {
      return NextResponse.json({ error: `Agent directory not found: agents/${agentId}` }, { status: 404 })
    }

    const synced: string[] = []

    // TOOLS.md — regenerate from skills
    let agentSkills: string[] = []
    const agentJsonPath = join(agentDir, 'agent.json')
    if (existsSync(agentJsonPath)) {
      try { agentSkills = JSON.parse(readFileSync(agentJsonPath, 'utf-8')).skills || [] } catch (err) { logError('agents-deploy/read-agent-skills', err) }
    }
    const toolsMdContent = generateToolsMd(agentId, agentSkills, agentDir)
    writeFileSync(join(agentDir, 'TOOLS.md'), toolsMdContent)
    synced.push('TOOLS.md')

    return NextResponse.json({ ok: true, action: 'sync-config', agentId, synced })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
