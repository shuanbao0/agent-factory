'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync, rmSync } = require('fs')
const { join, resolve } = require('path')

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..')
const TEST_SESSIONS_DIR = join(PROJECT_ROOT, '.openclaw-state', 'agents')

describe('SessionRepository', () => {
  // We test the module but can't easily mock the SESSIONS_DIR path
  // So we test that the module loads and exports correctly
  it('exports SessionRepository and sessionRepo', () => {
    const mod = require('../../../core/repo/session.cjs')
    assert.ok(mod.SessionRepository)
    assert.ok(mod.sessionRepo)
    assert.ok(typeof mod.sessionRepo.readAgentActivity === 'function')
    assert.ok(typeof mod.sessionRepo.fetchSessionTokens === 'function')
    assert.ok(typeof mod.sessionRepo.getSessionTokenInfo === 'function')
  })
})
