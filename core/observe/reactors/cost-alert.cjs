'use strict'
/**
 * CostAlertReactor — 日成本超限告警
 *
 * 设计模式：Reactor / Observer + 状态跟踪
 *
 * 职责：
 * - 监听 EventBus 的 cost.tracked 事件
 * - 累计每日成本，超过阈值时触发 alert.cost_exceeded 事件
 * - 每天只告警一次（alerted 标记），避免重复通知
 *
 * 默认阈值：$10/天
 */

/** 默认日成本告警阈值（USD） */
const DEFAULT_DAILY_THRESHOLD_USD = 10

/**
 * 在 EventBus 上注册成本告警 Reactor
 *
 * @param {import('../event-bus.cjs').EventBus} bus - 事件总线
 * @param {Object} [opts]
 * @param {number} [opts.dailyThreshold] - 日成本阈值（USD），默认 $10
 * @returns {{ dailyTotals: Object, alerted: Object, threshold: number }} 内部状态（便于测试）
 */
function register(bus, opts = {}) {
  const threshold = opts.dailyThreshold ?? DEFAULT_DAILY_THRESHOLD_USD
  const dailyTotals = {}  // date → 当日累计成本
  let alerted = {}        // date → true（已告警标记，每天只告一次）

  bus.on('cost.tracked', (event) => {
    try {
      const date = event.ts?.slice(0, 10) || new Date().toISOString().slice(0, 10)
      const cost = event.cost || 0

      // 累加当日成本
      dailyTotals[date] = (dailyTotals[date] || 0) + cost

      // 超过阈值且今天还没告警过 → 发射告警事件
      if (dailyTotals[date] >= threshold && !alerted[date]) {
        alerted[date] = true
        bus.fire('alert.cost_exceeded', {
          date,
          totalCost: Math.round(dailyTotals[date] * 1_000_000) / 1_000_000,
          threshold,
          source: event.source,
        })
      }
    } catch {
      // Reactor 错误不传播
    }
  })

  return { dailyTotals, alerted, threshold }
}

module.exports = { register, DEFAULT_DAILY_THRESHOLD_USD }
