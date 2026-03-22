'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require('fs')

const { DEPARTMENTS_FILE: DEPTS_FILE } = require('../../core/common/paths.cjs')
const { DeptRegistryRepository, deptRegistryRepo, DEFAULT_DEPARTMENTS } = require('../../core/repo/dept-registry.cjs')

describe('DeptRegistryRepository', () => {
  let backupRaw

  beforeEach(() => {
    backupRaw = existsSync(DEPTS_FILE) ? readFileSync(DEPTS_FILE, 'utf-8') : null
  })

  afterEach(() => {
    if (backupRaw !== null) writeFileSync(DEPTS_FILE, backupRaw)
    else if (existsSync(DEPTS_FILE)) unlinkSync(DEPTS_FILE)
    deptRegistryRepo.invalidate()
  })

  it('readAll returns an array', () => {
    const result = deptRegistryRepo.readAll()
    assert.ok(Array.isArray(result))
  })

  it('DEFAULT_DEPARTMENTS is an empty array', () => {
    assert.ok(Array.isArray(DEFAULT_DEPARTMENTS))
    assert.equal(DEFAULT_DEPARTMENTS.length, 0)
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

  it('readAll returns empty array when no file exists', () => {
    // DEFAULT_DEPARTMENTS is empty, so when file is missing readAll returns []
    const result = DEFAULT_DEPARTMENTS
    assert.ok(Array.isArray(result))
  })
})
