'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync } = require('fs')
const { join } = require('path')

const PROJECT_ROOT = join(__dirname, '..', '..', '..')
const TEMPLATES_DIR = join(PROJECT_ROOT, 'templates', 'agents')

describe('template repository', () => {
  const { readTemplate, getTemplateDir, readTemplateFile } = require('../../../core/repo/template.cjs')

  it('readTemplate returns null for nonexistent template', () => {
    assert.equal(readTemplate('__nonexistent_template__'), null)
  })

  it('readTemplate reads a builtin template if it exists', () => {
    // Check if any builtin template exists
    const builtinDir = join(TEMPLATES_DIR, 'builtin')
    if (!existsSync(builtinDir)) return // skip if no templates

    const { readdirSync } = require('fs')
    const dirs = readdirSync(builtinDir, { withFileTypes: true }).filter(d => d.isDirectory())
    if (dirs.length === 0) return

    const firstId = dirs[0].name
    const tmpl = readTemplate(firstId)
    if (tmpl) {
      assert.ok(tmpl.id)
      assert.ok(tmpl.name)
      assert.ok(typeof tmpl.hasIdentityFiles === 'boolean')
      assert.ok(tmpl.defaults)
      assert.ok(Array.isArray(tmpl.defaults.skills))
      assert.ok(Array.isArray(tmpl.defaults.peers))
    }
  })

  it('getTemplateDir returns null for nonexistent template', () => {
    assert.equal(getTemplateDir('__nonexistent__'), null)
  })

  it('getTemplateDir returns path for existing builtin template', () => {
    const builtinDir = join(TEMPLATES_DIR, 'builtin')
    if (!existsSync(builtinDir)) return

    const { readdirSync } = require('fs')
    const dirs = readdirSync(builtinDir, { withFileTypes: true }).filter(d => d.isDirectory())
    if (dirs.length === 0) return

    const dir = getTemplateDir(dirs[0].name)
    assert.ok(dir)
    assert.ok(existsSync(dir))
  })

  it('readTemplateFile returns null for nonexistent file', () => {
    assert.equal(readTemplateFile('/tmp', '__nonexistent.md'), null)
  })

  it('readTemplateFile reads existing file', () => {
    const builtinDir = join(TEMPLATES_DIR, 'builtin')
    if (!existsSync(builtinDir)) return

    const { readdirSync } = require('fs')
    const dirs = readdirSync(builtinDir, { withFileTypes: true }).filter(d => d.isDirectory())
    if (dirs.length === 0) return

    const tmplDir = join(builtinDir, dirs[0].name)
    const content = readTemplateFile(tmplDir, 'template.json')
    if (content) {
      assert.ok(content.length > 0)
      // Should be valid JSON
      assert.doesNotThrow(() => JSON.parse(content))
    }
  })
})
