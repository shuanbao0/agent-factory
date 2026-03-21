#!/usr/bin/env node
/**
 * inject-project-standards.mjs
 *
 * Re-inject config/project-standards.md into all projects' STANDARDS.md.
 * Idempotent — strips old marker blocks before injecting.
 *
 * Usage:
 *   node scripts/inject-project-standards.mjs              # inject all projects
 *   node scripts/inject-project-standards.mjs novel/default # inject single project
 *   node scripts/inject-project-standards.mjs --dry-run     # preview only
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import paths from '../../core/common/paths.mjs'

const { PROJECT_ROOT: ROOT, PROJECTS_DIR, PROJECT_STANDARDS_FILE: STANDARDS_FILE } = paths

const DRY_RUN = process.argv.includes('--dry-run')
const targetId = process.argv.slice(2).find(a => !a.startsWith('--'))

const MARKER_BEGIN = '<!-- PROJECT-STANDARDS:BEGIN -->'
const MARKER_END = '<!-- PROJECT-STANDARDS:END -->'

// ── Parsing (mirrored from core/common/project-standards.cjs) ──

function parseProjectStandards(raw) {
  const sections = {}
  const sectionPattern = /^## (LIFECYCLE|BOUNDARIES)\s*$/gm
  const matches = []
  let m
  while ((m = sectionPattern.exec(raw)) !== null) matches.push(m)
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1]
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length
    sections[key] = raw.slice(start, end).trim()
  }
  return { lifecycle: sections['LIFECYCLE'] || '', boundaries: sections['BOUNDARIES'] || '' }
}

function stripMarkerBlock(content) {
  const si = content.indexOf(MARKER_BEGIN)
  if (si === -1) return content
  const ei = content.indexOf(MARKER_END, si)
  if (ei === -1) return content
  const before = content.slice(0, si)
  const after = content.slice(ei + MARKER_END.length).replace(/^\n{1,2}/, '\n')
  return (before + after).replace(/^\n+/, '')
}

function buildStandardsMd(parsed, meta) {
  const parts = []
  parts.push(MARKER_BEGIN)
  parts.push('# 项目执行标准\n')

  if (parsed.lifecycle) {
    parts.push('## 生命周期标准\n')
    if (meta?.currentPhase && meta?.phases) {
      const phase = meta.phases[meta.currentPhase - 1]
      if (phase) parts.push(`> 当前阶段: **${phase.labelZh || phase.labelEn || `Phase ${meta.currentPhase}`}**\n`)
    }
    parts.push(parsed.lifecycle)
  }

  if (parsed.boundaries) {
    parts.push('\n\n## 项目边界\n')
    parts.push(parsed.boundaries)
  }

  parts.push('\n' + MARKER_END)
  return parts.join('\n') + '\n'
}

// ── Discover projects ──

function discoverProjects() {
  if (!existsSync(PROJECTS_DIR)) return []
  const ids = []
  const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
  for (const dir of dirs) {
    const metaPath = join(PROJECTS_DIR, dir.name, '.project-meta.json')
    if (existsSync(metaPath)) ids.push(dir.name)
    // Sub-projects
    try {
      const subDirs = readdirSync(join(PROJECTS_DIR, dir.name), { withFileTypes: true })
        .filter(sd => sd.isDirectory() && !sd.name.startsWith('.'))
      for (const sd of subDirs) {
        const subMeta = join(PROJECTS_DIR, dir.name, sd.name, '.project-meta.json')
        if (existsSync(subMeta)) ids.push(`${dir.name}/${sd.name}`)
      }
    } catch { /* skip */ }
  }
  return ids
}

// ── Main ──

if (!existsSync(STANDARDS_FILE)) {
  console.error('config/project-standards.md not found')
  process.exit(1)
}

const raw = readFileSync(STANDARDS_FILE, 'utf-8')
const parsed = parseProjectStandards(raw)

const projectIds = targetId ? [targetId] : discoverProjects()

console.log(`${DRY_RUN ? '[DRY-RUN] ' : ''}Injecting project standards into ${projectIds.length} project(s)...\n`)

let count = 0
for (const id of projectIds) {
  const projectDir = join(PROJECTS_DIR, id)
  if (!existsSync(projectDir)) {
    console.log(`  SKIP ${id} (not found)`)
    continue
  }

  // Read project meta for phase info
  let meta = null
  try {
    const metaPath = join(projectDir, '.project-meta.json')
    if (existsSync(metaPath)) meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
  } catch { /* skip */ }

  const standardsMd = buildStandardsMd(parsed, meta)

  // Read existing STANDARDS.md, strip old block
  const standardsPath = join(projectDir, 'STANDARDS.md')
  let existing = ''
  if (existsSync(standardsPath)) {
    existing = stripMarkerBlock(readFileSync(standardsPath, 'utf-8')).trim()
  }

  const result = existing ? standardsMd + '\n' + existing + '\n' : standardsMd

  if (!DRY_RUN) {
    writeFileSync(standardsPath, result)
  }

  console.log(`  ${id}: STANDARDS.md ${existsSync(standardsPath) ? 'updated' : 'created'}`)
  count++
}

console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}Done. ${count} project(s) processed.`)
