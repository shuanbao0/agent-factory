import { NextResponse } from 'next/server'
import { cached } from '@/lib/api-cache'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

interface SkillInfo {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  source: 'builtin' | 'project' | 'clawhub'
}

export async function GET() {
  try {
    const result = await cached('skills:local', 30000, async () => {
      const allSkills = await core.common.skillSymlinks.listAllSkills()

      const projectSkills: SkillInfo[] = []
      const builtinSkills: SkillInfo[] = []

      for (const s of allSkills) {
        const info: SkillInfo = {
          id: s.slug,
          name: s.slug,
          description: s.description,
          version: '1.0.0',
          enabled: true,
          source: s.source as 'builtin' | 'project',
        }
        if (s.source === 'project') {
          projectSkills.push(info)
        } else {
          builtinSkills.push(info)
        }
      }

      return {
        skills: allSkills.map(s => ({
          id: s.slug,
          name: s.slug,
          description: s.description,
          version: '1.0.0',
          enabled: true,
          source: s.source as 'builtin' | 'project',
        })),
        builtinCount: builtinSkills.length,
        projectCount: projectSkills.length,
        builtinDir: null,
        source: 'filesystem' as const,
      }
    })

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e), skills: [], source: 'error' }, { status: 500 })
  }
}
