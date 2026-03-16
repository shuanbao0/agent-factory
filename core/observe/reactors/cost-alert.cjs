'use strict'
/**
 * Cost Alert Reactor — monitors cumulative daily costs and emits alerts.
 *
 * Listens to `cost.tracked` events and fires `alert.cost_exceeded`
 * when daily cost exceeds a configurable threshold.
 */

const DEFAULT_DAILY_THRESHOLD_USD = 10

/**
 * Register the cost-alert reactor on an event bus.
 *
 * @param {import('../event-bus.cjs').EventBus} bus
 * @param {Object} [opts]
 * @param {number} [opts.dailyThreshold] - USD threshold per day (default $10)
 */
function register(bus, opts = {}) {
  const threshold = opts.dailyThreshold ?? DEFAULT_DAILY_THRESHOLD_USD
  const dailyTotals = {} // date → accumulated cost
  let alerted = {} // date → true (only alert once per day)

  bus.on('cost.tracked', (event) => {
    try {
      const date = event.ts?.slice(0, 10) || new Date().toISOString().slice(0, 10)
      const cost = event.cost || 0

      dailyTotals[date] = (dailyTotals[date] || 0) + cost

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
      // Reactor errors never propagate
    }
  })

  return { dailyTotals, alerted, threshold }
}

module.exports = { register, DEFAULT_DAILY_THRESHOLD_USD }
