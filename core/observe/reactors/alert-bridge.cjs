'use strict'
/**
 * Alert Bridge Reactor — collects alert events into a shared queue for UI consumption.
 *
 * Listens to `alert.*` events from the event bus and stores them in a bounded queue.
 * The SSE endpoint reads from this queue to push alerts to the browser.
 */

const MAX_ALERTS = 50
const alerts = []

/**
 * Register the alert-bridge reactor on an event bus.
 *
 * @param {import('../event-bus.cjs').EventBus} bus
 */
function register(bus) {
  bus.on('alert.cost_exceeded', (event) => {
    alerts.push({
      id: `cost-${Date.now()}`,
      type: 'cost_exceeded',
      severity: 'error',
      ts: event.ts,
      data: { date: event.date, totalCost: event.totalCost, threshold: event.threshold, source: event.source },
    })
    if (alerts.length > MAX_ALERTS) alerts.splice(0, alerts.length - MAX_ALERTS)
  })

  bus.on('alert.cycle_slowdown', (event) => {
    alerts.push({
      id: `cycle-${Date.now()}`,
      type: 'cycle_slowdown',
      severity: 'warning',
      ts: event.ts,
      data: { deptId: event.deptId, currentDurationMs: event.currentDurationMs, averageDurationMs: event.averageDurationMs },
    })
    if (alerts.length > MAX_ALERTS) alerts.splice(0, alerts.length - MAX_ALERTS)
  })

  bus.on('budget.dept_blocked', (event) => {
    alerts.push({
      id: `budget-${Date.now()}`,
      type: 'budget_blocked',
      severity: 'error',
      ts: event.ts,
      data: { deptId: event.deptId, reason: event.reason, ratio: event.ratio },
    })
    if (alerts.length > MAX_ALERTS) alerts.splice(0, alerts.length - MAX_ALERTS)
  })
}

/**
 * Get all pending alerts (non-destructive read).
 * @returns {Array<{id: string, type: string, severity: string, ts: string, data: object}>}
 */
function getAlerts() {
  return [...alerts]
}

/**
 * Dismiss an alert by ID.
 * @param {string} alertId
 */
function dismissAlert(alertId) {
  const idx = alerts.findIndex(a => a.id === alertId)
  if (idx >= 0) alerts.splice(idx, 1)
}

module.exports = { register, getAlerts, dismissAlert, MAX_ALERTS }
