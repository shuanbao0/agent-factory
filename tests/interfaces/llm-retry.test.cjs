'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { withRetry, CircuitBreaker, isRetryableError } = require('../../core/llm/retry.cjs')

function makeError(status) {
  const err = new Error(`HTTP ${status}`)
  err.status = status
  return err
}

describe('withRetry', () => {
  it('successful function returns result', async () => {
    const result = await withRetry(async () => 42)
    assert.equal(result, 42)
  })

  it('retries on failure then succeeds', async () => {
    let count = 0
    const fn = async () => {
      count++
      if (count < 3) throw new Error('fail')
      return 'ok'
    }
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })
    assert.equal(result, 'ok')
    assert.equal(count, 3)
  })

  it('gives up after maxRetries', async () => {
    const fn = async () => { throw new Error('always fails') }
    await assert.rejects(
      () => withRetry(fn, { maxRetries: 2, baseDelayMs: 1 }),
      { message: 'always fails' }
    )
  })
})

describe('isRetryableError', () => {
  it('429 status → true', () => {
    assert.equal(isRetryableError(makeError(429)), true)
  })

  it('500 status → true', () => {
    assert.equal(isRetryableError(makeError(500)), true)
  })

  it('400 status → false', () => {
    assert.equal(isRetryableError(makeError(400)), false)
  })

  it('network error (ECONNRESET) → true', () => {
    const err = new Error('connect ECONNRESET 127.0.0.1')
    assert.equal(isRetryableError(err), true)
  })

  it('null/undefined → false', () => {
    assert.equal(isRetryableError(null), false)
    assert.equal(isRetryableError(undefined), false)
  })
})

describe('CircuitBreaker', () => {
  let breaker

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 50 })
  })

  it('starts in CLOSED state', () => {
    assert.equal(breaker.state, 'CLOSED')
    assert.equal(breaker.failureCount, 0)
  })

  it('opens after failureThreshold failures', async () => {
    const fn = async () => { throw new Error('fail') }
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute(fn))
    }
    assert.equal(breaker.state, 'OPEN')
  })

  it('rejects calls when OPEN', async () => {
    const fn = async () => { throw new Error('fail') }
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute(fn))
    }
    await assert.rejects(
      () => breaker.execute(async () => 'should not run'),
      { message: /Circuit breaker is OPEN/ }
    )
  })

  it('transitions to HALF_OPEN after timeout', async () => {
    const fn = async () => { throw new Error('fail') }
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute(fn))
    }
    assert.equal(breaker.state, 'OPEN')

    // Wait for resetTimeoutMs
    await new Promise(r => setTimeout(r, 60))

    // Next execute should transition to HALF_OPEN (then succeed → CLOSED, or fail → OPEN)
    const result = await breaker.execute(async () => 'recovered')
    assert.equal(result, 'recovered')
    assert.equal(breaker.state, 'CLOSED')
  })

  it('reset() returns to CLOSED', async () => {
    const fn = async () => { throw new Error('fail') }
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute(fn))
    }
    assert.equal(breaker.state, 'OPEN')
    breaker.reset()
    assert.equal(breaker.state, 'CLOSED')
    assert.equal(breaker.failureCount, 0)
  })

  it('successful call in HALF_OPEN transitions to CLOSED', async () => {
    const fn = async () => { throw new Error('fail') }
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute(fn))
    }

    await new Promise(r => setTimeout(r, 60))

    await breaker.execute(async () => 'ok')
    assert.equal(breaker.state, 'CLOSED')
    assert.equal(breaker.failureCount, 0)
  })
})
