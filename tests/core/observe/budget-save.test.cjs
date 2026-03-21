'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, existsSync, readFileSync, rmSync } = require('fs')
const { BUDGET_FILE, CONFIG_DIR } = require('../../../core/common/paths.cjs')

describe('saveCompanyBudget', () => {
  let backup = null

  beforeEach(() => {
    // Backup existing budget.json if it exists
    if (existsSync(BUDGET_FILE)) {
      backup = readFileSync(BUDGET_FILE, 'utf-8')
    }
  })

  afterEach(() => {
    // Restore backup
    if (backup !== null) {
      const { writeFileSync } = require('fs')
      writeFileSync(BUDGET_FILE, backup)
    } else if (existsSync(BUDGET_FILE)) {
      rmSync(BUDGET_FILE)
    }
  })

  it('writes valid JSON atomically', () => {
    const { saveCompanyBudget } = require('../../../core/observe/budget.cjs')
    const config = {
      company: { dailyTokenLimit: 1000000, monthlyTokenLimit: 30000000, alertThreshold: 0.8 },
      agentDailyLimit: 5,
      overBudgetAction: 'pause_and_notify',
    }
    saveCompanyBudget(config)

    assert.ok(existsSync(BUDGET_FILE))
    const saved = JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'))
    assert.equal(saved.company.dailyTokenLimit, 1000000)
    assert.equal(saved.agentDailyLimit, 5)
  })

  it('overwrites existing file', () => {
    const { saveCompanyBudget } = require('../../../core/observe/budget.cjs')
    saveCompanyBudget({ company: { dailyTokenLimit: 100 } })
    saveCompanyBudget({ company: { dailyTokenLimit: 200 } })

    const saved = JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'))
    assert.equal(saved.company.dailyTokenLimit, 200)
  })

  it('does not leave tmp files on success', () => {
    const { saveCompanyBudget } = require('../../../core/observe/budget.cjs')
    saveCompanyBudget({ test: true })

    const { readdirSync } = require('fs')
    const configDir = CONFIG_DIR
    const tmpFiles = readdirSync(configDir).filter(f => f.startsWith('budget.json.tmp.'))
    assert.equal(tmpFiles.length, 0)
  })
})
