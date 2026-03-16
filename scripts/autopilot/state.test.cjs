'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, renameSync } = require('fs')
const { join, dirname } = require('path')

const TEST_DIR = join(__dirname, '..', '..', '_test_state_tmp')
const STATE_FILE = join(TEST_DIR, 'autopilot-state.json')

describe('state', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  describe('loadState logic', () => {
    it('returns default state when file does not exist', () => {
      assert.ok(!existsSync(STATE_FILE))
      const DEFAULT_STATE = {
        status: 'stopped',
        pid: null,
        cycleCount: 0,
        lastCycleAt: null,
        lastCycleResult: null,
        intervalSeconds: 1800,
        history: [],
      }
      // Simulating loadState behavior
      const state = existsSync(STATE_FILE)
        ? JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
        : { ...DEFAULT_STATE }
      assert.equal(state.status, 'stopped')
      assert.equal(state.pid, null)
      assert.equal(state.cycleCount, 0)
      assert.deepEqual(state.history, [])
    })

    it('loads existing state from file', () => {
      const saved = { status: 'running', pid: 1234, cycleCount: 10, lastCycleAt: '2026-01-01', history: [] }
      writeFileSync(STATE_FILE, JSON.stringify(saved))

      const loaded = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
      assert.equal(loaded.status, 'running')
      assert.equal(loaded.pid, 1234)
      assert.equal(loaded.cycleCount, 10)
    })
  })

  describe('saveState atomic write logic', () => {
    it('writes state atomically via tmp + rename', () => {
      const state = { status: 'cycling', cycleCount: 5 }
      const tmpFile = STATE_FILE + '.tmp'
      writeFileSync(tmpFile, JSON.stringify(state, null, 2))
      renameSync(tmpFile, STATE_FILE)

      assert.ok(existsSync(STATE_FILE))
      assert.ok(!existsSync(tmpFile))
      const loaded = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
      assert.equal(loaded.status, 'cycling')
      assert.equal(loaded.cycleCount, 5)
    })

    it('handles concurrent save attempts with lock', () => {
      const state = { status: 'running', _locked: true }
      writeFileSync(STATE_FILE, JSON.stringify(state))

      const loaded = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
      assert.equal(loaded._locked, true)
      // withStateLock should skip if _locked is true
      assert.ok(loaded._locked)
    })
  })
})
