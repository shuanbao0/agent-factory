'use strict'
/**
 * DeptStandards — 部门执行标准解析
 *
 * 解析 config/dept-standards.md，提供按部门类型的执行标准。
 * 内部缓存解析结果（基于文件 mtime）。
 *
 * 两层标准：
 *   1. config/dept-standards.md — 全局（GENERAL + TYPES）
 *   2. data/departments/{id}/standards.md — 部门自定义（可选）
 */
const { readFileSync, existsSync, statSync } = require('fs')
const { join } = require('path')
const { DEPT_STANDARDS_FILE: STANDARDS_PATH, DEPARTMENTS_DIR } = require('./paths.cjs')

// ── Parsing ───────────────────────────────────────────────────

/**
 * Parse raw dept-standards.md into { general, types }.
 * @param {string} raw
 * @returns {{ general: string, types: string }}
 */
function parseDeptStandards(raw) {
  const sections = {}
  const sectionPattern = /^## (GENERAL|TYPES)\s*$/gm
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
    general: sections['GENERAL'] || '',
    types: sections['TYPES'] || '',
  }
}

/**
 * Extract standards for a specific department type from the TYPES section.
 * @param {string} types - The TYPES section content
 * @param {string} deptType - Department type key (novel, dev, finance, etc.)
 * @returns {string|null}
 */
function getDeptTypeStandards(types, deptType) {
  if (!types || !deptType) return null

  const pattern = new RegExp(`^### ${deptType}\\s*$`, 'gm')
  const match = pattern.exec(types)
  if (!match) return null

  const start = match.index + match[0].length
  const nextSection = types.indexOf('\n### ', start)
  const end = nextSection !== -1 ? nextSection : types.length

  return types.slice(start, end).trim() || null
}

// ── Cache ─────────────────────────────────────────────────────

let _cache = null
let _cacheMtime = 0

/**
 * Load and cache parsed department standards.
 * @returns {{ general: string, types: string }|null}
 */
function loadDeptStandards() {
  if (!existsSync(STANDARDS_PATH)) return null

  try {
    const mtime = statSync(STANDARDS_PATH).mtimeMs
    if (_cache && _cacheMtime === mtime) return _cache

    const raw = readFileSync(STANDARDS_PATH, 'utf-8')
    _cache = parseDeptStandards(raw)
    _cacheMtime = mtime
    return _cache
  } catch {
    return null
  }
}

/**
 * Load per-department custom standards (optional file).
 * @param {string} deptId
 * @returns {string}
 */
function loadPerDeptStandards(deptId) {
  if (!deptId) return ''
  const filePath = join(DEPARTMENTS_DIR, deptId, 'standards.md')
  try {
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8')
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return ''
}

/**
 * Get combined standards for a department.
 * Merge order: GENERAL (base) + TYPES/{deptId} (type-specific) + per-dept custom.
 * @param {string} deptId
 * @returns {{ generalStandards: string, typeStandards: string|null, customStandards: string }}
 */
function getStandardsForDept(deptId) {
  const parsed = loadDeptStandards()
  if (!parsed) return { generalStandards: '', typeStandards: null, customStandards: '' }

  const generalStandards = parsed.general
  const typeStandards = getDeptTypeStandards(parsed.types, deptId)
  const customStandards = loadPerDeptStandards(deptId)

  return { generalStandards, typeStandards, customStandards }
}

module.exports = {
  parseDeptStandards,
  getDeptTypeStandards,
  loadDeptStandards,
  loadPerDeptStandards,
  getStandardsForDept,
}
