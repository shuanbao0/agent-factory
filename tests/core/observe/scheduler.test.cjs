'use strict'
const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { Scheduler } = require('../../../core/observe/scheduler.cjs')
const { EventBus } = require('../../../core/observe/event-bus.cjs')

describe('Scheduler', () => {
  let bus, scheduler, calls, logger

  beforeEach(() => {
    bus = new EventBus({ persist: false })
    calls = { deptCycles: [], qualityGates: [] }
    logger = {
      info: () => {},
      debug: () => {},
      error: () => {},
      warn: () => {},
    }
    scheduler = new Scheduler({
      runDepartmentCycle: async (deptId) => { calls.deptCycles.push(deptId) },
      processQualityGate: async (deptId, task) => { calls.qualityGates.push({ deptId, taskId: task.id }) },
      findTaskById: (id) => id === 'task-1' ? { id: 'task-1', status: 'review' } : null,
      logger,
    })
    scheduler.register(bus)
  })

  it('triggers dept cycle on task.status_changed to=completed', async () => {
    bus.fire('task.status_changed', { taskId: 'task-1', department: 'novel', from: 'in_progress', to: 'completed' })
    // Allow async to resolve
    await new Promise(r => setTimeout(r, 50))
    assert.ok(calls.deptCycles.includes('novel'), 'dept cycle should be triggered')
  })

  it('triggers dept cycle on task.status_changed to=failed', async () => {
    bus.fire('task.status_changed', { taskId: 'task-2', department: 'dev', from: 'in_progress', to: 'failed' })
    await new Promise(r => setTimeout(r, 50))
    assert.ok(calls.deptCycles.includes('dev'))
  })

  it('does not trigger dept cycle on task.status_changed to=in_progress', async () => {
    bus.fire('task.status_changed', { taskId: 'task-1', department: 'novel', from: 'assigned', to: 'in_progress' })
    await new Promise(r => setTimeout(r, 50))
    assert.equal(calls.deptCycles.length, 0)
  })

  it('schedules quality gate on task.status_changed to=review (delayed)', async () => {
    bus.fire('task.status_changed', { taskId: 'task-1', department: 'novel', from: 'in_progress', to: 'review' })
    // Quality gate has 5s delay — should NOT have fired yet
    await new Promise(r => setTimeout(r, 50))
    assert.equal(calls.qualityGates.length, 0, 'quality gate should be delayed')
  })

  it('triggers dept cycle on quality.gate_completed', async () => {
    bus.fire('quality.gate_completed', { taskId: 'task-1', deptId: 'novel', passed: true })
    await new Promise(r => setTimeout(r, 50))
    assert.ok(calls.deptCycles.includes('novel'))
  })

  it('debounces rapid events for same department', async () => {
    bus.fire('task.status_changed', { taskId: 'task-1', department: 'novel', from: 'in_progress', to: 'completed' })
    bus.fire('task.status_changed', { taskId: 'task-2', department: 'novel', from: 'in_progress', to: 'failed' })
    await new Promise(r => setTimeout(r, 50))
    // Only 1 cycle should be triggered due to 30s debounce
    assert.equal(calls.deptCycles.length, 1)
  })

  it('does not trigger after disable()', async () => {
    scheduler.disable()
    bus.fire('task.status_changed', { taskId: 'task-1', department: 'novel', from: 'in_progress', to: 'completed' })
    await new Promise(r => setTimeout(r, 50))
    assert.equal(calls.deptCycles.length, 0)
  })

  it('ignores events with missing department', async () => {
    bus.fire('task.status_changed', { taskId: 'task-1', to: 'completed' })
    await new Promise(r => setTimeout(r, 50))
    assert.equal(calls.deptCycles.length, 0)
  })
})
