'use strict'
/**
 * Cycle Monitor Reactor — tracks department cycle durations and detects slowdowns.
 *
 * Listens to `cycle.end` events and fires `alert.cycle_slowdown` when
 * a department's cycle time exceeds 2x the rolling average for 3 consecutive cycles.
 */

const MAX_HISTORY = 10
const SLOWDOWN_MULTIPLIER = 2
const CONSECUTIVE_SLOW_THRESHOLD = 3

/**
 * Register the cycle-monitor reactor on an event bus.
 *
 * @param {import('../event-bus.cjs').EventBus} bus
 * @param {Object} [opts]
 * @param {number} [opts.multiplier] - Slowdown detection multiplier (default 2x)
 * @param {number} [opts.consecutiveThreshold] - Consecutive slow cycles before alert (default 3)
 */
function register(bus, opts = {}) {
  const multiplier = opts.multiplier ?? SLOWDOWN_MULTIPLIER
  const consecutiveThreshold = opts.consecutiveThreshold ?? CONSECUTIVE_SLOW_THRESHOLD

  // deptId → { durations: number[], consecutiveSlow: number }
  const deptHistory = {}

  bus.on('cycle.end', (event) => {
    try {
      const deptId = event.deptId
      const durationMs = event.durationMs
      if (!deptId || typeof durationMs !== 'number') return

      if (!deptHistory[deptId]) {
        deptHistory[deptId] = { durations: [], consecutiveSlow: 0 }
      }
      const hist = deptHistory[deptId]

      // Calculate average before adding the new duration
      const avg = hist.durations.length > 0
        ? hist.durations.reduce((a, b) => a + b, 0) / hist.durations.length
        : durationMs // first cycle, no baseline

      hist.durations.push(durationMs)
      if (hist.durations.length > MAX_HISTORY) {
        hist.durations.shift()
      }

      // Check slowdown (only meaningful after at least 3 data points)
      if (hist.durations.length >= 3 && durationMs > avg * multiplier) {
        hist.consecutiveSlow++
      } else {
        hist.consecutiveSlow = 0
      }

      if (hist.consecutiveSlow >= consecutiveThreshold) {
        bus.fire('alert.cycle_slowdown', {
          deptId,
          currentDurationMs: durationMs,
          averageDurationMs: Math.round(avg),
          consecutiveSlow: hist.consecutiveSlow,
        })
        // Reset counter after alerting to avoid repeated alerts
        hist.consecutiveSlow = 0
      }
    } catch {
      // Reactor errors never propagate
    }
  })

  return { deptHistory }
}

module.exports = { register, MAX_HISTORY, SLOWDOWN_MULTIPLIER, CONSECUTIVE_SLOW_THRESHOLD }
