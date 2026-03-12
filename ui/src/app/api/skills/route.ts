import { NextResponse } from 'next/server'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { cached } from '@/lib/api-cache'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = process.env.AGENT_FACTORY_DIR || join(process.cwd(), '..')
const PROJECT_SKILLS_DIR = join(PROJECT_ROOT, 'skills')

/** Try to find OpenClaw's built-in skills directory */
function findBuiltinSkillsDir(): string | null {
  // Try to find openclaw via npm root
  try {
    const openclawRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 5000 }).trim()
    const dir = join(openclawRoot, 'openclaw', 'skills')
    if (existsSync(dir)) return dir
  } catch {}

  // Fallback: common locations
  const candidates = [
    '/opt/homebrew/lib/node_modules/openclaw/skills',
    '/usr/local/lib/node_modules/openclaw/skills',
    join(process.env.HOME || '', '.npm-global/lib/node_modules/openclaw/skills'),
    join(process.env.HOME || '', 'projects/agent-factory/node_modules/openclaw/skills'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

interface SkillInfo {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  source: 'builtin' | 'project' | 'clawhub'
}

function readSkillsFromDir(dir: string, source: SkillInfo['source']): SkillInfo[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => {
      let description = ''

      // Try SKILL.md first (most skills have this)
      const skillMdPath = join(dir, d.name, 'SKILL.md')
      const readmePath = join(dir, d.name, 'README.md')

      if (existsSync(skillMdPath)) {
        const content = readFileSync(skillMdPath, 'utf-8')
        // Extract first non-heading, non-empty line as description
        const lines = content.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```')) {
            description = trimmed.slice(0, 200)
            break
          }
        }
      } else if (existsSync(readmePath)) {
        const content = readFileSync(readmePath, 'utf-8')
        const firstPara = content.split('\n\n')[1]
        if (firstPara) description = firstPara.trim().slice(0, 200)
      }

      return {
        id: d.name,
        name: d.name,
        description,
        version: '1.0.0',
        enabled: true,
        source,
      }
    })
}

export async function GET() {
  try {
    const result = await cached('skills:local', 30000, async () => {
      const builtinDir = findBuiltinSkillsDir()
      const builtinSkills = builtinDir ? readSkillsFromDir(builtinDir, 'builtin') : []
      const projectSkills = readSkillsFromDir(PROJECT_SKILLS_DIR, 'project')

      // Deduplicate: project skills override builtin
      const seen = new Set<string>()
      const all: SkillInfo[] = []

      for (const s of projectSkills) {
        seen.add(s.id)
        all.push(s)
      }
      for (const s of builtinSkills) {
        if (!seen.has(s.id)) {
          seen.add(s.id)
          all.push(s)
        }
      }

      // Sort alphabetically
      all.sort((a, b) => a.name.localeCompare(b.name))

      return {
        skills: all,
        builtinCount: builtinSkills.length,
        projectCount: projectSkills.length,
        builtinDir,
        source: 'filesystem' as const,
      }
    })

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e), skills: [], source: 'error' }, { status: 500 })
  }
}
