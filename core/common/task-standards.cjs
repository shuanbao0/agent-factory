'use strict'
/**
 * TaskStandards — 任务标准解析
 *
 * 解析 config/task-standards.md，提供按任务类型的标准和检查清单。
 * 内部缓存解析结果（基于文件 mtime）。
 */
const { readFileSync, existsSync, statSync } = require('fs')
const { join, resolve } = require('path')

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const STANDARDS_PATH = join(PROJECT_ROOT, 'config', 'task-standards.md')

// ── Parsing ───────────────────────────────────────────────────

/**
 * Parse raw task-standards.md into { general, types }.
 * @param {string} raw
 * @returns {{ general: string, types: string }}
 */
function parseTaskStandards(raw) {
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
 * Extract standards for a specific task type from the TYPES section.
 * @param {string} types - The TYPES section content
 * @param {string} taskType - Task type key (writing, coding, research, etc.)
 * @returns {string|null}
 */
function getTaskTypeStandards(types, taskType) {
  if (!types || !taskType) return null

  const pattern = new RegExp(`^### ${taskType}\\s*$`, 'gm')
  const match = pattern.exec(types)
  if (!match) return null

  const start = match.index + match[0].length
  const nextSection = types.indexOf('\n### ', start)
  const end = nextSection !== -1 ? nextSection : types.length

  return types.slice(start, end).trim() || null
}

/**
 * Get the general standards section.
 * @param {string} general - The GENERAL section content
 * @returns {string}
 */
function getGeneralStandards(general) {
  return general || ''
}

/**
 * Extract quality checklist items from a standards text block.
 * Looks for numbered list items under "质量检查清单" heading.
 * @param {string} standardsText
 * @returns {string[]}
 */
function extractChecklist(standardsText) {
  if (!standardsText) return []

  // Find checklist section (either "质量检查清单" or numbered items after it)
  const checklistMatch = standardsText.match(/\*\*质量检查清单[：:]\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n### |$)/)
    || standardsText.match(/### 质量检查清单\s*\n([\s\S]*?)(?=\n### |$)/)

  const content = checklistMatch ? checklistMatch[1] : standardsText

  // Extract numbered items
  const items = []
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)/)
    if (match) {
      items.push(match[1].trim())
    }
  }

  return items
}

// ── Cache ─────────────────────────────────────────────────────

let _cache = null
let _cacheMtime = 0

/**
 * Load and cache parsed task standards.
 * @returns {{ general: string, types: string }|null}
 */
function loadTaskStandards() {
  if (!existsSync(STANDARDS_PATH)) return null

  try {
    const mtime = statSync(STANDARDS_PATH).mtimeMs
    if (_cache && _cacheMtime === mtime) return _cache

    const raw = readFileSync(STANDARDS_PATH, 'utf-8')
    _cache = parseTaskStandards(raw)
    _cacheMtime = mtime
    return _cache
  } catch {
    return null
  }
}

/**
 * Get full standards text for a task type (type-specific + general fallback).
 * @param {string} taskType
 * @returns {{ typeStandards: string|null, generalStandards: string, checklist: string[] }}
 */
function getStandardsForType(taskType) {
  const parsed = loadTaskStandards()
  if (!parsed) return { typeStandards: null, generalStandards: '', checklist: [] }

  const typeStandards = getTaskTypeStandards(parsed.types, taskType)
  const generalStandards = getGeneralStandards(parsed.general)

  // Extract checklist: prefer type-specific, fallback to general
  const checklist = typeStandards
    ? extractChecklist(typeStandards)
    : extractChecklist(generalStandards)

  return { typeStandards, generalStandards, checklist }
}

module.exports = {
  parseTaskStandards,
  getTaskTypeStandards,
  getGeneralStandards,
  extractChecklist,
  loadTaskStandards,
  getStandardsForType,
}
