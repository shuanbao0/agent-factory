'use strict'
const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { EventBus } = require('../../../../core/observe/event-bus.cjs')
const { register } = require('../../../../core/observe/reactors/cost-alert.cjs')

describe('CostAlertReactor', () => {
  let bus
  let alerts

  beforeEach(() => {
    bus = new EventBus({ persist: false })
    alerts = []
    register(bus, { dailyThreshold: 1.0 })
    bus.on('alert.cost_exceeded', (e) => alerts.push(e))
  })

  it('does not alert below threshold', () => {
    bus.fire('cost.tracked', { cost: 0.5, source: 'ceo', ts: '2026-03-16T10:00:00Z' })
    assert.equal(alerts.length, 0)
  })

  it('alerts when daily cost exceeds threshold', () => {
    bus.fire('cost.tracked', { cost: 0.6, source: 'ceo', ts: '2026-03-16T10:00:00Z' })
    bus.fire('cost.tracked', { cost: 0.5, source: 'dept:novel', ts: '2026-03-16T11:00:00Z' })
    assert.equal(alerts.length, 1)
    assert.equal(alerts[0].date, '2026-03-16')
    assert.ok(alerts[0].totalCost >= 1.0)
    assert.equal(alerts[0].threshold, 1.0)
  })

  it('only alerts once per day', () => {
    bus.fire('cost.tracked', { cost: 1.5, source: 'ceo', ts: '2026-03-16T10:00:00Z' })
    bus.fire('cost.tracked', { cost: 2.0, source: 'ceo', ts: '2026-03-16T12:00:00Z' })
    assert.equal(alerts.length, 1)
  })

  it('alerts separately for different days', () => {
    bus.fire('cost.tracked', { cost: 1.5, source: 'ceo', ts: '2026-03-16T10:00:00Z' })
    bus.fire('cost.tracked', { cost: 1.5, source: 'ceo', ts: '2026-03-17T10:00:00Z' })
    assert.equal(alerts.length, 2)
  })

  it('handles missing cost gracefully', () => {
    bus.fire('cost.tracked', { source: 'ceo', ts: '2026-03-16T10:00:00Z' })
    assert.equal(alerts.length, 0)
  })
})
