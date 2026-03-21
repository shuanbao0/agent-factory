'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } = require('fs')
const { join } = require('path')
const { DEPARTMENTS_FILE: DEPTS_FILE, DEPARTMENTS_DIR: DEPTS_DIR } = require('../../core/common/paths.cjs')
const { createDepartment, updateDepartment, deleteDepartment } = require('../../core/common/department-service.cjs')
const { deptRegistryRepo } = require('../../core/repo/dept-registry.cjs')

const TEST_ID = 'zzz-test-dept-' + process.pid

describe('Department management — create → update → delete', () => {
  let originalDepts

  beforeEach(() => {
    // Backup departments.json
    if (existsSync(DEPTS_FILE)) {
      originalDepts = readFileSync(DEPTS_FILE, 'utf-8')
    } else {
      originalDepts = null
    }
  })

  afterEach(() => {
    // Restore departments.json (raw bytes to preserve original formatting)
    if (originalDepts !== null) {
      writeFileSync(DEPTS_FILE, originalDepts)
    }

    // Invalidate repo cache so subsequent reads pick up restored file
    deptRegistryRepo.invalidate()

    // Clean up test department directories
    const testDir = join(DEPTS_DIR, TEST_ID)
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
  })

  it('full lifecycle: create → verify → update → verify → delete → verify', () => {
    // ── Create ──
    const createResult = createDepartment({
      id: TEST_ID,
      name: '测试部',
      nameEn: 'Test Dept',
    })
    assert.equal(createResult.ok, true)
    assert.equal(createResult.id, TEST_ID)

    // Verify registry entry
    const deptsData = JSON.parse(readFileSync(DEPTS_FILE, 'utf-8'))
    const depts = deptsData.departments || deptsData
    const entry = depts.find(d => d.id === TEST_ID)
    assert.ok(entry, 'department should be in registry')
    assert.equal(entry.name, '测试部')
    assert.equal(entry.nameEn, 'Test Dept')

    // Verify config directory created
    const configPath = join(DEPTS_DIR, TEST_ID, 'config.json')
    assert.ok(existsSync(configPath), 'config.json should be created')

    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    assert.equal(config.id, TEST_ID)
    assert.equal(config.enabled, false)
    assert.equal(config.interval, 600)

    // ── Update ──
    const updateResult = updateDepartment(TEST_ID, { name: '更新部门' })
    assert.equal(updateResult.ok, true)

    const deptsAfterUpdateData = JSON.parse(readFileSync(DEPTS_FILE, 'utf-8'))
    const deptsAfterUpdate = deptsAfterUpdateData.departments || deptsAfterUpdateData
    const updatedEntry = deptsAfterUpdate.find(d => d.id === TEST_ID)
    assert.equal(updatedEntry.name, '更新部门')
    assert.equal(updatedEntry.nameEn, 'Test Dept') // unchanged

    // ── Delete ──
    const deleteResult = deleteDepartment(TEST_ID)
    assert.equal(deleteResult.ok, true)

    const deptsAfterDeleteData = JSON.parse(readFileSync(DEPTS_FILE, 'utf-8'))
    const deptsAfterDelete = deptsAfterDeleteData.departments || deptsAfterDeleteData
    const deletedEntry = deptsAfterDelete.find(d => d.id === TEST_ID)
    assert.equal(deletedEntry, undefined, 'department should be removed from registry')
  })

  it('create fails: missing name', () => {
    const result = createDepartment({ id: TEST_ID, nameEn: 'Test' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('create fails: invalid ID', () => {
    const result = createDepartment({ id: 'INVALID_UPPER', name: '测试', nameEn: 'Test' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('create fails: duplicate ID', () => {
    const first = createDepartment({ id: TEST_ID, name: '测试部', nameEn: 'Test Dept' })
    assert.equal(first.ok, true)

    const second = createDepartment({ id: TEST_ID, name: '重复部', nameEn: 'Duplicate' })
    assert.equal(second.ok, false)
    assert.equal(second.status, 409)
  })
})
