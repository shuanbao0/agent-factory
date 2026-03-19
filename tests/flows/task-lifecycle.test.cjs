'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const {
  canTransition, transition, isTerminal, isValidStatus,
  normalizeStatus, getValidTransitions, STATUSES, TRANSITIONS, TERMINAL,
} = require('../../core/task/state-machine.cjs')

const { getStrategy, BUILTIN_STRATEGIES } = require('../../core/task/strategy.cjs')

/** Helper: create a minimal task object */
function makeTask(overrides = {}) {
  return {
    id: `zzz-test-${Date.now()}`,
    name: 'Test Task',
    status: 'pending',
    priority: 'P1',
    assignees: ['zzz-test-agent'],
    creator: 'user',
    progress: 0,
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('TaskStateMachine — lifecycle paths', () => {
  describe('normal completion path', () => {
    it('pending → assigned → in_progress → review → completed', () => {
      const task = makeTask({ id: 'zzz-test-normal' })

      const r1 = transition(task, 'assigned', { recordHistory: true, actor: 'system' })
      assert.equal(r1.ok, true)
      assert.equal(task.status, 'assigned')

      const r2 = transition(task, 'in_progress', { recordHistory: true })
      assert.equal(r2.ok, true)
      assert.equal(task.status, 'in_progress')

      const r3 = transition(task, 'review', { recordHistory: true })
      assert.equal(r3.ok, true)
      assert.equal(task.status, 'review')

      const r4 = transition(task, 'completed', { recordHistory: true })
      assert.equal(r4.ok, true)
      assert.equal(task.status, 'completed')
      assert.ok(task.completedAt, 'completedAt should be set')
      assert.equal(task._transitions.length, 4)
      assert.equal(task._transitions[0].from, 'pending')
      assert.equal(task._transitions[0].to, 'assigned')
    })
  })

  describe('rework path', () => {
    it('review → rework → in_progress → review → completed', () => {
      const task = makeTask({ id: 'zzz-test-rework', status: 'review' })

      const r1 = transition(task, 'rework', { recordHistory: true, reason: 'needs fixes' })
      assert.equal(r1.ok, true)
      assert.equal(task.status, 'rework')

      const r2 = transition(task, 'in_progress', { recordHistory: true })
      assert.equal(r2.ok, true)

      const r3 = transition(task, 'review', { recordHistory: true })
      assert.equal(r3.ok, true)

      const r4 = transition(task, 'completed', { recordHistory: true })
      assert.equal(r4.ok, true)
      assert.equal(task.status, 'completed')
      assert.equal(task._transitions.length, 4)
      assert.equal(task._transitions[0].reason, 'needs fixes')
    })
  })

  describe('failure path', () => {
    it('in_progress → failed is terminal', () => {
      const task = makeTask({ id: 'zzz-test-fail', status: 'in_progress' })

      const r = transition(task, 'failed')
      assert.equal(r.ok, true)
      assert.equal(task.status, 'failed')
      assert.equal(isTerminal('failed'), true)
    })
  })

  describe('quick complete', () => {
    it('pending → completed directly', () => {
      const task = makeTask({ id: 'zzz-test-quick' })

      const r = transition(task, 'completed')
      assert.equal(r.ok, true)
      assert.equal(task.status, 'completed')
      assert.ok(task.completedAt)
    })
  })

  describe('invalid transitions rejected', () => {
    it('completed → in_progress is rejected', () => {
      const task = makeTask({ id: 'zzz-test-inv1', status: 'completed' })
      const r = transition(task, 'in_progress')
      assert.equal(r.ok, false)
      assert.ok(r.error)
      assert.equal(task.status, 'completed', 'status unchanged')
    })

    it('pending → review is rejected', () => {
      const task = makeTask({ id: 'zzz-test-inv2', status: 'pending' })
      const r = transition(task, 'review')
      assert.equal(r.ok, false)
      assert.equal(task.status, 'pending')
    })

    it('failed → any status is rejected', () => {
      const task = makeTask({ id: 'zzz-test-inv3', status: 'failed' })
      for (const target of ['pending', 'assigned', 'in_progress', 'review', 'completed', 'rework']) {
        const r = transition(task, target)
        assert.equal(r.ok, false, `failed → ${target} should be rejected`)
      }
      assert.equal(task.status, 'failed')
    })
  })

  describe('strategy selection by task type', () => {
    it('writing strategy has minPassingScore=70', () => {
      const s = getStrategy('writing')
      assert.equal(s.minPassingScore, 70)
    })

    it('coding strategy has minPassingScore=80', () => {
      const s = getStrategy('coding')
      assert.equal(s.minPassingScore, 80)
    })

    it('unknown type falls back to _fallback', () => {
      const s = getStrategy('nonexistent_type_xyz')
      assert.equal(s.minPassingScore, BUILTIN_STRATEGIES._fallback.minPassingScore)
      assert.equal(s.idleThresholdMins, BUILTIN_STRATEGIES._fallback.idleThresholdMins)
    })

    it('null/undefined type falls back to _fallback', () => {
      const s1 = getStrategy(null)
      const s2 = getStrategy(undefined)
      assert.equal(s1.minPassingScore, BUILTIN_STRATEGIES._fallback.minPassingScore)
      assert.equal(s2.minPassingScore, BUILTIN_STRATEGIES._fallback.minPassingScore)
    })
  })

  describe('normalizeStatus', () => {
    it('running → in_progress', () => {
      assert.equal(normalizeStatus('running'), 'in_progress')
    })

    it('unknown status passes through as-is', () => {
      assert.equal(normalizeStatus('pending'), 'pending')
      assert.equal(normalizeStatus('completed'), 'completed')
    })
  })

  describe('utility predicates', () => {
    it('isTerminal identifies completed and failed', () => {
      assert.equal(isTerminal('completed'), true)
      assert.equal(isTerminal('failed'), true)
      assert.equal(isTerminal('in_progress'), false)
      assert.equal(isTerminal('pending'), false)
    })

    it('isValidStatus accepts all STATUSES', () => {
      for (const s of STATUSES) {
        assert.equal(isValidStatus(s), true, `${s} should be valid`)
      }
      assert.equal(isValidStatus('bogus'), false)
    })

    it('getValidTransitions returns correct targets', () => {
      assert.deepEqual(getValidTransitions('completed'), [])
      assert.deepEqual(getValidTransitions('failed'), [])
      assert.ok(getValidTransitions('pending').includes('assigned'))
      assert.ok(getValidTransitions('in_progress').includes('review'))
    })

    it('canTransition matches TRANSITIONS table', () => {
      assert.equal(canTransition('pending', 'assigned'), true)
      assert.equal(canTransition('pending', 'review'), false)
      assert.equal(canTransition('review', 'rework'), true)
      assert.equal(canTransition('completed', 'pending'), false)
    })
  })
})
