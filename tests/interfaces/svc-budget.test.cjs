'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const fs = require('fs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const { checkBudget, trackTokenUsage, loadCompanyBudget, saveCompanyBudget, shouldResetDaily, getBudgetSummary } = require('../../core/observe/budget.cjs')

const BUDGET_FILE = join(PROJECT_ROOT, 'config', 'budget.json')

describe('Budget', () => {
  it('shouldResetDaily(null) returns true', () => {
    assert.equal(shouldResetDaily(null), true)
  })

  it('shouldResetDaily with yesterday ISO string returns true', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    assert.equal(shouldResetDaily(yesterday.toISOString()), true)
  })

  it('shouldResetDaily with today ISO string returns false', () => {
    const today = new Date()
    assert.equal(shouldResetDaily(today.toISOString()), false)
  })

  it('loadCompanyBudget returns object', () => {
    const budget = loadCompanyBudget()
    assert.equal(typeof budget, 'object')
    assert.ok(budget !== null)
  })

  it('saveCompanyBudget + loadCompanyBudget roundtrip', () => {
    // Backup current budget
    let backup = null
    if (fs.existsSync(BUDGET_FILE)) {
      backup = fs.readFileSync(BUDGET_FILE, 'utf-8')
    }

    try {
      const testConfig = { dailyTokenLimit: 999999, alertThreshold: 0.8, _test: true }
      saveCompanyBudget(testConfig)

      const loaded = loadCompanyBudget()
      assert.equal(loaded._test, true)
      assert.equal(loaded.dailyTokenLimit, 999999)
      assert.equal(loaded.alertThreshold, 0.8)
    } finally {
      // Restore backup
      if (backup !== null) {
        fs.writeFileSync(BUDGET_FILE, backup)
      } else if (fs.existsSync(BUDGET_FILE)) {
        fs.unlinkSync(BUDGET_FILE)
      }
    }
  })

  it('getBudgetSummary returns object', () => {
    const summary = getBudgetSummary()
    assert.equal(typeof summary, 'object')
    assert.ok('company' in summary)
    assert.ok('departments' in summary)
    assert.equal(typeof summary.company, 'object')
    assert.equal(typeof summary.departments, 'object')
  })

  it('checkBudget for non-existent dept does not throw and returns object with allowed field', () => {
    const result = checkBudget('zzz-nonexistent-dept-' + Date.now())
    assert.equal(typeof result, 'object')
    assert.ok('allowed' in result)
  })
})
