'use strict'
/**
 * CycleMonitorReactor — 部门循环耗时监控
 *
 * 设计模式：Reactor / Observer + 滑动窗口分析
 *
 * 职责：
 * - 监听 EventBus 的 cycle.end 事件
 * - 维护每个部门最近 10 轮循环的耗时记录（滑动窗口）
 * - 检测连续慢周期：当前耗时 > 2 倍平均值，且连续 3 次 → 触发告警
 * - 告警后重置计数器，避免重复告警
 *
 * 告警事件：alert.cycle_slowdown
 */

const logger = require('../../common/logger.cjs')

/** 滑动窗口大小（保留最近 N 轮数据） */
const MAX_HISTORY = 10
/** 慢周期判定倍数（当前耗时 > 平均值 × 此倍数） */
const SLOWDOWN_MULTIPLIER = 2
/** 连续慢周期告警阈值 */
const CONSECUTIVE_SLOW_THRESHOLD = 3

/**
 * 在 EventBus 上注册循环监控 Reactor
 *
 * @param {import('../event-bus.cjs').EventBus} bus - 事件总线
 * @param {Object} [opts]
 * @param {number} [opts.multiplier] - 慢周期判定倍数（默认 2x）
 * @param {number} [opts.consecutiveThreshold] - 连续慢周期告警阈值（默认 3 次）
 * @returns {{ deptHistory: Object }} 内部状态（便于测试）
 */
function register(bus, opts = {}) {
  const multiplier = opts.multiplier ?? SLOWDOWN_MULTIPLIER
  const consecutiveThreshold = opts.consecutiveThreshold ?? CONSECUTIVE_SLOW_THRESHOLD

  /** @type {Record<string, {durations: number[], consecutiveSlow: number}>} 部门 → 历史数据 */
  const deptHistory = {}

  bus.on('cycle.end', (event) => {
    try {
      const deptId = event.deptId
      const durationMs = event.durationMs
      if (!deptId || typeof durationMs !== 'number') return

      // 初始化部门历史
      if (!deptHistory[deptId]) {
        deptHistory[deptId] = { durations: [], consecutiveSlow: 0 }
      }
      const hist = deptHistory[deptId]

      // 计算当前平均值（添加新数据前）
      const avg = hist.durations.length > 0
        ? hist.durations.reduce((a, b) => a + b, 0) / hist.durations.length
        : durationMs  // 首次循环，无基线

      // 添加新数据点，维护滑动窗口
      hist.durations.push(durationMs)
      if (hist.durations.length > MAX_HISTORY) {
        hist.durations.shift()
      }

      // 慢周期检测（至少 3 个数据点后才有意义）
      if (hist.durations.length >= 3 && durationMs > avg * multiplier) {
        hist.consecutiveSlow++
      } else {
        hist.consecutiveSlow = 0  // 正常周期，重置计数
      }

      // 连续慢周期达阈值 → 触发告警
      if (hist.consecutiveSlow >= consecutiveThreshold) {
        bus.fire('alert.cycle_slowdown', {
          deptId,
          currentDurationMs: durationMs,
          averageDurationMs: Math.round(avg),
          consecutiveSlow: hist.consecutiveSlow,
        })
        // 重置计数，避免重复告警
        hist.consecutiveSlow = 0
      }
    } catch (err) {
      // Reactor 错误不传播
      logger.debug('cycle-monitor', 'reactor error on cycle.end', { error: err.message })
    }
  })

  return { deptHistory }
}

module.exports = { register, MAX_HISTORY, SLOWDOWN_MULTIPLIER, CONSECUTIVE_SLOW_THRESHOLD }
