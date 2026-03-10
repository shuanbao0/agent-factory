import { existsSync, readdirSync, mkdirSync, symlinkSync, unlinkSync, lstatSync } from 'fs'
import { join, resolve } from 'path'
import { execSync } from 'child_process'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const PROJECT_SKILLS_DIR = join(PROJECT_ROOT, 'skills')

/** Find OpenClaw built-in skills directory */
export function findBuiltinSkillsDir(): string | null {
  // Try to find openclaw via npm root
  try {
    const openclawRoot = execSync(
      'npm root -g',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim()
    const dir = join(openclawRoot, 'openclaw', 'skills')
    if (existsSync(dir)) return dir
  } catch {}
  // Fallback to common global paths
  const candidates = [
    '/opt/homebrew/lib/node_modules/openclaw/skills',
    '/usr/local/lib/node_modules/openclaw/skills',
    join(PROJECT_ROOT, 'node_modules/openclaw/skills'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

/** Resolve the actual directory for a skill slug */
export function resolveSkillDir(slug: string): string | null {
  const projectPath = join(PROJECT_SKILLS_DIR, slug)
  if (existsSync(projectPath)) return projectPath
  const builtinDir = findBuiltinSkillsDir()
  if (builtinDir) {
    const builtinPath = join(builtinDir, slug)
    if (existsSync(builtinPath)) return builtinPath
  }
  return null
}

/** Sync symlinks in agents/{id}/skills/ to match enabled list */
export function syncSkillSymlinks(agentId: string, enabledSlugs: string[]) {
  const agentSkillsDir = join(AGENTS_DIR, agentId, 'skills')
  if (!existsSync(agentSkillsDir)) mkdirSync(agentSkillsDir, { recursive: true })

  // Remove existing symlinks
  for (const entry of readdirSync(agentSkillsDir, { withFileTypes: true })) {
    const fullPath = join(agentSkillsDir, entry.name)
    try {
      if (lstatSync(fullPath).isSymbolicLink()) unlinkSync(fullPath)
    } catch {}
  }

  // Create symlinks for enabled skills
  for (const slug of enabledSlugs) {
    const sourcePath = resolveSkillDir(slug)
    const linkPath = join(agentSkillsDir, slug)
    if (sourcePath && !existsSync(linkPath)) {
      try { symlinkSync(sourcePath, linkPath, 'dir') } catch {}
    }
  }
}
