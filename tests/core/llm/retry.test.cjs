'use strict'
const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { withRetry, isRetryableError, CircuitBreaker } = require('../../../core/llm/retry.cjs')

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(() => Promise.resolve(42))
    assert.equal(result, 42)
  })

  it('retries on failure and succeeds', async () => {
    let attempt = 0
    const result = await withRetry(() => {
      attempt++
      if (attempt < 3) throw new Error('fail')
      return Promise.resolve('ok')
    }, { baseDelayMs: 10 })
    assert.equal(result, 'ok')
    assert.equal(attempt, 3)
  })

  it('throws after max retries', async () => {
    let attempt = 0
    await assert.rejects(
      () => withRetry(() => {
        attempt++
        throw new Error('always fails')
      }, { maxRetries: 2, baseDelayMs: 10 }),
      { message: 'always fails' }
    )
    assert.equal(attempt, 3) // initial + 2 retries
  })

  it('skips retry when retryOn returns false', async () => {
    let attempt = 0
    await assert.rejects(
      () => withRetry(() => {
        attempt++
        throw new Error('not retryable')
      }, { maxRetries: 3, baseDelayMs: 10, retryOn: () => false }),
      { message: 'not retryable' }
    )
    assert.equal(attempt, 1)
  })

  it('respects timeout', async () => {
    await assert.rejects(
      () => withRetry(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 50)),
        { maxRetries: 10, baseDelayMs: 50, timeoutMs: 100 }
      ),
      { message: 'slow' }
    )
  })

  it('uses exponential backoff', async () => {
    const timestamps = []
    let attempt = 0
    try {
      await withRetry(() => {
        timestamps.push(Date.now())
        attempt++
        if (attempt <= 3) throw new Error('fail')
        return Promise.resolve('ok')
      }, { maxRetries: 3, baseDelayMs: 50 })
    } catch { /* expected */ }
    // Each delay should be roughly double the previous
    if (timestamps.length >= 3) {
      const delay1 = timestamps[1] - timestamps[0]
      const delay2 = timestamps[2] - timestamps[1]
      assert.ok(delay2 >= delay1 * 1.5, `delay2 (${delay2}) should be >= 1.5x delay1 (${delay1})`)
    }
  })
})

describe('isRetryableError', () => {
  it('returns true for 429', () => {
    const err = new Error('rate limited')
    err.status = 429
    assert.equal(isRetryableError(err), true)
  })

  it('returns true for 500', () => {
    const err = new Error('server error')
    err.status = 500
    assert.equal(isRetryableError(err), true)
  })

  it('returns true for 529 overloaded', () => {
    const err = new Error('overloaded')
    err.status = 529
    assert.equal(isRetryableError(err), true)
  })

  it('returns true for network errors', () => {
    assert.equal(isRetryableError(new Error('ECONNRESET')), true)
    assert.equal(isRetryableError(new Error('ETIMEDOUT')), true)
    assert.equal(isRetryableError(new Error('socket hang up')), true)
  })

  it('returns false for non-retryable errors', () => {
    const err = new Error('invalid api key')
    err.status = 401
    assert.equal(isRetryableError(err), false)
  })

  it('returns false for null', () => {
    assert.equal(isRetryableError(null), false)
  })
})

describe('CircuitBreaker', () => {
  let cb

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 100 })
  })

  it('starts in CLOSED state', () => {
    assert.equal(cb.state, 'CLOSED')
  })

  it('stays CLOSED on success', async () => {
    await cb.execute(() => Promise.resolve('ok'))
    assert.equal(cb.state, 'CLOSED')
    assert.equal(cb.failureCount, 0)
  })

  it('opens after threshold failures', async () => {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => cb.execute(() => { throw new Error('fail') }))
    }
    assert.equal(cb.state, 'OPEN')
    assert.equal(cb.failureCount, 3)
  })

  it('rejects when OPEN', async () => {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => cb.execute(() => { throw new Error('fail') }))
    }
    await assert.rejects(
      () => cb.execute(() => Promise.resolve('ok')),
      { message: 'Circuit breaker is OPEN — request rejected' }
    )
  })

  it('transitions to HALF_OPEN after reset timeout', async () => {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => cb.execute(() => { throw new Error('fail') }))
    }
    assert.equal(cb.state, 'OPEN')
    // Wait for reset timeout
    await new Promise(r => setTimeout(r, 120))
    const result = await cb.execute(() => Promise.resolve('recovered'))
    assert.equal(result, 'recovered')
    assert.equal(cb.state, 'CLOSED')
  })

  it('re-opens on failure during HALF_OPEN', async () => {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => cb.execute(() => { throw new Error('fail') }))
    }
    await new Promise(r => setTimeout(r, 120))
    await assert.rejects(() => cb.execute(() => { throw new Error('still failing') }))
    assert.equal(cb.state, 'OPEN')
  })

  it('resets on success after failures below threshold', async () => {
    await assert.rejects(() => cb.execute(() => { throw new Error('fail') }))
    assert.equal(cb.failureCount, 1)
    await cb.execute(() => Promise.resolve('ok'))
    assert.equal(cb.failureCount, 0)
    assert.equal(cb.state, 'CLOSED')
  })

  it('reset() clears state', async () => {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => cb.execute(() => { throw new Error('fail') }))
    }
    cb.reset()
    assert.equal(cb.state, 'CLOSED')
    assert.equal(cb.failureCount, 0)
  })
})
