'use strict'
/**
 * DeptTemplateRepository — 部门模板读取
 *
 * builtin: templates/departments/builtin/{id}/（源码）
 * custom:  data/templates/departments/custom/{id}/（运行时）
 */
const { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')
const { BUILTIN_DEPT_TEMPLATES_DIR, CUSTOM_DEPT_TEMPLATES_DIR } = require('../common/paths.cjs')

/** category → directory mapping */
const CATEGORY_DIRS = {
  builtin: join(BUILTIN_DEPT_TEMPLATES_DIR, 'builtin'),
  custom: CUSTOM_DEPT_TEMPLATES_DIR,
}

/**
 * Read a single department template by ID.
 * @param {string} id - Template ID
 * @returns {object|null}
 */
function readDeptTemplate(id) {
  for (const [category, baseDir] of Object.entries(CATEGORY_DIRS)) {
    const templatePath = join(baseDir, id, 'template.json')
    if (!existsSync(templatePath)) continue

    try {
      const data = JSON.parse(readFileSync(templatePath, 'utf-8'))
      return {
        id: data.id || id,
        name: data.name || id,
        nameEn: data.nameEn || data.name || id,
        description: data.description || '',
        descriptionEn: data.descriptionEn || data.description || '',
        emoji: data.emoji || '🏢',
        category,
        recommendedAgents: data.recommendedAgents || [],
        defaults: data.defaults || {},
      }
    } catch {
      return null
    }
  }
  return null
}

/**
 * Get the absolute directory path for a department template.
 * @param {string} id - Template ID
 * @returns {string|null}
 */
function getDeptTemplateDir(id) {
  for (const baseDir of Object.values(CATEGORY_DIRS)) {
    const dir = join(baseDir, id)
    if (existsSync(dir)) return dir
  }
  return null
}

/**
 * Read a file from a department template directory.
 * @param {string} tmplDir - Template directory absolute path
 * @param {string} filename - File name (e.g. 'mission.md')
 * @returns {string|null}
 */
function readDeptTemplateFile(tmplDir, filename) {
  try {
    const p = join(tmplDir, filename)
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  } catch { /* skip */ }
  return null
}

/**
 * List all department templates from builtin and custom directories.
 * @returns {Array<object>}
 */
function listDeptTemplates() {
  const templates = []
  for (const [, baseDir] of Object.entries(CATEGORY_DIRS)) {
    if (!existsSync(baseDir)) continue
    let dirs
    try { dirs = readdirSync(baseDir, { withFileTypes: true }).filter(d => d.isDirectory()) } catch { continue }
    for (const d of dirs) {
      const t = readDeptTemplate(d.name)
      if (t) templates.push(t)
    }
  }
  return templates
}

/**
 * Create a custom department template.
 * @param {string} id - Template ID
 * @param {object} data - Template data (will be written as template.json)
 */
function createCustomDeptTemplate(id, data) {
  const templateDir = join(CUSTOM_DEPT_TEMPLATES_DIR, id)
  if (!existsSync(templateDir)) mkdirSync(templateDir, { recursive: true })
  writeFileSync(join(templateDir, 'template.json'), JSON.stringify(data, null, 2) + '\n')
}

module.exports = { readDeptTemplate, getDeptTemplateDir, readDeptTemplateFile, listDeptTemplates, createCustomDeptTemplate }
