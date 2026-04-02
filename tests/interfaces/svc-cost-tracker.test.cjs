'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { cleanTestDataFromDb } = require('../_helpers/db-cleanup.cjs')

const { calculateCost, trackCost, queryCosts, getDailySummary, PRICING } = require('../../core/observe/cost-tracker.cjs')

describe('CostTracker', () => {
  afterEach(() => {
    cleanTestDataFromDb()
  })

  it('PRICING is an object with model keys', () => {
    assert.equal(typeof PRICING, 'object')
    assert.ok(PRICING !== null)
    assert.ok(Object.keys(PRICING).length > 0)
  })

  it('calculateCost with known model returns positive number', () => {
    const cost = calculateCost('claude-sonnet-4-6', { inputTokens: 1000, outputTokens: 500 })
    assert.equal(typeof cost, 'number')
    assert.ok(cost > 0)
  })

  it('calculateCost with zero tokens returns 0', () => {
    const cost = calculateCost('claude-sonnet-4-6', { inputTokens: 0, outputTokens: 0 })
    assert.equal(cost, 0)
  })

  it('calculateCost with unknown model falls back (does not throw)', () => {
    const cost = calculateCost('nonexistent-model-xyz', { inputTokens: 1000, outputTokens: 500 })
    assert.equal(typeof cost, 'number')
    assert.ok(cost >= 0)
  })

  it('queryCosts returns object with entries array, totalCost, totalInputTokens, totalOutputTokens', () => {
    const result = queryCosts()
    assert.equal(typeof result, 'object')
    assert.ok(Array.isArray(result.entries))
    assert.equal(typeof result.totalCost, 'number')
    assert.equal(typeof result.totalInputTokens, 'number')
    assert.equal(typeof result.totalOutputTokens, 'number')
  })

  it('getDailySummary returns array', () => {
    const summary = getDailySummary()
    assert.ok(Array.isArray(summary))
  })

  it('trackCost + queryCosts integration', () => {
    const uniqueSource = `zzz-test-cost-${Date.now()}`
    trackCost({
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 100, outputTokens: 50 },
      source: uniqueSource,
      agentId: `zzz-test-agent-${Date.now()}`,
    })

    const result = queryCosts({ source: uniqueSource })
    assert.ok(result.entries.length >= 1, 'should find at least 1 entry with unique source')
    assert.equal(result.entries[0].source, uniqueSource)
    assert.ok(result.totalCost > 0)
  })
})
