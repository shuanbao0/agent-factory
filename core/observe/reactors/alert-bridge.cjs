'use strict'
/**
 * AlertBridgeReactor — 告警事件桥接器（EventBus → UI）
 *
 * 设计模式：Reactor / Observer + 有界队列
 *
 * 职责：
 * - 监听 EventBus 上的 alert.* 和 budget.* 事件
 * - 将告警收集到内存有界队列（最多 50 条，超出丢弃最旧的）
 * - 提供 getAlerts() / dismissAlert() 接口，供 SSE 端点和 UI 消费
 *
 * 目前监听的事件类型：
 * - alert.cost_exceeded  → 日成本超限（来自 CostAlertReactor）
 * - alert.cycle_slowdown → 循环耗时异常（来自 CycleMonitorReactor）
 * - budget.dept_blocked  → 部门预算被阻断
 */

const logger = require('../../common/logger.cjs')

/** 告警队列最大容量 */
const MAX_ALERTS = 50
/** @type {Array<{id: string, type: string, severity: string, ts: string, data: object}>} */
const alerts = []

/**
 * 在 EventBus 上注册告警桥接 Reactor
 *
 * @param {import('../event-bus.cjs').EventBus} bus - 事件总线
 */
function register(bus) {
  // 成本超限告警
  bus.on('alert.cost_exceeded', (event) => {
    try {
      alerts.push({
        id: `cost-${Date.now()}`,
        type: 'cost_exceeded',
        severity: 'error',
        ts: event.ts,
        data: { date: event.date, totalCost: event.totalCost, threshold: event.threshold, source: event.source },
      })
      if (alerts.length > MAX_ALERTS) alerts.splice(0, alerts.length - MAX_ALERTS)
    } catch (err) {
      logger.debug('alert-bridge', 'reactor error on alert.cost_exceeded', { error: err.message })
    }
  })

  // 循环耗时异常告警
  bus.on('alert.cycle_slowdown', (event) => {
    try {
      alerts.push({
        id: `cycle-${Date.now()}`,
        type: 'cycle_slowdown',
        severity: 'warning',
        ts: event.ts,
        data: { deptId: event.deptId, currentDurationMs: event.currentDurationMs, averageDurationMs: event.averageDurationMs },
      })
      if (alerts.length > MAX_ALERTS) alerts.splice(0, alerts.length - MAX_ALERTS)
    } catch (err) {
      logger.debug('alert-bridge', 'reactor error on alert.cycle_slowdown', { error: err.message })
    }
  })

  // 部门预算阻断告警
  bus.on('budget.dept_blocked', (event) => {
    try {
      alerts.push({
        id: `budget-${Date.now()}`,
        type: 'budget_blocked',
        severity: 'error',
        ts: event.ts,
        data: { deptId: event.deptId, reason: event.reason, ratio: event.ratio },
      })
      if (alerts.length > MAX_ALERTS) alerts.splice(0, alerts.length - MAX_ALERTS)
    } catch (err) {
      logger.debug('alert-bridge', 'reactor error on budget.dept_blocked', { error: err.message })
    }
  })
}

/**
 * 获取所有待处理告警（非破坏性读取，返回副本）
 * @returns {Array<{id: string, type: string, severity: string, ts: string, data: object}>}
 */
function getAlerts() {
  return [...alerts]
}

/**
 * 按 ID 关闭（移除）一条告警
 * @param {string} alertId - 告警 ID
 */
function dismissAlert(alertId) {
  const idx = alerts.findIndex(a => a.id === alertId)
  if (idx >= 0) alerts.splice(idx, 1)
}

module.exports = { register, getAlerts, dismissAlert, MAX_ALERTS }
