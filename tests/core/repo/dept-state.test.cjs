'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, rmSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { BaseRepository } = require('../../../core/repo/base.cjs')

const TEST_DIR = join(tmpdir(), `dept-state-test-${Date.now()}`)

describe('DeptStateRepository-style operations', () => {
  let repo

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    repo = new BaseRepository()
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('load returns default state when file missing', () => {
    const result = repo.read(join(TEST_DIR, 'nonexistent', 'state.json'))
    assert.strictEqual(result, null)
  })

  it('save + load roundtrip', () => {
    const fp = join(TEST_DIR, 'state.json')
    const state = { status: 'running', cycleCount: 5, lastCycleAt: '2026-03-15T00:00:00Z' }
    repo.write(fp, state)
    const loaded = repo.read(fp)
    assert.deepStrictEqual(loaded, state)
  })

  it('updateState applies mutator', () => {
    const fp = join(TEST_DIR, 'state.json')
    repo.write(fp, { cycleCount: 3 })
    const result = repo.update(fp, state => {
      state.cycleCount += 1
      return state
    })
    assert.strictEqual(result.cycleCount, 4)
  })
})
