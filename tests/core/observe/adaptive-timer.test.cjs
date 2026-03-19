'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { AdaptiveTimer } = require('../../../core/observe/adaptive-timer.cjs')

describe('AdaptiveTimer', () => {
  it('returns minInterval for active departments', () => {
    const timer = new AdaptiveTimer({
      minIntervalMs: 120_000,
      maxIntervalMs: 1_800_000,
      getActivityLevel: () => 'active',
    })
    assert.equal(timer.nextInterval('novel'), 120_000)
    assert.equal(timer.nextInterval('novel'), 120_000) // stays at min
  })

  it('returns maxInterval for budget_constrained departments', () => {
    const timer = new AdaptiveTimer({
      minIntervalMs: 120_000,
      maxIntervalMs: 1_800_000,
      getActivityLevel: () => 'budget_constrained',
    })
    assert.equal(timer.nextInterval('novel'), 1_800_000)
  })

  it('applies exponential backoff for idle departments', () => {
    const timer = new AdaptiveTimer({
      minIntervalMs: 120_000,
      maxIntervalMs: 1_800_000,
      backoffFactor: 1.5,
      getActivityLevel: () => 'idle',
    })
    const i1 = timer.nextInterval('novel') // 120_000 * 1.5 = 180_000
    const i2 = timer.nextInterval('novel') // 180_000 * 1.5 = 270_000
    const i3 = timer.nextInterval('novel') // 270_000 * 1.5 = 405_000

    assert.equal(i1, 180_000)
    assert.equal(i2, 270_000)
    assert.equal(i3, 405_000)
  })

  it('caps backoff at maxInterval', () => {
    const timer = new AdaptiveTimer({
      minIntervalMs: 1_000_000,
      maxIntervalMs: 1_200_000,
      backoffFactor: 2.0,
      getActivityLevel: () => 'idle',
    })
    const i1 = timer.nextInterval('d') // min(1M * 2, 1.2M) = 1.2M
    const i2 = timer.nextInterval('d') // min(1.2M * 2, 1.2M) = 1.2M
    assert.equal(i1, 1_200_000)
    assert.equal(i2, 1_200_000)
  })

  it('reset() brings interval back to minimum', () => {
    const timer = new AdaptiveTimer({
      minIntervalMs: 100,
      maxIntervalMs: 10_000,
      backoffFactor: 2.0,
      getActivityLevel: () => 'idle',
    })
    timer.nextInterval('d') // 200
    timer.nextInterval('d') // 400
    timer.reset('d')
    const after = timer.nextInterval('d') // should be 100 * 2 = 200 (reset to min, then backoff once)
    assert.equal(after, 200)
  })

  it('tracks departments independently', () => {
    let levels = { a: 'active', b: 'idle' }
    const timer = new AdaptiveTimer({
      minIntervalMs: 100,
      maxIntervalMs: 10_000,
      backoffFactor: 2.0,
      getActivityLevel: (id) => levels[id] || 'idle',
    })
    const ia = timer.nextInterval('a')
    const ib = timer.nextInterval('b')
    assert.equal(ia, 100)
    assert.equal(ib, 200)
  })
})
