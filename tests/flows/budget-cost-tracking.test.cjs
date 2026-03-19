'use strict'
const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync, truncateSync } = require('fs')
const { join } = require('path')
const { calculateCost, trackCost, queryCosts, COSTS_FILE } = require('../../core/observe/cost-tracker.cjs')
const { shouldResetDaily, loadCompanyBudget, saveCompanyBudget } = require('../../core/observe/budget.cjs')
const { deptConfigRepo } = require('../../core/repo/dept-config.cjs')
const { deptStateRepo } = require('../../core/repo/dept-state.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const BUDGET_FILE = join(PROJECT_ROOT, 'config', 'budget.json')
const EVENTS_FILE = join(PROJECT_ROOT, 'config', 'autopilot-events.jsonl')
const DEPTS_DIR = join(PROJECT_ROOT, 'config', 'departments')

const TEST_DEPT_ID = 'zzz-test-budget-' + process.pid
const TEST_SOURCE = 'zzz-test-cost-' + process.pid + '-' + Date.now()

describe('Cost tracking and budget', () => {
  let originalCostsSize
  let originalEventsSize
  let originalBudget

  beforeEach(() => {
    // Record JSONL file sizes before test
    originalCostsSize = existsSync(COSTS_FILE) ? statSync(COSTS_FILE).size : -1
    originalEventsSize = existsSync(EVENTS_FILE) ? statSync(EVENTS_FILE).size : -1

    // Backup budget.json
    originalBudget = existsSync(BUDGET_FILE) ? readFileSync(BUDGET_FILE, 'utf-8') : null
  })

  afterEach(() => {
    // Truncate JSONL files back to original size
    if (originalCostsSize >= 0 && existsSync(COSTS_FILE)) {
      truncateSync(COSTS_FILE, originalCostsSize)
    }
    if (originalEventsSize >= 0 && existsSync(EVENTS_FILE)) {
      truncateSync(EVENTS_FILE, originalEventsSize)
    }

    // Restore budget.json
    if (originalBudget !== null) {
      writeFileSync(BUDGET_FILE, originalBudget)
    } else if (existsSync(BUDGET_FILE)) {
      rmSync(BUDGET_FILE)
    }

    // Clean up test department directory
    const testDeptDir = join(DEPTS_DIR, TEST_DEPT_ID)
    if (existsSync(testDeptDir)) rmSync(testDeptDir, { recursive: true, force: true })
  })

  describe('calculateCost', () => {
    it('returns correct cost for claude-sonnet-4-6', () => {
      const cost = calculateCost('claude-sonnet-4-6', { inputTokens: 1000, outputTokens: 500 })
      // input: 1000 * 3.0 / 1M = 0.003, output: 500 * 15.0 / 1M = 0.0075
      assert.ok(cost > 0)
      const expected = (1000 * 3.0 / 1_000_000) + (500 * 15.0 / 1_000_000)
      assert.equal(cost, expected)
    })

    it('returns a value for unknown model (fallback pricing)', () => {
      const cost = calculateCost('unknown-model-xyz', { inputTokens: 1000, outputTokens: 500 })
      assert.ok(cost > 0, 'should fall back to sonnet pricing')
    })

    it('returns 0 for null usage', () => {
      const cost = calculateCost('claude-sonnet-4-6', null)
      assert.equal(cost, 0)
    })
  })

  describe('shouldResetDaily', () => {
    it('null → true', () => {
      assert.equal(shouldResetDaily(null), true)
    })

    it('yesterday → true', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      assert.equal(shouldResetDaily(yesterday.toISOString()), true)
    })

    it('today → false', () => {
      const now = new Date()
      assert.equal(shouldResetDaily(now.toISOString()), false)
    })
  })

  describe('loadCompanyBudget + saveCompanyBudget roundtrip', () => {
    it('load returns default structure', () => {
      // Remove budget file to get defaults
      if (existsSync(BUDGET_FILE)) rmSync(BUDGET_FILE)

      const budget = loadCompanyBudget()
      assert.ok(budget.company, 'should have company key')
      assert.ok(budget.company.dailyTokenLimit > 0, 'should have daily limit')
      assert.ok(budget.overBudgetAction, 'should have overBudgetAction')
    })

    it('save and load roundtrip', () => {
      const custom = {
        company: { dailyTokenLimit: 999999, monthlyTokenLimit: 50000000, alertThreshold: 0.9 },
        overBudgetAction: 'block',
      }

      saveCompanyBudget(custom)
      const loaded = loadCompanyBudget()
      assert.equal(loaded.company.dailyTokenLimit, 999999)
      assert.equal(loaded.company.alertThreshold, 0.9)
      assert.equal(loaded.overBudgetAction, 'block')
    })
  })

  describe('trackCost + queryCosts integration', () => {
    it('tracked entry can be queried by source', () => {
      trackCost({
        model: 'claude-sonnet-4-6',
        usage: { inputTokens: 100, outputTokens: 50 },
        source: TEST_SOURCE,
        agentId: 'zzz-test-agent',
      })

      const result = queryCosts({ source: TEST_SOURCE })
      assert.ok(result.entries.length >= 1, 'should have at least one entry')

      const entry = result.entries.find(e => e.source === TEST_SOURCE)
      assert.ok(entry, 'should find entry with test source')
      assert.equal(entry.model, 'claude-sonnet-4-6')
      assert.equal(entry.inputTokens, 100)
      assert.equal(entry.outputTokens, 50)
      assert.ok(entry.cost > 0)
      assert.ok(entry.ts)
      assert.ok(entry.date)

      assert.ok(result.totalCost > 0)
      assert.ok(result.totalInputTokens >= 100)
      assert.ok(result.totalOutputTokens >= 50)
    })
  })

  describe('budget check flow', () => {
    it('checkBudget returns allowed when within limits', () => {
      const { checkBudget, trackTokenUsage } = require('../../core/observe/budget.cjs')

      // Create test department config + state
      const deptDir = join(DEPTS_DIR, TEST_DEPT_ID)
      mkdirSync(deptDir, { recursive: true })

      writeFileSync(join(deptDir, 'config.json'), JSON.stringify({
        id: TEST_DEPT_ID,
        name: 'Test Budget Dept',
        head: '',
        interval: 600,
        enabled: false,
        agents: [],
        budget: { dailyTokenLimit: 100000, alertThreshold: 0.8 },
      }))

      writeFileSync(join(deptDir, 'state.json'), JSON.stringify({
        status: 'stopped',
        pid: null,
        cycleCount: 0,
        tokensUsedToday: 10000,
        budgetResetAt: new Date().toISOString(),
      }))

      // Invalidate repo caches so checkBudget reads fresh files
      deptConfigRepo.invalidate()
      deptStateRepo.invalidate()

      const result = checkBudget(TEST_DEPT_ID)
      assert.equal(result.allowed, true)
      assert.equal(result.ratio, 10000 / 100000)
    })

    it('checkBudget returns warning when above threshold', () => {
      const { checkBudget } = require('../../core/observe/budget.cjs')

      const deptDir = join(DEPTS_DIR, TEST_DEPT_ID)
      mkdirSync(deptDir, { recursive: true })

      writeFileSync(join(deptDir, 'config.json'), JSON.stringify({
        id: TEST_DEPT_ID,
        name: 'Test Budget Dept',
        head: '',
        interval: 600,
        enabled: false,
        agents: [],
        budget: { dailyTokenLimit: 100000, alertThreshold: 0.8 },
      }))

      writeFileSync(join(deptDir, 'state.json'), JSON.stringify({
        status: 'stopped',
        pid: null,
        cycleCount: 0,
        tokensUsedToday: 85000,
        budgetResetAt: new Date().toISOString(),
      }))

      deptConfigRepo.invalidate()
      deptStateRepo.invalidate()

      const result = checkBudget(TEST_DEPT_ID)
      assert.equal(result.allowed, true)
      assert.equal(result.warning, true)
      assert.ok(result.ratio >= 0.8)
    })

    it('checkBudget returns blocked when exceeded', () => {
      const { checkBudget } = require('../../core/observe/budget.cjs')

      const deptDir = join(DEPTS_DIR, TEST_DEPT_ID)
      mkdirSync(deptDir, { recursive: true })

      writeFileSync(join(deptDir, 'config.json'), JSON.stringify({
        id: TEST_DEPT_ID,
        name: 'Test Budget Dept',
        head: '',
        interval: 600,
        enabled: false,
        agents: [],
        budget: { dailyTokenLimit: 100000, alertThreshold: 0.8 },
      }))

      writeFileSync(join(deptDir, 'state.json'), JSON.stringify({
        status: 'stopped',
        pid: null,
        cycleCount: 0,
        tokensUsedToday: 120000,
        budgetResetAt: new Date().toISOString(),
      }))

      deptConfigRepo.invalidate()
      deptStateRepo.invalidate()

      const result = checkBudget(TEST_DEPT_ID)
      assert.equal(result.allowed, false)
      assert.ok(result.reason)
      assert.ok(result.ratio >= 1.0)
    })
  })
})
