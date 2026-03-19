'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { validateBudgetConfig, validateOpenclawConfig } = require('../../../core/common/config-validator.cjs')

describe('config-validator', () => {
  describe('validateBudgetConfig', () => {
    it('accepts valid config', () => {
      const result = validateBudgetConfig({
        company: { dailyTokenLimit: 5000000, monthlyTokenLimit: 100000000, alertThreshold: 0.8 },
        agentDailyLimit: 5,
        overBudgetAction: 'pause_and_notify',
      })
      assert.equal(result.valid, true)
      assert.equal(result.errors.length, 0)
    })

    it('rejects null config', () => {
      const result = validateBudgetConfig(null)
      assert.equal(result.valid, false)
    })

    it('rejects missing company section', () => {
      const result = validateBudgetConfig({ agentDailyLimit: 5 })
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('company')))
    })

    it('rejects negative dailyTokenLimit', () => {
      const result = validateBudgetConfig({
        company: { dailyTokenLimit: -100, monthlyTokenLimit: 100000000 },
      })
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('dailyTokenLimit')))
    })

    it('rejects negative monthlyTokenLimit', () => {
      const result = validateBudgetConfig({
        company: { dailyTokenLimit: 5000000, monthlyTokenLimit: -1 },
      })
      assert.equal(result.valid, false)
    })

    it('rejects alertThreshold > 1', () => {
      const result = validateBudgetConfig({
        company: { alertThreshold: 1.5 },
      })
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('alertThreshold')))
    })

    it('rejects alertThreshold < 0', () => {
      const result = validateBudgetConfig({
        company: { alertThreshold: -0.1 },
      })
      assert.equal(result.valid, false)
    })

    it('warns when dailyTokenLimit > monthlyTokenLimit', () => {
      const result = validateBudgetConfig({
        company: { dailyTokenLimit: 200000000, monthlyTokenLimit: 100000000 },
      })
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('should not exceed')))
    })

    it('rejects negative agentDailyLimit', () => {
      const result = validateBudgetConfig({
        company: { dailyTokenLimit: 5000000 },
        agentDailyLimit: -5,
      })
      assert.equal(result.valid, false)
    })

    it('rejects invalid overBudgetAction', () => {
      const result = validateBudgetConfig({
        company: { dailyTokenLimit: 5000000 },
        overBudgetAction: 'explode',
      })
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('overBudgetAction')))
    })

    it('accepts zero values', () => {
      const result = validateBudgetConfig({
        company: { dailyTokenLimit: 0, monthlyTokenLimit: 0, alertThreshold: 0 },
        agentDailyLimit: 0,
      })
      assert.equal(result.valid, true)
    })

    it('accepts minimal config with only company', () => {
      const result = validateBudgetConfig({
        company: {},
      })
      assert.equal(result.valid, true)
    })
  })

  describe('validateOpenclawConfig', () => {
    it('accepts valid config', () => {
      const result = validateOpenclawConfig({
        port: 19100,
        agents: [{ id: 'ceo', workspace: 'agents/ceo' }],
      })
      assert.equal(result.valid, true)
    })

    it('rejects null config', () => {
      const result = validateOpenclawConfig(null)
      assert.equal(result.valid, false)
    })

    it('rejects invalid port', () => {
      assert.equal(validateOpenclawConfig({ port: 0 }).valid, false)
      assert.equal(validateOpenclawConfig({ port: 70000 }).valid, false)
      assert.equal(validateOpenclawConfig({ port: -1 }).valid, false)
    })

    it('rejects non-array agents', () => {
      const result = validateOpenclawConfig({ agents: 'not-array' })
      assert.equal(result.valid, false)
    })

    it('rejects agent without id', () => {
      const result = validateOpenclawConfig({ agents: [{ workspace: 'test' }] })
      assert.equal(result.valid, false)
    })

    it('rejects agent without workspace', () => {
      const result = validateOpenclawConfig({ agents: [{ id: 'ceo' }] })
      assert.equal(result.valid, false)
    })

    it('accepts empty config', () => {
      const result = validateOpenclawConfig({})
      assert.equal(result.valid, true)
    })
  })
})
