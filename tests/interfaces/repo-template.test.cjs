'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { existsSync, rmSync, readdirSync } = require('fs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const { readTemplate, getTemplateDir, listTemplates, readTemplateFile, createCustomTemplate } = require('../../core/repo/template.cjs')

describe('TemplateRepository', () => {
  afterEach(() => {
    // Clean up any test custom templates
    const customDir = join(PROJECT_ROOT, 'templates', 'custom')
    if (existsSync(customDir)) {
      try {
        const entries = readdirSync(customDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('zzz-test-')) {
            rmSync(join(customDir, entry.name), { recursive: true, force: true })
          }
        }
      } catch { /* skip */ }
    }
  })

  it('listTemplates returns non-empty array', () => {
    const templates = listTemplates()
    assert.ok(Array.isArray(templates))
    assert.ok(templates.length > 0)
  })

  it('each template has id and name fields', () => {
    const templates = listTemplates()
    for (const t of templates) {
      assert.ok(typeof t.id === 'string' && t.id.length > 0, `template missing id`)
      assert.ok(typeof t.name === 'string' && t.name.length > 0, `template ${t.id} missing name`)
    }
  })

  it('readTemplate("ceo") returns object with id="ceo"', () => {
    const t = readTemplate('ceo')
    assert.ok(t !== null)
    assert.equal(t.id, 'ceo')
  })

  it('readTemplate("nonexistent-xyz") returns null', () => {
    const t = readTemplate('nonexistent-xyz')
    assert.equal(t, null)
  })

  it('getTemplateDir("ceo") returns string path', () => {
    const dir = getTemplateDir('ceo')
    assert.equal(typeof dir, 'string')
    assert.ok(dir.length > 0)
    assert.ok(existsSync(dir))
  })

  it('getTemplateDir("nonexistent-xyz") returns null', () => {
    const dir = getTemplateDir('nonexistent-xyz')
    assert.equal(dir, null)
  })

  it('readTemplateFile with valid template dir returns string content', () => {
    const dir = getTemplateDir('ceo')
    assert.ok(dir)
    const content = readTemplateFile(dir, 'template.json')
    assert.equal(typeof content, 'string')
    assert.ok(content.length > 0)
  })

  it('createCustomTemplate creates template in templates/custom/', () => {
    const testId = 'zzz-test-template-create'
    const data = { id: testId, name: 'Test Template', description: 'For testing' }
    createCustomTemplate(testId, data)

    const templatePath = join(PROJECT_ROOT, 'templates', 'custom', testId, 'template.json')
    assert.ok(existsSync(templatePath))

    const t = readTemplate(testId)
    assert.ok(t !== null)
    assert.equal(t.id, testId)
    assert.equal(t.name, 'Test Template')
  })
})
