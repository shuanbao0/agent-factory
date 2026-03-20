'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { BUILTIN_STRATEGIES, getStrategy, REQUIRED_FIELDS } = require('../../../core/task/strategy.cjs')

describe('TaskStrategy', () => {
  it('returns correct strategy for known type', () => {
    const s = getStrategy('writing')
    assert.equal(s.idleThresholdMins, 60)
    assert.equal(s.staleThresholdMins, 120)
    assert.equal(s.minPassingScore, 70)
    assert.ok(Array.isArray(s.preferredReviewers))
  })

  it('returns _fallback for unknown type', () => {
    const s = getStrategy('unknown-type')
    assert.equal(s.idleThresholdMins, 20)
    assert.equal(s.staleThresholdMins, 45)
    assert.equal(s.minPassingScore, 60)
  })

  it('returns _fallback for null/undefined type', () => {
    assert.equal(getStrategy(null).idleThresholdMins, 20)
    assert.equal(getStrategy(undefined).idleThresholdMins, 20)
    assert.equal(getStrategy('').idleThresholdMins, 20)
  })

  it('department config partial override merges with builtin', () => {
    const deptConfig = {
      workflow: {
        strategies: {
          writing: { idleThresholdMins: 90 },
        },
      },
    }
    const s = getStrategy('writing', deptConfig)
    assert.equal(s.idleThresholdMins, 90)        // overridden
    assert.equal(s.staleThresholdMins, 120)       // from builtin
    assert.equal(s.minPassingScore, 70)            // from builtin
    assert.deepEqual(s.preferredReviewers, [])  // builtin has empty, dept can override
  })

  it('department config full override replaces all fields', () => {
    const deptConfig = {
      workflow: {
        strategies: {
          coding: {
            idleThresholdMins: 10,
            staleThresholdMins: 20,
            minPassingScore: 90,
            preferredReviewers: ['code-reviewer'],
          },
        },
      },
    }
    const s = getStrategy('coding', deptConfig)
    assert.equal(s.idleThresholdMins, 10)
    assert.equal(s.staleThresholdMins, 20)
    assert.equal(s.minPassingScore, 90)
    assert.deepEqual(s.preferredReviewers, ['code-reviewer'])
  })

  it('all builtin strategies have required fields', () => {
    for (const [key, strategy] of Object.entries(BUILTIN_STRATEGIES)) {
      for (const field of REQUIRED_FIELDS) {
        assert.ok(
          field in strategy,
          `Strategy '${key}' missing required field '${field}'`
        )
      }
    }
  })

  it('ignores non-object department override', () => {
    const s = getStrategy('writing', { workflow: { strategies: { writing: 'invalid' } } })
    assert.equal(s.idleThresholdMins, 60) // builtin, not overridden
  })

  it('works with no deptConfig', () => {
    const s = getStrategy('coding', undefined)
    assert.equal(s.idleThresholdMins, 20)
  })

  it('returns strategy for new universal types', () => {
    for (const type of ['design', 'marketing', 'tutorial', 'operations', 'finance', 'review']) {
      const s = getStrategy(type)
      assert.ok(s.idleThresholdMins > 0, `${type} should have idleThresholdMins`)
      assert.ok(s.minPassingScore >= 60, `${type} should have minPassingScore >= 60`)
      assert.ok(Array.isArray(s.preferredReviewers), `${type} should have preferredReviewers array`)
    }
  })
})
