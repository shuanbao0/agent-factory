'use strict'
/**
 * Retry — 指数退避重试 + 熔断器
 *
 * 设计模式：Retry/Decorator + Circuit Breaker（三态状态机）
 *
 * 职责：
 * - withRetry()：包装异步函数，自动重试可恢复错误（429/5xx/网络超时）
 * - isRetryableError()：判断 Anthropic API 错误是否可重试
 * - CircuitBreaker：连续失败超过阈值后熔断，防止级联故障
 *
 * 被 anthropic-client.cjs 使用，为 LLM API 调用提供弹性保护
 */

/**
 * 为异步函数添加指数退避重试逻辑
 *
 * 退避策略：delay = baseDelay × 2^attempt，不超过剩余截止时间
 * 超过 timeoutMs 总时限或 maxRetries 次数后放弃
 *
 * @param {() => Promise<T>} fn - 要重试的异步函数
 * @param {Object} [opts]
 * @param {number} [opts.maxRetries=3] - 最大重试次数
 * @param {number} [opts.baseDelayMs=1000] - 基础延迟（毫秒）
 * @param {number} [opts.timeoutMs=60000] - 所有尝试的总时限（毫秒）
 * @param {(err: Error) => boolean} [opts.retryOn] - 自定义判断：返回 true 表示可重试
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
    // 检查是否已超时
    if (Date.now() >= deadline) {
      throw lastError || new Error('Retry timeout exceeded')
    }

    try {
      return await fn()
    } catch (err) {
      lastError = err

      // 已达最大重试次数，或错误不可重试 → 直接抛出
      if (attempt >= maxRetries || !retryOn(err)) {
        throw err
      }

      // 指数退避等待，但不超过剩余时间
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), deadline - Date.now())
      if (delay <= 0) throw err

      await new Promise(r => setTimeout(r, delay))
    }
  }

  throw lastError
}

/**
 * 判断 Anthropic API 错误是否可重试
 *
 * 可重试的情况：
 * - 429：频率限制（Rate Limit）
 * - 5xx：服务端错误
 * - 529：过载（Overloaded）
 * - 网络错误：ECONNRESET / ETIMEDOUT / ENOTFOUND / socket hang up
 *
 * @param {Error} err - 错误对象
 * @returns {boolean}
 */
function isRetryableError(err) {
  if (!err) return false
  const msg = err.message || ''
  const status = err.status || err.statusCode || 0

  if (status === 429) return true                       // 频率限制
  if (status >= 500 && status < 600) return true        // 服务端错误
  if (status === 529) return true                       // 过载
  // 网络错误
  if (msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) return true
  if (msg.includes('socket hang up') || msg.includes('network')) return true

  return false
}

/**
 * CircuitBreaker — 熔断器
 *
 * 设计模式：Circuit Breaker（三态状态机）
 *
 * 状态流转：
 *   CLOSED（正常） → 连续失败达阈值 → OPEN（熔断，拒绝所有请求）
 *   OPEN → 等待 resetTimeout → HALF_OPEN（试探性放行一个请求）
 *   HALF_OPEN → 成功 → CLOSED / 失败 → OPEN
 *
 * 用途：防止持续向已知故障的 API 发送请求，给下游恢复的时间
 */
class CircuitBreaker {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.failureThreshold=5] - 连续失败多少次后熔断
   * @param {number} [opts.resetTimeoutMs=60000] - 熔断后多久尝试恢复（毫秒）
   */
  constructor(opts = {}) {
    this._failureThreshold = opts.failureThreshold ?? 5
    this._resetTimeoutMs = opts.resetTimeoutMs ?? 60000
    this._state = 'CLOSED'          // 当前状态
    this._failureCount = 0          // 连续失败计数
    this._lastFailureTime = 0       // 最近一次失败时间戳
  }

  get state() { return this._state }
  get failureCount() { return this._failureCount }

  /**
   * 通过熔断器执行异步函数
   *
   * - CLOSED：正常执行
   * - OPEN：检查是否到了恢复时间，是则进入 HALF_OPEN，否则直接拒绝
   * - HALF_OPEN：放行一个请求，成功则恢复 CLOSED，失败则重新 OPEN
   *
   * @param {() => Promise<T>} fn - 要执行的函数
   * @returns {Promise<T>}
   * @template T
   */
  async execute(fn) {
    if (this._state === 'OPEN') {
      // 检查是否到了恢复时间
      if (Date.now() - this._lastFailureTime >= this._resetTimeoutMs) {
        this._state = 'HALF_OPEN'  // 进入试探状态
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

  /** 成功回调：重置计数，恢复 CLOSED */
  _onSuccess() {
    this._failureCount = 0
    this._state = 'CLOSED'
  }

  /** 失败回调：累加计数，达阈值则熔断 */
  _onFailure() {
    this._failureCount++
    this._lastFailureTime = Date.now()
    if (this._failureCount >= this._failureThreshold) {
      this._state = 'OPEN'
    }
  }

  /** 手动重置熔断器（用于测试或手动恢复） */
  reset() {
    this._state = 'CLOSED'
    this._failureCount = 0
    this._lastFailureTime = 0
  }
}

module.exports = { withRetry, isRetryableError, CircuitBreaker }
