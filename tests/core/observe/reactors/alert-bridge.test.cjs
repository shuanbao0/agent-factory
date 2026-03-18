'use strict'
/**
 * AlertBridgeReactor — 告警事件桥接器单元测试
 *
 * 测试策略：直接 require alert-bridge 模块，使用内存 EventBus 触发事件
 */
const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { EventBus } = require('../../../../core/observe/event-bus.cjs')
const { register, getAlerts, dismissAlert, MAX_ALERTS } = require('../../../../core/observe/reactors/alert-bridge.cjs')

describe('alert-bridge reactor', () => {
  // 注意：alert-bridge 使用模块级 alerts 数组，测试间需要通过 dismissAlert 清理
  function clearAlerts() {
    while (getAlerts().length > 0) {
      dismissAlert(getAlerts()[0].id)
    }
  }

  describe('register + 事件监听', () => {
    it('注册后监听 3 种事件', () => {
      const bus = new EventBus()
      register(bus)
      assert.ok(bus.listenerCount('alert.cost_exceeded') >= 1)
      assert.ok(bus.listenerCount('alert.cycle_slowdown') >= 1)
      assert.ok(bus.listenerCount('budget.dept_blocked') >= 1)
    })
  })

  describe('cost_exceeded 告警', () => {
    it('收到 cost_exceeded 事件 → 添加告警', () => {
      clearAlerts()
      const bus = new EventBus()
      register(bus)

      bus.fire('alert.cost_exceeded', {
        date: '2026-03-18',
        totalCost: 15.5,
        threshold: 10,
        source: 'dept:novel',
      })

      const alerts = getAlerts()
      assert.ok(alerts.length >= 1)
      const alert = alerts.find(a => a.type === 'cost_exceeded')
      assert.ok(alert)
      assert.equal(alert.severity, 'error')
      assert.equal(alert.data.totalCost, 15.5)
      clearAlerts()
    })
  })

  describe('cycle_slowdown 告警', () => {
    it('收到 cycle_slowdown 事件 → 添加 warning 告警', () => {
      clearAlerts()
      const bus = new EventBus()
      register(bus)

      bus.fire('alert.cycle_slowdown', {
        deptId: 'novel',
        currentDurationMs: 120000,
        averageDurationMs: 30000,
      })

      const alerts = getAlerts()
      const alert = alerts.find(a => a.type === 'cycle_slowdown')
      assert.ok(alert)
      assert.equal(alert.severity, 'warning')
      assert.equal(alert.data.deptId, 'novel')
      clearAlerts()
    })
  })

  describe('budget_blocked 告警', () => {
    it('收到 budget.dept_blocked 事件 → 添加 error 告警', () => {
      clearAlerts()
      const bus = new EventBus()
      register(bus)

      bus.fire('budget.dept_blocked', {
        deptId: 'dev',
        reason: 'daily budget exceeded',
        ratio: 1.2,
      })

      const alerts = getAlerts()
      const alert = alerts.find(a => a.type === 'budget_blocked')
      assert.ok(alert)
      assert.equal(alert.severity, 'error')
      assert.equal(alert.data.reason, 'daily budget exceeded')
      clearAlerts()
    })
  })

  describe('getAlerts', () => {
    it('返回副本（不影响内部数组）', () => {
      clearAlerts()
      const bus = new EventBus()
      register(bus)

      bus.fire('alert.cost_exceeded', { date: '2026-03-18', totalCost: 20, threshold: 10 })
      const alerts1 = getAlerts()
      alerts1.pop() // 修改副本
      const alerts2 = getAlerts()
      assert.ok(alerts2.length >= 1)
      clearAlerts()
    })
  })

  describe('dismissAlert', () => {
    it('按 ID 移除告警', () => {
      clearAlerts()
      const bus = new EventBus()
      register(bus)

      bus.fire('alert.cost_exceeded', { date: '2026-03-18', totalCost: 20, threshold: 10 })
      const alerts = getAlerts()
      const id = alerts[0].id
      dismissAlert(id)
      const after = getAlerts()
      assert.ok(!after.find(a => a.id === id))
      clearAlerts()
    })

    it('不存在的 ID → 无操作', () => {
      clearAlerts()
      dismissAlert('nonexistent-id')
      assert.equal(getAlerts().length, 0)
    })
  })

  describe('有界队列', () => {
    it('超过 MAX_ALERTS 时丢弃最旧的', () => {
      clearAlerts()
      const bus = new EventBus()
      register(bus)

      // 添加超过上限的告警
      for (let i = 0; i < MAX_ALERTS + 10; i++) {
        bus.fire('alert.cost_exceeded', {
          date: '2026-03-18',
          totalCost: i,
          threshold: 10,
        })
      }

      const alerts = getAlerts()
      assert.ok(alerts.length <= MAX_ALERTS)
      clearAlerts()
    })
  })
})
