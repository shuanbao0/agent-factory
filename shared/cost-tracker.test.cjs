'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { calculateCost, PRICING } = require('./cost-tracker.cjs')

describe('cost-tracker', () => {
  describe('calculateCost', () => {
    it('calculates cost for claude-sonnet-4-6', () => {
      const cost = calculateCost('claude-sonnet-4-6', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      })
      // $3 input + $15 output = $18
      assert.equal(cost, 18.0)
    })

    it('calculates cost for claude-opus-4-6', () => {
      const cost = calculateCost('claude-opus-4-6', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      })
      // $15 input + $75 output = $90
      assert.equal(cost, 90.0)
    })

    it('calculates cost for haiku', () => {
      const cost = calculateCost('claude-haiku-4-5', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      })
      // $0.80 input + $4 output = $4.80
      assert.equal(cost, 4.8)
    })

    it('returns 0 for MiniMax (free tier)', () => {
      const cost = calculateCost('MiniMax-M2.5', {
        inputTokens: 5_000_000,
        outputTokens: 5_000_000,
      })
      assert.equal(cost, 0)
    })

    it('handles null/undefined usage', () => {
      assert.equal(calculateCost('claude-sonnet-4-6', null), 0)
      assert.equal(calculateCost('claude-sonnet-4-6', undefined), 0)
    })

    it('handles partial usage (inputTokens only)', () => {
      const cost = calculateCost('claude-sonnet-4-6', {
        inputTokens: 500_000,
      })
      // $3 * 0.5 = $1.50
      assert.equal(cost, 1.5)
    })

    it('falls back to sonnet pricing for unknown model', () => {
      const cost = calculateCost('some-unknown-model', {
        inputTokens: 1_000_000,
        outputTokens: 0,
      })
      assert.equal(cost, 3.0)
    })

    it('matches model by substring', () => {
      // e.g. "anthropic/claude-sonnet-4-6" contains "claude-sonnet-4-6"
      const cost = calculateCost('anthropic/claude-sonnet-4-6', {
        inputTokens: 1_000_000,
        outputTokens: 0,
      })
      assert.equal(cost, 3.0)
    })

    it('calculates small token counts accurately', () => {
      const cost = calculateCost('claude-sonnet-4-6', {
        inputTokens: 1000,
        outputTokens: 500,
      })
      // 1000 * 3/1M + 500 * 15/1M = 0.003 + 0.0075 = 0.0105
      assert.ok(Math.abs(cost - 0.0105) < 0.0001)
    })
  })

  describe('PRICING', () => {
    it('has all expected models', () => {
      assert.ok(PRICING['claude-sonnet-4-6'])
      assert.ok(PRICING['claude-opus-4-6'])
      assert.ok(PRICING['claude-haiku-4-5'])
      assert.ok(PRICING['MiniMax-M2.5'])
    })

    it('all prices are non-negative', () => {
      for (const [model, price] of Object.entries(PRICING)) {
        assert.ok(price.input >= 0, `${model} input price is negative`)
        assert.ok(price.output >= 0, `${model} output price is negative`)
      }
    })
  })
})
