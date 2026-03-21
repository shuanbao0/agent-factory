'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')

const { EVENTS_FILE } = require('../../core/common/paths.cjs')
const { calculateCost, trackCost, queryCosts, getDailySummary, PRICING, COSTS_FILE } = require('../../core/observe/cost-tracker.cjs')
let originalSize = null
let originalEventsSize = null

afterEach(() => {
  // Restore COSTS_FILE to original size if we appended during test
  if (originalSize !== null && fs.existsSync(COSTS_FILE)) {
    fs.truncateSync(COSTS_FILE, originalSize)
    originalSize = null
  }
  // Restore EVENTS_FILE too (trackCost fires events via EventBus)
  if (originalEventsSize !== null && fs.existsSync(EVENTS_FILE)) {
    fs.truncateSync(EVENTS_FILE, originalEventsSize)
    originalEventsSize = null
  }
})

describe('CostTracker', () => {
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
    // Record file sizes before test
    originalSize = fs.existsSync(COSTS_FILE) ? fs.statSync(COSTS_FILE).size : 0
    originalEventsSize = fs.existsSync(EVENTS_FILE) ? fs.statSync(EVENTS_FILE).size : 0

    const uniqueSource = `zzz-test-cost-${Date.now()}`
    trackCost({
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 100, outputTokens: 50 },
      source: uniqueSource,
    })

    const result = queryCosts({ source: uniqueSource })
    assert.ok(result.entries.length >= 1, 'should find at least 1 entry with unique source')
    assert.equal(result.entries[0].source, uniqueSource)
    assert.ok(result.totalCost > 0)
  })
})
