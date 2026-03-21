'use strict'
/**
 * ProjectStandards — 项目标准解析 + 注入
 *
 * 解析 config/project-standards.md，注入 STANDARDS.md 到项目目录。
 * 使用 HTML 注释 marker 包裹，支持幂等更新。
 */
const { readFileSync, existsSync } = require('fs')
const { join } = require('path')
const { projectMetaRepo } = require('../repo/project-meta.cjs')
const { PROJECT_STANDARDS_FILE: STANDARDS_PATH, PROJECTS_DIR } = require('./paths.cjs')
const logger = require('./logger.cjs')

const MARKER_BEGIN = '<!-- PROJECT-STANDARDS:BEGIN -->'
const MARKER_END = '<!-- PROJECT-STANDARDS:END -->'

// ── Parsing ───────────────────────────────────────────────────

/**
 * Parse raw project-standards.md into { lifecycle, boundaries }.
 * @param {string} raw
 * @returns {{ lifecycle: string, boundaries: string }}
 */
function parseProjectStandards(raw) {
  const sections = {}
  const sectionPattern = /^## (LIFECYCLE|BOUNDARIES)\s*$/gm
  const matches = []
  let m
  while ((m = sectionPattern.exec(raw)) !== null) {
    matches.push(m)
  }

  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1]
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length
    sections[key] = raw.slice(start, end).trim()
  }

  return {
    lifecycle: sections['LIFECYCLE'] || '',
    boundaries: sections['BOUNDARIES'] || '',
  }
}

/**
 * Extract standards for a specific lifecycle phase.
 * @param {string} lifecycle - The lifecycle section content
 * @param {string} phaseKey - Phase key (requirements, design, development, testing, delivery)
 * @returns {string|null}
 */
function getPhaseStandards(lifecycle, phaseKey) {
  if (!lifecycle || !phaseKey) return null

  const pattern = new RegExp(`^### ${phaseKey}\\s*$`, 'gm')
  const match = pattern.exec(lifecycle)
  if (!match) return null

  const start = match.index + match[0].length
  const nextSection = lifecycle.indexOf('\n### ', start)
  const end = nextSection !== -1 ? nextSection : lifecycle.length

  return lifecycle.slice(start, end).trim() || null
}

/**
 * Build STANDARDS.md content for a project.
 * @param {{ lifecycle: string, boundaries: string }} parsed
 * @param {object} [projectMeta] - Project metadata for phase-specific info
 * @returns {string}
 */
function buildProjectStandardsMd(parsed, projectMeta) {
  const parts = []
  parts.push(MARKER_BEGIN)
  parts.push('# 项目执行标准\n')

  if (parsed.lifecycle) {
    parts.push('## 生命周期标准\n')

    // If project has phases, highlight current phase
    if (projectMeta?.currentPhase && projectMeta?.phases) {
      const phaseIndex = projectMeta.currentPhase - 1
      const currentPhase = projectMeta.phases[phaseIndex]
      if (currentPhase) {
        parts.push(`> 当前阶段: **${currentPhase.labelZh || currentPhase.labelEn || `Phase ${projectMeta.currentPhase}`}**\n`)
      }
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

// ── Injection ─────────────────────────────────────────────────

/**
 * Strip existing marker block from content.
 * @param {string} content
 * @returns {string}
 */
function stripMarkerBlock(content) {
  const startIdx = content.indexOf(MARKER_BEGIN)
  if (startIdx === -1) return content
  const endIdx = content.indexOf(MARKER_END, startIdx)
  if (endIdx === -1) return content

  const before = content.slice(0, startIdx)
  const after = content.slice(endIdx + MARKER_END.length)
  const cleaned = after.replace(/^\n{1,2}/, '\n')
  return (before + cleaned).replace(/^\n+/, '')
}

/**
 * Inject STANDARDS.md into a project directory (idempotent).
 * @param {string} projectId - Project ID (e.g. "novel/default")
 */
function injectStandardsForProject(projectId) {
  if (!existsSync(STANDARDS_PATH)) {
    logger.debug('project-standards', 'No project-standards.md found, skipping')
    return
  }

  const raw = readFileSync(STANDARDS_PATH, 'utf-8')
  const parsed = parseProjectStandards(raw)
  if (!parsed.lifecycle && !parsed.boundaries) return

  const meta = projectMetaRepo.readMeta(projectId)
  const standardsMd = buildProjectStandardsMd(parsed, meta)

  // Read existing STANDARDS.md if present, strip old block
  const existingPath = join(PROJECTS_DIR, projectId, 'STANDARDS.md')
  let content = ''
  if (existsSync(existingPath)) {
    content = readFileSync(existingPath, 'utf-8')
    content = stripMarkerBlock(content).trim()
  }

  // Prepend standards block
  const result = content ? standardsMd + '\n' + content + '\n' : standardsMd
  projectMetaRepo.writeProjectFile(projectId, 'STANDARDS.md', result)

  logger.debug('project-standards', 'Standards injected', { projectId })
}

// ── Cache ─────────────────────────────────────────────────────

let _cache = null
let _cacheMtime = 0

/**
 * Load and cache parsed project standards.
 * @returns {{ lifecycle: string, boundaries: string }|null}
 */
function loadProjectStandards() {
  if (!existsSync(STANDARDS_PATH)) return null

  try {
    const stat = require('fs').statSync(STANDARDS_PATH)
    const mtime = stat.mtimeMs
    if (_cache && _cacheMtime === mtime) return _cache

    const raw = readFileSync(STANDARDS_PATH, 'utf-8')
    _cache = parseProjectStandards(raw)
    _cacheMtime = mtime
    return _cache
  } catch {
    return null
  }
}

module.exports = {
  parseProjectStandards,
  getPhaseStandards,
  buildProjectStandardsMd,
  injectStandardsForProject,
  stripMarkerBlock,
  loadProjectStandards,
  MARKER_BEGIN,
  MARKER_END,
}
