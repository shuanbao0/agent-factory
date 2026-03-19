'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { mkdirSync, rmSync, existsSync } = require('fs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const { DeptConfigRepository } = require('../../core/repo/dept-config.cjs')

const ts = Date.now()
const testDeptId = `zzz-test-deptcfg-${ts}`
const DEPARTMENTS_DIR = join(PROJECT_ROOT, 'config', 'departments')

describe('DeptConfigRepository', () => {
  let repo

  afterEach(() => {
    // Clean up any test dept directories
    const testDir = join(DEPARTMENTS_DIR, testDeptId)
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('load returns null for non-existent dept', () => {
    repo = new DeptConfigRepository()
    const result = repo.load('zzz-nonexistent-dept-' + Date.now())
    assert.equal(result, null)
  })

  it('save + load roundtrip', () => {
    repo = new DeptConfigRepository()
    const deptDir = join(DEPARTMENTS_DIR, testDeptId)
    mkdirSync(deptDir, { recursive: true })

    const config = { id: testDeptId, name: 'Test Dept', enabled: true, interval: 600, agents: [] }
    repo.save(testDeptId, config)
    const loaded = repo.load(testDeptId)
    assert.ok(loaded)
    assert.equal(loaded.id, testDeptId)
    assert.equal(loaded.enabled, true)
    assert.equal(loaded.interval, 600)
  })

  it('updateConfig mutates and returns updated config', () => {
    repo = new DeptConfigRepository()
    const deptDir = join(DEPARTMENTS_DIR, testDeptId)
    mkdirSync(deptDir, { recursive: true })

    repo.save(testDeptId, { id: testDeptId, enabled: false, interval: 300 })
    const updated = repo.updateConfig(testDeptId, cfg => {
      cfg.enabled = true
      cfg.interval = 900
      return cfg
    })
    assert.equal(updated.enabled, true)
    assert.equal(updated.interval, 900)

    // Verify persisted
    const loaded = repo.load(testDeptId)
    assert.equal(loaded.enabled, true)
    assert.equal(loaded.interval, 900)
  })

  it('configPath returns correct path string', () => {
    repo = new DeptConfigRepository()
    const p = repo.configPath(testDeptId)
    assert.ok(p.endsWith(join('config', 'departments', testDeptId, 'config.json')))
  })

  it('listDeptIds returns array of strings', () => {
    repo = new DeptConfigRepository()
    const ids = repo.listDeptIds()
    assert.ok(Array.isArray(ids))
    for (const id of ids) {
      assert.equal(typeof id, 'string')
    }
  })
})
