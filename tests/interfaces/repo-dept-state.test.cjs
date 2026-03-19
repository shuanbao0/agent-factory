'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { mkdirSync, rmSync, existsSync } = require('fs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const { DeptStateRepository } = require('../../core/repo/dept-state.cjs')

const ts = Date.now()
const testDeptId = `zzz-test-deptst-${ts}`
const DEPARTMENTS_DIR = join(PROJECT_ROOT, 'config', 'departments')

describe('DeptStateRepository', () => {
  let repo

  afterEach(() => {
    const testDir = join(DEPARTMENTS_DIR, testDeptId)
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('load returns default state for non-existent dept', () => {
    repo = new DeptStateRepository()
    const state = repo.load('zzz-nonexistent-deptst-' + Date.now())
    assert.equal(state.status, 'stopped')
    assert.equal(state.pid, null)
    assert.equal(state.cycleCount, 0)
    assert.equal(state.lastCycleAt, null)
    assert.equal(state.tokensUsedToday, 0)
    assert.equal(state.budgetResetAt, null)
    assert.ok(Array.isArray(state.history))
    assert.equal(state.history.length, 0)
  })

  it('save + load roundtrip', () => {
    repo = new DeptStateRepository()
    const deptDir = join(DEPARTMENTS_DIR, testDeptId)
    mkdirSync(deptDir, { recursive: true })

    const state = {
      status: 'running',
      pid: 12345,
      cycleCount: 5,
      lastCycleAt: '2026-03-19T00:00:00Z',
      lastCycleResult: null,
      history: [],
      tokensUsedToday: 1000,
      budgetResetAt: null,
    }
    repo.save(testDeptId, state)
    const loaded = repo.load(testDeptId)
    assert.equal(loaded.status, 'running')
    assert.equal(loaded.pid, 12345)
    assert.equal(loaded.cycleCount, 5)
    assert.equal(loaded.tokensUsedToday, 1000)
  })

  it('updateState applies mutator correctly', () => {
    repo = new DeptStateRepository()
    const deptDir = join(DEPARTMENTS_DIR, testDeptId)
    mkdirSync(deptDir, { recursive: true })

    repo.save(testDeptId, {
      status: 'stopped',
      pid: null,
      cycleCount: 0,
      lastCycleAt: null,
      lastCycleResult: null,
      history: [],
      tokensUsedToday: 0,
      budgetResetAt: null,
    })

    const updated = repo.updateState(testDeptId, st => {
      st.status = 'cycling'
      st.cycleCount = st.cycleCount + 1
      st.tokensUsedToday = 500
      return st
    })
    assert.equal(updated.status, 'cycling')
    assert.equal(updated.cycleCount, 1)
    assert.equal(updated.tokensUsedToday, 500)

    // Verify persisted
    const loaded = repo.load(testDeptId)
    assert.equal(loaded.status, 'cycling')
    assert.equal(loaded.cycleCount, 1)
  })

  it('updateState on non-existent dept uses default state', () => {
    repo = new DeptStateRepository()
    const deptDir = join(DEPARTMENTS_DIR, testDeptId)
    mkdirSync(deptDir, { recursive: true })

    const updated = repo.updateState(testDeptId, st => {
      st.status = 'idle'
      return st
    })
    assert.equal(updated.status, 'idle')
    assert.equal(updated.cycleCount, 0)
  })
})
