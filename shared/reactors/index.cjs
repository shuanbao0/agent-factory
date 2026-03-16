'use strict'
/**
 * Reactor Registry — registers all reactors on an event bus.
 */
const costAlert = require('./cost-alert.cjs')
const cycleMonitor = require('./cycle-monitor.cjs')

/**
 * Register all reactors on the given event bus.
 *
 * @param {import('../event-bus.cjs').EventBus} bus
 * @param {Object} [opts]
 * @param {number} [opts.costThreshold] - Daily cost alert threshold in USD
 */
function registerAll(bus, opts = {}) {
  costAlert.register(bus, { dailyThreshold: opts.costThreshold })
  cycleMonitor.register(bus)
}

module.exports = { registerAll }
