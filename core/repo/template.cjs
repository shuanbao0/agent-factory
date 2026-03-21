'use strict'
/**
 * TemplateRepository — Agent 模板读取
 *
 * builtin: templates/agents/builtin/{id}/（源码）
 * custom:  data/templates/agents/custom/{id}/（运行时）
 */
const { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')
const { BUILTIN_AGENT_TEMPLATES_DIR, CUSTOM_AGENT_TEMPLATES_DIR } = require('../common/paths.cjs')

/** category → directory mapping */
const CATEGORY_DIRS = {
  builtin: join(BUILTIN_AGENT_TEMPLATES_DIR, 'builtin'),
  custom: CUSTOM_AGENT_TEMPLATES_DIR,
}

/**
 * Read a single template by ID.
 * @param {string} id - Template ID
 * @returns {object|null} Template metadata with defaults and hasIdentityFiles, or null
 */
function readTemplate(id) {
  for (const [category, baseDir] of Object.entries(CATEGORY_DIRS)) {
    const templatePath = join(baseDir, id, 'template.json')
    if (!existsSync(templatePath)) continue

    try {
      const data = JSON.parse(readFileSync(templatePath, 'utf-8'))
      const tmplDirPath = join(baseDir, id)
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
  for (const baseDir of Object.values(CATEGORY_DIRS)) {
    const dir = join(baseDir, id)
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
 * List all templates from builtin and custom directories.
 * @returns {Array<object>}
 */
function listTemplates() {
  const templates = []
  for (const [, baseDir] of Object.entries(CATEGORY_DIRS)) {
    if (!existsSync(baseDir)) continue
    let dirs
    try { dirs = readdirSync(baseDir, { withFileTypes: true }).filter(d => d.isDirectory()) } catch { continue }
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
  const templateDir = join(CUSTOM_AGENT_TEMPLATES_DIR, id)
  if (!existsSync(templateDir)) mkdirSync(templateDir, { recursive: true })
  writeFileSync(join(templateDir, 'template.json'), JSON.stringify(data, null, 2) + '\n')
}

module.exports = { readTemplate, getTemplateDir, readTemplateFile, listTemplates, createCustomTemplate }
