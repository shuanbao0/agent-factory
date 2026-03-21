'use strict'
/**
 * DeptTemplateRepository — 部门模板读取
 *
 * 数据源：templates/departments/builtin/{id}/ 和 templates/departments/custom/{id}/
 */
const { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } = require('fs')
const { join, resolve } = require('path')

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const DEPT_TEMPLATES_DIR = join(PROJECT_ROOT, 'templates', 'departments')

const CATEGORIES = ['builtin', 'custom']

/**
 * Read a single department template by ID.
 * @param {string} id - Template ID
 * @returns {object|null}
 */
function readDeptTemplate(id) {
  for (const category of CATEGORIES) {
    const templatePath = join(DEPT_TEMPLATES_DIR, category, id, 'template.json')
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
  for (const category of CATEGORIES) {
    const dir = join(DEPT_TEMPLATES_DIR, category, id)
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
 * List all department templates from builtin/ and custom/ directories.
 * @returns {Array<object>}
 */
function listDeptTemplates() {
  const templates = []
  for (const category of CATEGORIES) {
    const dir = join(DEPT_TEMPLATES_DIR, category)
    if (!existsSync(dir)) continue
    let dirs
    try { dirs = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()) } catch { continue }
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
  const templateDir = join(DEPT_TEMPLATES_DIR, 'custom', id)
  if (!existsSync(templateDir)) mkdirSync(templateDir, { recursive: true })
  writeFileSync(join(templateDir, 'template.json'), JSON.stringify(data, null, 2) + '\n')
}

module.exports = { readDeptTemplate, getDeptTemplateDir, readDeptTemplateFile, listDeptTemplates, createCustomDeptTemplate }
