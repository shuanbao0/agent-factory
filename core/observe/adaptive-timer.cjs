'use strict'
/**
 * AdaptiveTimer — 自适应定时器
 *
 * 活跃时加速轮询（2min），空闲时指数退避（最长 30min），预算紧张时降频。
 *
 * 活跃度判定：
 * - active: 部门有 in_progress/review/rework 任务 → 2min
 * - idle: 无待处理任务 → 指数退避 (×1.5) 至 30min
 * - budget_constrained: 预算超限 → 直接 30min
 */

const DEFAULT_MIN_INTERVAL_MS = 120_000    // 2 min
const DEFAULT_MAX_INTERVAL_MS = 1_800_000  // 30 min
const DEFAULT_BACKOFF_FACTOR = 1.5

class AdaptiveTimer {
  /**
   * @param {Object} opts
   * @param {number} [opts.minIntervalMs=120000]
   * @param {number} [opts.maxIntervalMs=1800000]
   * @param {number} [opts.backoffFactor=1.5]
   * @param {function(string): string} opts.getActivityLevel - 返回 'active' | 'idle' | 'budget_constrained'
   */
  constructor(opts = {}) {
    this._minMs = opts.minIntervalMs || DEFAULT_MIN_INTERVAL_MS
    this._maxMs = opts.maxIntervalMs || DEFAULT_MAX_INTERVAL_MS
    this._backoff = opts.backoffFactor || DEFAULT_BACKOFF_FACTOR
    this._getActivityLevel = opts.getActivityLevel
    this._currentInterval = new Map() // deptId → current interval ms
    this._eventCooldown = new Map()   // deptId → timestamp of last event-triggered cycle
  }

  /**
   * 根据活跃度返回动态间隔
   * @param {string} deptId
   * @returns {number} ms
   */
  nextInterval(deptId) {
    const level = this._getActivityLevel(deptId)

    if (level === 'budget_constrained') {
      this._currentInterval.set(deptId, this._maxMs)
      return this._maxMs
    }

    if (level === 'active') {
      this._currentInterval.set(deptId, this._minMs)
      return this._minMs
    }

    // idle: exponential backoff
    const current = this._currentInterval.get(deptId) || this._minMs
    const next = Math.min(Math.round(current * this._backoff), this._maxMs)
    this._currentInterval.set(deptId, next)
    return next
  }

  /**
   * 事件触发后记录冷却，避免与轮询重复
   * @param {string} deptId
   */
  recordEventTriggered(deptId) {
    this._eventCooldown.set(deptId, Date.now())
  }

  /**
   * 新任务到达时重置为最短间隔
   * @param {string} deptId
   */
  reset(deptId) {
    this._currentInterval.set(deptId, this._minMs)
    this._eventCooldown.delete(deptId)
  }
}

module.exports = { AdaptiveTimer }
