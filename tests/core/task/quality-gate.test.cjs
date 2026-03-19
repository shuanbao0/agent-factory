'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  canAdvance, isGateDone, getGateState, initGate, advanceGate, nextAction,
  STAGES, TERMINAL,
} = require('../../../core/task/quality-gate.cjs')

describe('QualityGateMachine', () => {
  describe('STAGES', () => {
    it('has 6 stages', () => {
      assert.strictEqual(STAGES.length, 6)
    })

    it('done and failed are terminal', () => {
      assert.ok(TERMINAL.has('done'))
      assert.ok(TERMINAL.has('failed'))
      assert.ok(!TERMINAL.has('pending'))
      assert.ok(!TERMINAL.has('self_checking'))
    })
  })

  describe('canAdvance', () => {
    it('allows pending → self_checking', () => {
      assert.ok(canAdvance('pending', 'self_checking'))
    })
    it('allows self_checking → peer_reviewing', () => {
      assert.ok(canAdvance('self_checking', 'peer_reviewing'))
    })
    it('allows self_checking → failed', () => {
      assert.ok(canAdvance('self_checking', 'failed'))
    })
    it('allows peer_reviewing → head_approving', () => {
      assert.ok(canAdvance('peer_reviewing', 'head_approving'))
    })
    it('allows head_approving → done', () => {
      assert.ok(canAdvance('head_approving', 'done'))
    })
    it('blocks pending → done (skip stages)', () => {
      assert.ok(!canAdvance('pending', 'done'))
    })
    it('blocks done → anything', () => {
      assert.ok(!canAdvance('done', 'pending'))
      assert.ok(!canAdvance('done', 'self_checking'))
    })
    it('blocks invalid stage', () => {
      assert.ok(!canAdvance('invalid', 'done'))
    })
  })

  describe('isGateDone', () => {
    it('done is terminal', () => {
      assert.ok(isGateDone('done'))
    })
    it('failed is terminal', () => {
      assert.ok(isGateDone('failed'))
    })
    it('self_checking is not terminal', () => {
      assert.ok(!isGateDone('self_checking'))
    })
  })

  describe('getGateState', () => {
    it('returns pending for task without qualityGate', () => {
      const state = getGateState({})
      assert.strictEqual(state.stage, 'pending')
    })

    it('returns existing gate state', () => {
      const task = { qualityGate: { stage: 'peer_reviewing', selfCheck: { score: 80 } } }
      const state = getGateState(task)
      assert.strictEqual(state.stage, 'peer_reviewing')
      assert.strictEqual(state.selfCheck.score, 80)
    })

    it('returns pending for non-object qualityGate', () => {
      const state = getGateState({ qualityGate: 'invalid' })
      assert.strictEqual(state.stage, 'pending')
    })
  })

  describe('initGate', () => {
    it('initializes gate on task', () => {
      const task = {}
      const gate = initGate(task)
      assert.strictEqual(gate.stage, 'pending')
      assert.ok(gate.startedAt)
      assert.deepStrictEqual(task.quality, {})
    })

    it('resets existing gate', () => {
      const task = {
        qualityGate: { stage: 'peer_reviewing', selfCheck: { score: 80 } },
        quality: { selfCheck: { score: 80 } },
      }
      initGate(task)
      assert.strictEqual(task.qualityGate.stage, 'pending')
      assert.strictEqual(task.qualityGate.selfCheck, undefined)
      assert.deepStrictEqual(task.quality, {})
    })
  })

  describe('advanceGate', () => {
    it('advances from pending to self_checking', () => {
      const task = { qualityGate: { stage: 'pending' } }
      const result = advanceGate(task, 'self_checking')
      assert.ok(result.ok)
      assert.strictEqual(task.qualityGate.stage, 'self_checking')
    })

    it('stores self_check result on advance to peer_reviewing', () => {
      const task = { qualityGate: { stage: 'self_checking' } }
      const selfCheckResult = { passed: true, score: 85 }
      advanceGate(task, 'peer_reviewing', selfCheckResult)
      assert.strictEqual(task.qualityGate.stage, 'peer_reviewing')
      assert.deepStrictEqual(task.qualityGate.selfCheck, selfCheckResult)
      assert.deepStrictEqual(task.quality.selfCheck, selfCheckResult)
    })

    it('stores peer_review result on advance to head_approving', () => {
      const task = { qualityGate: { stage: 'peer_reviewing' } }
      const peerResult = { passed: true, score: 75, reviewer: 'editor' }
      advanceGate(task, 'head_approving', peerResult)
      assert.strictEqual(task.qualityGate.stage, 'head_approving')
      assert.deepStrictEqual(task.qualityGate.peerReview, peerResult)
      assert.deepStrictEqual(task.quality.peerReview, peerResult)
    })

    it('stores head_approval result on advance to done', () => {
      const task = { qualityGate: { stage: 'head_approving' } }
      const headResult = { passed: true, approver: 'chief' }
      advanceGate(task, 'done', headResult)
      assert.strictEqual(task.qualityGate.stage, 'done')
      assert.deepStrictEqual(task.qualityGate.headApproval, headResult)
    })

    it('rejects invalid transition', () => {
      const task = { qualityGate: { stage: 'pending' } }
      const result = advanceGate(task, 'done')
      assert.ok(!result.ok)
      assert.ok(result.error.includes('Invalid gate transition'))
      assert.strictEqual(task.qualityGate.stage, 'pending')
    })

    it('allows fail from any non-terminal stage', () => {
      for (const stage of ['self_checking', 'peer_reviewing', 'head_approving']) {
        const task = { qualityGate: { stage } }
        const result = advanceGate(task, 'failed')
        assert.ok(result.ok, `Should allow ${stage} → failed`)
        assert.strictEqual(task.qualityGate.stage, 'failed')
      }
    })
  })

  describe('nextAction', () => {
    it('returns self_checking for pending task', () => {
      assert.strictEqual(nextAction({}), 'self_checking')
      assert.strictEqual(nextAction({ qualityGate: { stage: 'pending' } }), 'self_checking')
    })

    it('returns current stage for in-progress gates', () => {
      assert.strictEqual(nextAction({ qualityGate: { stage: 'self_checking' } }), 'self_checking')
      assert.strictEqual(nextAction({ qualityGate: { stage: 'peer_reviewing' } }), 'peer_reviewing')
      assert.strictEqual(nextAction({ qualityGate: { stage: 'head_approving' } }), 'head_approving')
    })

    it('returns null for terminal stages', () => {
      assert.strictEqual(nextAction({ qualityGate: { stage: 'done' } }), null)
      assert.strictEqual(nextAction({ qualityGate: { stage: 'failed' } }), null)
    })
  })
})
