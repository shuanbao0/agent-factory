'use strict'
/**
 * Reactor Registry — 统一注册所有 Reactor 到 EventBus
 *
 * 职责：
 * - 一次性注册所有 Reactor，简化 Autopilot 启动逻辑
 * - 各 Reactor 独立维护自身状态，互不干扰
 */
const costAlert = require('./cost-alert.cjs')
const cycleMonitor = require('./cycle-monitor.cjs')
const alertBridge = require('./alert-bridge.cjs')

/**
 * 注册所有 Reactor 到指定的 EventBus
 *
 * @param {import('../event-bus.cjs').EventBus} bus - 事件总线
 * @param {Object} [opts]
 * @param {number} [opts.costThreshold] - 日成本告警阈值（USD）
 */
function registerAll(bus, opts = {}) {
  costAlert.register(bus, { dailyThreshold: opts.costThreshold })
  cycleMonitor.register(bus)
  alertBridge.register(bus)
}

module.exports = {
  registerAll,
  getAlerts: alertBridge.getAlerts,
  dismissAlert: alertBridge.dismissAlert,
}
