'use strict'
/**
 * PhaseDeliverables — 阶段交付物模板解析 + 生成
 *
 * 项目进入新阶段时，自动生成该阶段的交付物骨架文件。
 * 部门可通过 config.json 的 workflow.phaseDeliverables 覆盖通用模板。
 *
 * 文件格式：config/phase-deliverables.md
 *   ## UNIVERSAL
 *   ### {phaseKey}
 *   #### {filepath}
 *   ```
 *   (template content)
 *   ```
 */
const { readFileSync, existsSync, statSync } = require('fs')
const { join, resolve } = require('path')
const { projectMetaRepo } = require('../repo/project-meta.cjs')

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const DELIVERABLES_PATH = join(PROJECT_ROOT, 'config', 'phase-deliverables.md')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

// ── Parsing ───────────────────────────────────────────────────

/**
 * Parse phase-deliverables.md into { [phaseKey]: Array<{path, template}> }
 * @param {string} raw
 * @returns {Record<string, Array<{path: string, template: string}>>}
 */
function parsePhaseDeliverables(raw) {
  const result = {}

  // Find ## UNIVERSAL section
  const universalMatch = raw.match(/^## UNIVERSAL\s*$/m)
  if (!universalMatch) return result
  const content = raw.slice(universalMatch.index + universalMatch[0].length)

  // Split by ### {phaseKey}
  const phasePattern = /^### (\S+)\s*$/gm
  const phaseMatches = []
  let m
  while ((m = phasePattern.exec(content)) !== null) {
    phaseMatches.push(m)
  }

  for (let i = 0; i < phaseMatches.length; i++) {
    const phaseKey = phaseMatches[i][1]
    const start = phaseMatches[i].index + phaseMatches[i][0].length
    const end = i + 1 < phaseMatches.length ? phaseMatches[i + 1].index : content.length
    const phaseContent = content.slice(start, end)

    // Split by #### {filepath}
    const filePattern = /^#### (\S+)\s*$/gm
    const fileMatches = []
    let fm
    while ((fm = filePattern.exec(phaseContent)) !== null) {
      fileMatches.push(fm)
    }

    const deliverables = []
    for (let j = 0; j < fileMatches.length; j++) {
      const filePath = fileMatches[j][1]
      const fStart = fileMatches[j].index + fileMatches[j][0].length
      const fEnd = j + 1 < fileMatches.length ? fileMatches[j + 1].index : phaseContent.length
      const block = phaseContent.slice(fStart, fEnd)

      // Extract content from fenced code block
      const codeMatch = block.match(/```\n?([\s\S]*?)```/)
      if (codeMatch) {
        deliverables.push({ path: filePath, template: codeMatch[1].trimEnd() })
      }
    }

    if (deliverables.length > 0) {
      result[phaseKey] = deliverables
    }
  }

  return result
}

// ── Cache ─────────────────────────────────────────────────────

let _cache = null
let _cacheMtime = 0

/**
 * Load and cache parsed phase deliverables.
 * @returns {Record<string, Array<{path: string, template: string}>>|null}
 */
function loadPhaseDeliverables() {
  if (!existsSync(DELIVERABLES_PATH)) return null
  try {
    const mtime = statSync(DELIVERABLES_PATH).mtimeMs
    if (_cache && _cacheMtime === mtime) return _cache
    const raw = readFileSync(DELIVERABLES_PATH, 'utf-8')
    _cache = parsePhaseDeliverables(raw)
    _cacheMtime = mtime
    return _cache
  } catch {
    return null
  }
}

// ── Template interpolation ────────────────────────────────────

/**
 * Replace placeholders in template.
 * @param {string} template
 * @param {Record<string, string>} vars
 * @returns {string}
 */
function interpolateTemplate(template, vars) {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}

// ── Generation ────────────────────────────────────────────────

/**
 * Get deliverables for a phase (dept override → universal fallback).
 * @param {string} phaseKey
 * @param {object} [deptConfig]
 * @returns {Array<{path: string, template: string}>}
 */
function getDeliverablesForPhase(phaseKey, deptConfig) {
  // 1. Department override
  const deptDeliverables = deptConfig?.workflow?.phaseDeliverables?.[phaseKey]
  if (Array.isArray(deptDeliverables) && deptDeliverables.length > 0) {
    return deptDeliverables
  }

  // 2. Universal from config file
  const universal = loadPhaseDeliverables()
  if (universal && universal[phaseKey]) {
    return universal[phaseKey]
  }

  return []
}

/**
 * Generate deliverable template files for a project phase.
 * Idempotent — skips files that already exist.
 *
 * @param {string} projectId
 * @param {string} phaseKey - Phase key (e.g. 'requirements', 'design')
 * @param {object} projectMeta - Project metadata
 * @param {object} [deptConfig] - Department config (for overrides)
 * @returns {string[]} List of generated file paths
 */
function generatePhaseDeliverables(projectId, phaseKey, projectMeta, deptConfig) {
  const deliverables = getDeliverablesForPhase(phaseKey, deptConfig)
  if (deliverables.length === 0) return []

  const vars = {
    projectName: projectMeta?.name || projectId,
    date: new Date().toISOString().split('T')[0],
    phaseKey: phaseKey,
    projectId: projectId,
  }

  const generated = []
  for (const { path: filePath, template } of deliverables) {
    // Idempotent: skip if file already exists
    const fullPath = join(PROJECTS_DIR, projectId, filePath)
    if (existsSync(fullPath)) continue

    const content = interpolateTemplate(template, vars)
    projectMetaRepo.writeProjectFile(projectId, filePath, content + '\n')
    generated.push(filePath)
  }

  return generated
}

module.exports = {
  parsePhaseDeliverables,
  loadPhaseDeliverables,
  getDeliverablesForPhase,
  generatePhaseDeliverables,
  interpolateTemplate,
}
