'use strict'
const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { EventBus } = require('../event-bus.cjs')
const { register } = require('./cycle-monitor.cjs')

describe('CycleMonitorReactor', () => {
  let bus
  let alerts

  beforeEach(() => {
    bus = new EventBus({ persist: false })
    alerts = []
    register(bus, { multiplier: 2, consecutiveThreshold: 3 })
    bus.on('alert.cycle_slowdown', (e) => alerts.push(e))
  })

  it('does not alert with consistent durations', () => {
    for (let i = 0; i < 10; i++) {
      bus.fire('cycle.end', { deptId: 'novel', durationMs: 5000 })
    }
    assert.equal(alerts.length, 0)
  })

  it('alerts after consecutive slow cycles', () => {
    // Build up baseline (3 normal cycles)
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 1000 })
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 1000 })
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 1000 })
    // 3 extremely slow cycles (>2x running average even as avg rises)
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 50000 })
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 50000 })
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 50000 })
    assert.equal(alerts.length, 1)
    assert.equal(alerts[0].deptId, 'novel')
    assert.equal(alerts[0].consecutiveSlow, 3)
  })

  it('resets count on normal cycle', () => {
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 1000 })
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 1000 })
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 1000 })
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 50000 })
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 50000 })
    // Normal cycle resets counter
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 1000 })
    bus.fire('cycle.end', { deptId: 'novel', durationMs: 50000 })
    assert.equal(alerts.length, 0)
  })

  it('tracks departments independently', () => {
    for (let i = 0; i < 3; i++) {
      bus.fire('cycle.end', { deptId: 'novel', durationMs: 1000 })
      bus.fire('cycle.end', { deptId: 'tech', durationMs: 1000 })
    }
    // Only novel gets slow
    for (let i = 0; i < 3; i++) {
      bus.fire('cycle.end', { deptId: 'novel', durationMs: 50000 })
      bus.fire('cycle.end', { deptId: 'tech', durationMs: 1000 })
    }
    assert.equal(alerts.length, 1)
    assert.equal(alerts[0].deptId, 'novel')
  })

  it('ignores events without deptId', () => {
    bus.fire('cycle.end', { durationMs: 5000 })
    assert.equal(alerts.length, 0)
  })
})
