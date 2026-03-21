'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync, writeFileSync } = require('fs')

const { STATE_FILE } = require('../../core/common/paths.cjs')
const { loadState, saveState, DEFAULT_STATE } = require('../../core/common/autopilot-state.cjs')

describe('AutopilotState', () => {
  let backupRaw

  beforeEach(() => {
    backupRaw = existsSync(STATE_FILE) ? readFileSync(STATE_FILE, 'utf-8') : null
  })

  afterEach(() => {
    if (backupRaw !== null) writeFileSync(STATE_FILE, backupRaw)
  })

  it('DEFAULT_STATE has expected fields', () => {
    assert.ok('status' in DEFAULT_STATE)
    assert.ok('pid' in DEFAULT_STATE)
    assert.ok('cycleCount' in DEFAULT_STATE)
    assert.ok('lastCycleAt' in DEFAULT_STATE)
    assert.ok('intervalSeconds' in DEFAULT_STATE)
    assert.ok('history' in DEFAULT_STATE)
    assert.equal(DEFAULT_STATE.status, 'stopped')
    assert.equal(DEFAULT_STATE.pid, null)
    assert.equal(DEFAULT_STATE.cycleCount, 0)
  })

  it('loadState returns object', () => {
    const state = loadState()
    assert.equal(typeof state, 'object')
    assert.ok(state !== null)
  })

  it('saveState + loadState roundtrip', () => {
    const modified = {
      ...loadState(),
      cycleCount: 999,
      _zzz_test_marker: true,
    }
    saveState(modified)

    const loaded = loadState()
    assert.equal(loaded.cycleCount, 999)
    assert.equal(loaded._zzz_test_marker, true)
  })
})
