'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { existsSync, rmSync, readdirSync, readFileSync, writeFileSync, unlinkSync } = require('fs')

const { DEPARTMENTS_FILE: DEPTS_FILE, DEPARTMENTS_DIR } = require('../../core/common/paths.cjs')
const { createDepartment, updateDepartment, deleteDepartment } = require('../../core/common/department-service.cjs')
const { deptRegistryRepo } = require('../../core/repo/dept-registry.cjs')

describe('DepartmentService', () => {
  let backupRaw
  const testDeptIds = []

  beforeEach(() => {
    backupRaw = existsSync(DEPTS_FILE) ? readFileSync(DEPTS_FILE, 'utf-8') : null
  })

  afterEach(() => {
    // Restore departments.json with original bytes to preserve formatting
    if (backupRaw !== null) writeFileSync(DEPTS_FILE, backupRaw)
    else if (existsSync(DEPTS_FILE)) unlinkSync(DEPTS_FILE)
    deptRegistryRepo.invalidate()

    // Clean up test department config dirs
    for (const id of testDeptIds) {
      const deptDir = join(DEPARTMENTS_DIR, id)
      if (existsSync(deptDir)) rmSync(deptDir, { recursive: true, force: true })
    }
    testDeptIds.length = 0
  })

  it('createDepartment with valid data returns ok=true', () => {
    const id = `zzz-test-dept-${Date.now()}`
    testDeptIds.push(id)
    const result = createDepartment({ id, name: '测试部', nameEn: 'Test Dept' })
    assert.equal(result.ok, true)
    assert.equal(result.id, id)

    const all = deptRegistryRepo.readAll()
    assert.ok(all.find(d => d.id === id))
  })

  it('createDepartment missing name returns error', () => {
    const result = createDepartment({ id: 'zzz-test-no-name', nameEn: 'No Name' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('createDepartment invalid id returns error', () => {
    const result = createDepartment({ id: 'INVALID ID!', name: '测试', nameEn: 'Test' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
  })

  it('createDepartment duplicate returns error', () => {
    const id = `zzz-test-dept-dup-${Date.now()}`
    testDeptIds.push(id)
    createDepartment({ id, name: '重复部', nameEn: 'Dup Dept' })
    const result = createDepartment({ id, name: '重复部2', nameEn: 'Dup Dept 2' })
    assert.equal(result.ok, false)
    assert.equal(result.status, 409)
  })

  it('updateDepartment changes name', () => {
    const id = `zzz-test-dept-upd-${Date.now()}`
    testDeptIds.push(id)
    createDepartment({ id, name: '原名', nameEn: 'Original' })

    const result = updateDepartment(id, { name: '新名' })
    assert.equal(result.ok, true)

    const all = deptRegistryRepo.readAll()
    const found = all.find(d => d.id === id)
    assert.ok(found)
    assert.equal(found.name, '新名')
  })

  it('deleteDepartment removes entry', () => {
    const id = `zzz-test-dept-del-${Date.now()}`
    testDeptIds.push(id)
    createDepartment({ id, name: '待删部', nameEn: 'To Delete' })

    const result = deleteDepartment(id)
    assert.equal(result.ok, true)

    const all = deptRegistryRepo.readAll()
    assert.ok(!all.find(d => d.id === id))
  })
})
