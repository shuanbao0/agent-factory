'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('Budget module', () => {
  it('exports expected functions', () => {
    const mod = require('../../../core/observe/budget.cjs')
    assert.ok(typeof mod.checkBudget === 'function')
    assert.ok(typeof mod.trackTokenUsage === 'function')
    assert.ok(typeof mod.loadCompanyBudget === 'function')
    assert.ok(typeof mod.getBudgetSummary === 'function')
    assert.ok(typeof mod.shouldResetDaily === 'function')
    assert.ok(typeof mod.estimateTokensPerCycle === 'function')
    assert.ok(typeof mod.reserveBudget === 'function')
    assert.ok(typeof mod.reconcileBudget === 'function')
  })

  it('shouldResetDaily returns true when null', () => {
    const { shouldResetDaily } = require('../../../core/observe/budget.cjs')
    assert.equal(shouldResetDaily(null), true)
  })

  it('shouldResetDaily returns false for today', () => {
    const { shouldResetDaily } = require('../../../core/observe/budget.cjs')
    assert.equal(shouldResetDaily(new Date().toISOString()), false)
  })

  it('shouldResetDaily returns true for yesterday', () => {
    const { shouldResetDaily } = require('../../../core/observe/budget.cjs')
    const yesterday = new Date(Date.now() - 86400000).toISOString()
    assert.equal(shouldResetDaily(yesterday), true)
  })
})
