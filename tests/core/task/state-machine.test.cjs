'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  canTransition, getValidTransitions, isTerminal, isValidStatus,
  normalizeStatus, transition,
} = require('../../../core/task/state-machine.cjs')

describe('TaskStateMachine', () => {
  it('canTransition: pending → assigned is valid', () => {
    assert.ok(canTransition('pending', 'assigned'))
  })

  it('canTransition: pending → review is invalid (skip)', () => {
    assert.ok(!canTransition('pending', 'review'))
  })

  it('canTransition: completed → in_progress is invalid (terminal)', () => {
    assert.ok(!canTransition('completed', 'in_progress'))
  })

  it('canTransition: review → rework is valid', () => {
    assert.ok(canTransition('review', 'rework'))
  })

  it('getValidTransitions returns correct arrays for all states', () => {
    assert.deepStrictEqual(getValidTransitions('pending'), ['assigned', 'in_progress', 'completed', 'failed'])
    assert.deepStrictEqual(getValidTransitions('assigned'), ['in_progress', 'completed', 'failed'])
    assert.deepStrictEqual(getValidTransitions('in_progress'), ['review', 'completed', 'rework', 'failed'])
    assert.deepStrictEqual(getValidTransitions('review'), ['completed', 'rework', 'in_progress', 'failed'])
    assert.deepStrictEqual(getValidTransitions('rework'), ['in_progress', 'review', 'completed', 'failed'])
    assert.deepStrictEqual(getValidTransitions('completed'), [])
    assert.deepStrictEqual(getValidTransitions('failed'), ['completed'])
  })

  it('isTerminal: completed=true, in_progress=false', () => {
    assert.ok(isTerminal('completed'))
    assert.ok(isTerminal('failed'))
    assert.ok(!isTerminal('in_progress'))
    assert.ok(!isTerminal('review'))
  })

  it('normalizeStatus: running → in_progress', () => {
    assert.strictEqual(normalizeStatus('running'), 'in_progress')
    assert.strictEqual(normalizeStatus('in_progress'), 'in_progress')
    assert.strictEqual(normalizeStatus('pending'), 'pending')
  })

  it('transition() success: updates status + updatedAt', () => {
    const task = { id: 't1', status: 'pending', updatedAt: '2026-01-01' }
    const result = transition(task, 'assigned')
    assert.ok(result.ok)
    assert.strictEqual(task.status, 'assigned')
    assert.notStrictEqual(task.updatedAt, '2026-01-01')
  })

  it('transition() failure: does not modify task', () => {
    const task = { id: 't1', status: 'completed', updatedAt: '2026-01-01' }
    const result = transition(task, 'in_progress')
    assert.ok(!result.ok)
    assert.strictEqual(task.status, 'completed')
    assert.strictEqual(task.updatedAt, '2026-01-01')
  })

  it('transition() to completed sets completedAt', () => {
    const task = { id: 't1', status: 'in_progress' }
    transition(task, 'completed')
    assert.ok(task.completedAt)
  })

  it('transition() records to DB (transitions are persisted)', () => {
    const task = { id: 't-hist', status: 'pending' }
    const result = transition(task, 'assigned', { actor: 'user', reason: 'test' })
    assert.ok(result.ok)
    assert.strictEqual(task.status, 'assigned')
    // Transition is persisted to DB (verified in db/task-queries.test.cjs)
    // Here we just verify the transition itself works
  })

  it('transition() to failed sets failureReason from context.reason', () => {
    const task = { id: 't1', status: 'in_progress' }
    transition(task, 'failed', { reason: 'agent 空闲 30m 且进度 <50%' })
    assert.strictEqual(task.failureReason, 'agent 空闲 30m 且进度 <50%')
  })

  it('transition() failed → completed clears failureReason', () => {
    const task = { id: 't1', status: 'failed', failureReason: 'some reason' }
    const result = transition(task, 'completed')
    assert.ok(result.ok)
    assert.strictEqual(task.status, 'completed')
    assert.strictEqual(task.failureReason, undefined)
    assert.ok(task.completedAt)
  })

  it('canTransition: failed → completed is valid (recovery)', () => {
    assert.ok(canTransition('failed', 'completed'))
  })

  it('isValidStatus returns true for known statuses', () => {
    assert.ok(isValidStatus('pending'))
    assert.ok(isValidStatus('rework'))
    assert.ok(!isValidStatus('unknown'))
    assert.ok(!isValidStatus('running'))
  })
})
