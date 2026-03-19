'use strict'
/**
 * TemplateRepository — Agent 模板读取
 *
 * 数据源：templates/builtin/{id}/ 和 templates/custom/{id}/
 */
const { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } = require('fs')
const { join, resolve } = require('path')

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const TEMPLATES_DIR = join(PROJECT_ROOT, 'templates')

const CATEGORIES = ['builtin', 'custom']

/**
 * Read a single template by ID.
 * @param {string} id - Template ID
 * @returns {object|null} Template metadata with defaults and hasIdentityFiles, or null
 */
function readTemplate(id) {
  for (const category of CATEGORIES) {
    const templatePath = join(TEMPLATES_DIR, category, id, 'template.json')
    if (!existsSync(templatePath)) continue

    try {
      const data = JSON.parse(readFileSync(templatePath, 'utf-8'))
      const tmplDirPath = join(TEMPLATES_DIR, category, id)
      const hasIdentity = existsSync(join(tmplDirPath, 'IDENTITY.md'))
      const hasSoul = existsSync(join(tmplDirPath, 'SOUL.md'))
      return {
        id: data.id || id,
        name: data.name || id,
        description: data.description || '',
        emoji: data.emoji || '',
        category,
        group: data.group || undefined,
        hidden: data.hidden || false,
        hasIdentityFiles: hasIdentity && hasSoul,
        defaults: {
          model: data.defaults?.model || '',
          skills: data.defaults?.skills || [],
          peers: data.defaults?.peers || [],
        },
      }
    } catch {
      return null
    }
  }
  return null
}

/**
 * Get the absolute directory path for a template.
 * @param {string} id - Template ID
 * @returns {string|null}
 */
function getTemplateDir(id) {
  for (const category of CATEGORIES) {
    const dir = join(TEMPLATES_DIR, category, id)
    if (existsSync(dir)) return dir
  }
  return null
}

/**
 * Read a file from a template directory.
 * @param {string} tmplDir - Template directory absolute path
 * @param {string} filename - File name (e.g. 'AGENTS.md')
 * @returns {string|null}
 */
function readTemplateFile(tmplDir, filename) {
  try {
    const p = join(tmplDir, filename)
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  } catch { /* skip */ }
  return null
}

/**
 * List all templates from builtin/ and custom/ directories.
 * @returns {Array<object>}
 */
function listTemplates() {
  const templates = []
  for (const category of CATEGORIES) {
    const dir = join(TEMPLATES_DIR, category)
    if (!existsSync(dir)) continue
    let dirs
    try { dirs = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()) } catch { continue }
    for (const d of dirs) {
      const t = readTemplate(d.name)
      if (t) templates.push(t)
    }
  }
  return templates
}

/**
 * Create a custom template.
 * @param {string} id - Template ID
 * @param {object} data - Template data (will be written as template.json)
 */
function createCustomTemplate(id, data) {
  const templateDir = join(TEMPLATES_DIR, 'custom', id)
  if (!existsSync(templateDir)) mkdirSync(templateDir, { recursive: true })
  writeFileSync(join(templateDir, 'template.json'), JSON.stringify(data, null, 2) + '\n')
}

module.exports = { readTemplate, getTemplateDir, readTemplateFile, listTemplates, createCustomTemplate }
