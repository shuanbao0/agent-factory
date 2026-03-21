'use strict'
/**
 * SkillSymlinks — 技能 symlink 同步
 *
 * 管理 agents/{id}/skills/ 下的符号链接，指向 skills/ 或 openclaw builtin skills
 */
const { existsSync, readdirSync, readFileSync, lstatSync, unlinkSync, symlinkSync } = require('fs')
const { join } = require('path')
const { execFile: execFileCb } = require('child_process')
const { promisify } = require('util')
const { agentMetaRepo } = require('../repo/agent-meta.cjs')

const execFileAsync = promisify(execFileCb)

const { PROJECT_ROOT, SKILLS_DIR: PROJECT_SKILLS_DIR, AGENTS_DIR } = require('./paths.cjs')
const logger = require('./logger.cjs')

/** Cached result for builtin skills directory */
let cachedBuiltinDir = undefined

/**
 * Find OpenClaw built-in skills directory
 * @returns {Promise<string|null>}
 */
async function findBuiltinSkillsDir() {
  if (cachedBuiltinDir !== undefined) return cachedBuiltinDir

  try {
    const { stdout } = await execFileAsync('npm', ['root', '-g'], { timeout: 5000 })
    const dir = join(stdout.toString().trim(), 'openclaw', 'skills')
    if (existsSync(dir)) {
      cachedBuiltinDir = dir
      return dir
    }
  } catch { /* skip */ }

  const candidates = [
    '/opt/homebrew/lib/node_modules/openclaw/skills',
    '/usr/local/lib/node_modules/openclaw/skills',
    join(PROJECT_ROOT, 'node_modules/openclaw/skills'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) {
      cachedBuiltinDir = c
      return c
    }
  }
  cachedBuiltinDir = null
  return null
}

/**
 * Resolve the actual directory for a skill slug
 * @param {string} slug
 * @returns {Promise<string|null>}
 */
async function resolveSkillDir(slug) {
  const projectPath = join(PROJECT_SKILLS_DIR, slug)
  if (existsSync(projectPath)) return projectPath
  const builtinDir = await findBuiltinSkillsDir()
  if (builtinDir) {
    const builtinPath = join(builtinDir, slug)
    if (existsSync(builtinPath)) return builtinPath
  }
  return null
}

/**
 * Sync symlinks in agents/{id}/skills/ to match enabled list
 * @param {string} agentId
 * @param {string[]} enabledSlugs
 */
async function syncSkillSymlinks(agentId, enabledSlugs) {
  agentMetaRepo.ensureAgentDir(agentId, 'skills')
  const agentSkillsDir = join(AGENTS_DIR, agentId, 'skills')

  // Remove existing symlinks
  for (const entry of readdirSync(agentSkillsDir, { withFileTypes: true })) {
    const fullPath = join(agentSkillsDir, entry.name)
    try {
      if (lstatSync(fullPath).isSymbolicLink()) unlinkSync(fullPath)
    } catch { /* skip */ }
  }

  // Create symlinks for enabled skills
  for (const slug of enabledSlugs) {
    const sourcePath = await resolveSkillDir(slug)
    const linkPath = join(agentSkillsDir, slug)
    if (sourcePath && !existsSync(linkPath)) {
      try { symlinkSync(sourcePath, linkPath, 'dir') } catch { logger.debug('skill-symlinks', 'Symlink creation failed', { slug }) }
    }
  }
}

/**
 * List all available skills from builtin and project directories
 * @returns {Promise<Array<{slug: string, source: string, hasSkillMd: boolean, description: string}>>}
 */
async function listAllSkills() {
  const skills = []
  const seen = new Set()

  // Project skills first (higher priority)
  if (existsSync(PROJECT_SKILLS_DIR)) {
    for (const d of readdirSync(PROJECT_SKILLS_DIR, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue
      seen.add(d.name)
      skills.push({
        slug: d.name,
        source: 'project',
        hasSkillMd: existsSync(join(PROJECT_SKILLS_DIR, d.name, 'SKILL.md')),
        description: _extractDescription(join(PROJECT_SKILLS_DIR, d.name)),
      })
    }
  }

  // Builtin skills
  const builtinDir = await findBuiltinSkillsDir()
  if (builtinDir) {
    for (const d of readdirSync(builtinDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('.') || seen.has(d.name)) continue
      seen.add(d.name)
      skills.push({
        slug: d.name,
        source: 'builtin',
        hasSkillMd: existsSync(join(builtinDir, d.name, 'SKILL.md')),
        description: _extractDescription(join(builtinDir, d.name)),
      })
    }
  }

  skills.sort((a, b) => a.slug.localeCompare(b.slug))
  return skills
}

function _extractDescription(dir) {
  const skillMd = join(dir, 'SKILL.md')
  if (existsSync(skillMd)) {
    try {
      const content = readFileSync(skillMd, 'utf-8')
      for (const line of content.split('\n')) {
        const t = line.trim()
        if (t && !t.startsWith('#') && !t.startsWith('```') && !t.startsWith('---')) {
          return t.slice(0, 150)
        }
      }
    } catch { /* skip */ }
  }
  return ''
}

module.exports = {
  findBuiltinSkillsDir,
  resolveSkillDir,
  syncSkillSymlinks,
  listAllSkills,
}
