'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync, writeFileSync } = require('fs')

const { DEPARTMENTS_FILE: DEPTS_FILE } = require('../../core/common/paths.cjs')
const { DeptRegistryRepository, deptRegistryRepo, DEFAULT_DEPARTMENTS } = require('../../core/repo/dept-registry.cjs')

describe('DeptRegistryRepository', () => {
  let backupRaw

  beforeEach(() => {
    backupRaw = existsSync(DEPTS_FILE) ? readFileSync(DEPTS_FILE, 'utf-8') : null
  })

  afterEach(() => {
    if (backupRaw !== null) writeFileSync(DEPTS_FILE, backupRaw)
    deptRegistryRepo.invalidate()
  })

  it('readAll returns an array', () => {
    const result = deptRegistryRepo.readAll()
    assert.ok(Array.isArray(result))
  })

  it('DEFAULT_DEPARTMENTS is array with at least 2 entries (dev, novel)', () => {
    assert.ok(Array.isArray(DEFAULT_DEPARTMENTS))
    assert.ok(DEFAULT_DEPARTMENTS.length >= 2)
    const ids = DEFAULT_DEPARTMENTS.map(d => d.id)
    assert.ok(ids.includes('dev'))
    assert.ok(ids.includes('novel'))
  })

  it('writeAll + readAll roundtrip', () => {
    const current = deptRegistryRepo.readAll()
    const testEntry = {
      id: 'zzz-test-dept-roundtrip',
      name: 'Test Department',
      nameEn: 'Test Department',
      emoji: '🧪',
      order: 999,
    }
    current.push(testEntry)
    deptRegistryRepo.writeAll(current)

    const after = deptRegistryRepo.readAll()
    const found = after.find(d => d.id === 'zzz-test-dept-roundtrip')
    assert.ok(found)
    assert.equal(found.name, 'Test Department')
    assert.equal(found.emoji, '🧪')
  })

  it('each default dept has id, name, emoji fields', () => {
    for (const dept of DEFAULT_DEPARTMENTS) {
      assert.ok(typeof dept.id === 'string' && dept.id.length > 0, `dept missing id`)
      assert.ok(typeof dept.name === 'string' && dept.name.length > 0, `dept ${dept.id} missing name`)
      assert.ok(typeof dept.emoji === 'string' && dept.emoji.length > 0, `dept ${dept.id} missing emoji`)
    }
  })
})
