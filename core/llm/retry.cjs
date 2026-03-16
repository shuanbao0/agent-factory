'use strict'
/**
 * Retry — exponential backoff wrapper + circuit breaker.
 *
 * Used by anthropic-client.cjs to handle transient API failures
 * (429 rate limit, 500 server error, network timeouts).
 */

/**
 * Wrap an async function with retry + exponential backoff.
 *
 * @param {() => Promise<T>} fn - The function to retry
 * @param {Object} [opts]
 * @param {number} [opts.maxRetries=3]
 * @param {number} [opts.baseDelayMs=1000]
 * @param {number} [opts.timeoutMs=60000] - Total timeout for all attempts
 * @param {(err: Error) => boolean} [opts.retryOn] - Return true if error is retryable
 * @returns {Promise<T>}
 * @template T
 */
async function withRetry(fn, opts = {}) {
  const maxRetries = opts.maxRetries ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 1000
  const timeoutMs = opts.timeoutMs ?? 60000
  const retryOn = opts.retryOn || (() => true)

  const deadline = Date.now() + timeoutMs
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (Date.now() >= deadline) {
      throw lastError || new Error('Retry timeout exceeded')
    }

    try {
      return await fn()
    } catch (err) {
      lastError = err

      if (attempt >= maxRetries || !retryOn(err)) {
        throw err
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), deadline - Date.now())
      if (delay <= 0) throw err

      await new Promise(r => setTimeout(r, delay))
    }
  }

  throw lastError
}

/**
 * Determine if an Anthropic API error is retryable.
 *
 * @param {Error} err
 * @returns {boolean}
 */
function isRetryableError(err) {
  if (!err) return false
  const msg = err.message || ''
  const status = err.status || err.statusCode || 0

  // Rate limit
  if (status === 429) return true
  // Server errors
  if (status >= 500 && status < 600) return true
  // Overloaded
  if (status === 529) return true
  // Network errors
  if (msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) return true
  if (msg.includes('socket hang up') || msg.includes('network')) return true

  return false
}

/**
 * CircuitBreaker — prevents cascading failures by short-circuiting
 * calls when consecutive failures exceed a threshold.
 *
 * States: CLOSED (normal) → OPEN (rejecting) → HALF_OPEN (testing)
 */
class CircuitBreaker {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.failureThreshold=5] - Failures before opening
   * @param {number} [opts.resetTimeoutMs=60000] - Time before trying again
   */
  constructor(opts = {}) {
    this._failureThreshold = opts.failureThreshold ?? 5
    this._resetTimeoutMs = opts.resetTimeoutMs ?? 60000
    this._state = 'CLOSED'
    this._failureCount = 0
    this._lastFailureTime = 0
  }

  get state() { return this._state }
  get failureCount() { return this._failureCount }

  /**
   * Execute a function through the circuit breaker.
   *
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   * @template T
   */
  async execute(fn) {
    if (this._state === 'OPEN') {
      if (Date.now() - this._lastFailureTime >= this._resetTimeoutMs) {
        this._state = 'HALF_OPEN'
      } else {
        throw new Error('Circuit breaker is OPEN — request rejected')
      }
    }

    try {
      const result = await fn()
      this._onSuccess()
      return result
    } catch (err) {
      this._onFailure()
      throw err
    }
  }

  _onSuccess() {
    this._failureCount = 0
    this._state = 'CLOSED'
  }

  _onFailure() {
    this._failureCount++
    this._lastFailureTime = Date.now()
    if (this._failureCount >= this._failureThreshold) {
      this._state = 'OPEN'
    }
  }

  reset() {
    this._state = 'CLOSED'
    this._failureCount = 0
    this._lastFailureTime = 0
  }
}

module.exports = { withRetry, isRetryableError, CircuitBreaker }
