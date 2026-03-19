'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const {
  STAGES, initGate, advanceGate, isGateDone,
  nextAction, getGateState, canAdvance,
} = require('../../core/task/quality-gate.cjs')

const { QualityOrchestrator } = require('../../core/task/quality-orchestrator.cjs')

/** Helper: create a minimal task for quality gate tests */
function makeTask(overrides = {}) {
  return {
    id: `zzz-test-qg-${Date.now()}`,
    name: 'Quality Gate Test Task',
    status: 'review',
    assignees: ['zzz-test-agent-a'],
    assignedAgent: 'zzz-test-agent-a',
    creator: 'user',
    progress: 100,
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/** Mock sendFn that returns passing scores */
function passSendFn() {
  return async (agentId, sessionKey, msg, timeout) => ({
    ok: true,
    text: 'SCORE: 85\nPASSED: true\nISSUES: none\nCOMMENTS: looks good\nAPPROVED',
  })
}

/** Mock sendFn that returns failing scores */
function failSendFn() {
  return async (agentId, sessionKey, msg, timeout) => ({
    ok: true,
    text: 'SCORE: 30\nPASSED: false\nISSUES: quality too low\nCOMMENTS: needs work\nREJECTED',
  })
}

/** Mock sendFn: high score but PASSED: false (LLM contradiction) */
function highScoreExplicitFailSendFn() {
  return async (agentId, sessionKey, msg, timeout) => ({
    ok: true,
    text: 'SCORE: 75\nPASSED: false\nISSUES: minor nits\nCOMMENTS: mostly good\nAPPROVED',
  })
}

/** Quiet logger */
const silentLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }

describe('QualityGateMachine — FSM stages', () => {
  describe('full gate pass', () => {
    it('pending → self_checking → peer_reviewing → head_approving → done', () => {
      const task = makeTask({ id: 'zzz-test-gate-full' })
      initGate(task)
      assert.equal(getGateState(task).stage, 'pending')

      const r1 = advanceGate(task, 'self_checking')
      assert.equal(r1.ok, true)
      assert.equal(getGateState(task).stage, 'self_checking')

      const r2 = advanceGate(task, 'peer_reviewing', { score: 90, passed: true })
      assert.equal(r2.ok, true)
      assert.equal(getGateState(task).stage, 'peer_reviewing')
      assert.equal(task.qualityGate.selfCheck.score, 90)

      const r3 = advanceGate(task, 'head_approving', { score: 85, passed: true, reviewer: 'zzz-test-peer' })
      assert.equal(r3.ok, true)
      assert.equal(getGateState(task).stage, 'head_approving')
      assert.equal(task.qualityGate.peerReview.score, 85)

      const r4 = advanceGate(task, 'done', { approver: 'zzz-test-head', passed: true })
      assert.equal(r4.ok, true)
      assert.equal(getGateState(task).stage, 'done')
      assert.equal(task.qualityGate.headApproval.approver, 'zzz-test-head')
      assert.equal(isGateDone('done'), true)
    })
  })

  describe('gate state tracking', () => {
    it('getGateState returns correct data at each stage', () => {
      const task = makeTask({ id: 'zzz-test-gate-state' })

      // Before init — no qualityGate field
      assert.equal(getGateState(task).stage, 'pending')

      initGate(task)
      assert.ok(task.qualityGate.startedAt)

      advanceGate(task, 'self_checking')
      assert.equal(getGateState(task).stage, 'self_checking')

      advanceGate(task, 'peer_reviewing', { score: 80, passed: true })
      const state = getGateState(task)
      assert.equal(state.stage, 'peer_reviewing')
      assert.equal(state.selfCheck.score, 80)
    })
  })

  describe('terminal stages cannot advance', () => {
    it('done cannot advance further', () => {
      const task = makeTask({ id: 'zzz-test-gate-term1' })
      initGate(task)
      advanceGate(task, 'self_checking')
      advanceGate(task, 'peer_reviewing')
      advanceGate(task, 'head_approving')
      advanceGate(task, 'done')

      const r = advanceGate(task, 'self_checking')
      assert.equal(r.ok, false)
      assert.ok(r.error)
    })

    it('failed cannot advance further', () => {
      const task = makeTask({ id: 'zzz-test-gate-term2' })
      initGate(task)
      advanceGate(task, 'self_checking')
      advanceGate(task, 'failed')

      const r = advanceGate(task, 'peer_reviewing')
      assert.equal(r.ok, false)
    })
  })

  describe('nextAction', () => {
    it('returns self_checking for pending gate', () => {
      const task = makeTask({ id: 'zzz-test-gate-next1' })
      initGate(task)
      assert.equal(nextAction(task), 'self_checking')
    })

    it('returns current stage for in-progress gate', () => {
      const task = makeTask({ id: 'zzz-test-gate-next2' })
      initGate(task)
      advanceGate(task, 'self_checking')
      assert.equal(nextAction(task), 'self_checking')
    })

    it('returns null for done gate', () => {
      const task = makeTask({ id: 'zzz-test-gate-next3' })
      initGate(task)
      advanceGate(task, 'self_checking')
      advanceGate(task, 'peer_reviewing')
      advanceGate(task, 'head_approving')
      advanceGate(task, 'done')
      assert.equal(nextAction(task), null)
    })
  })

  describe('canAdvance', () => {
    it('pending → self_checking allowed', () => {
      assert.equal(canAdvance('pending', 'self_checking'), true)
    })

    it('pending → peer_reviewing not allowed', () => {
      assert.equal(canAdvance('pending', 'peer_reviewing'), false)
    })

    it('self_checking → failed allowed', () => {
      assert.equal(canAdvance('self_checking', 'failed'), true)
    })
  })
})

describe('QualityOrchestrator', () => {
  describe('process — all pass', () => {
    it('returns passed=true when all stages pass', async () => {
      const orchestrator = new QualityOrchestrator({
        sendFn: passSendFn(),
        readAgentActivity: () => ({}),
        loadDeptConfig: () => ({
          id: 'zzz-test-dept',
          head: 'zzz-test-head',
          agents: ['zzz-test-agent-a', 'zzz-test-peer', 'zzz-test-head'],
        }),
        readTaskOutput: () => null,
        logger: silentLogger,
      })

      const task = makeTask({ id: 'zzz-test-orch-pass' })
      const result = await orchestrator.process('zzz-test-dept', task)

      assert.equal(result.passed, true)
      assert.ok(task.quality.selfCheck)
      assert.ok(task.quality.peerReview)
      assert.ok(task.quality.headApproval)
    })
  })

  describe('process — score >= threshold overrides PASSED: false', () => {
    it('returns passed=true when SCORE >= minPassingScore despite PASSED: false', async () => {
      const orchestrator = new QualityOrchestrator({
        sendFn: highScoreExplicitFailSendFn(),
        readAgentActivity: () => ({}),
        loadDeptConfig: () => ({
          id: 'zzz-test-dept',
          head: 'zzz-test-head',
          agents: ['zzz-test-agent-a', 'zzz-test-peer', 'zzz-test-head'],
        }),
        readTaskOutput: () => null,
        logger: silentLogger,
      })

      // writing type → minPassingScore = 70, SCORE: 75 should pass
      const task = makeTask({ id: 'zzz-test-orch-score-override', type: 'writing' })
      const result = await orchestrator.process('zzz-test-dept', task)

      assert.equal(result.passed, true, 'score >= threshold should override PASSED: false')
      assert.ok(task.quality.selfCheck, 'selfCheck should exist')
      assert.equal(task.quality.selfCheck.passed, true, 'selfCheck.passed should be true')
      assert.equal(task.quality.selfCheck.score, 75, 'selfCheck.score should be 75')
    })
  })

  describe('process — self-check failure terminates pipeline', () => {
    it('returns passed=false on self-check fail', async () => {
      const orchestrator = new QualityOrchestrator({
        sendFn: failSendFn(),
        readAgentActivity: () => ({}),
        loadDeptConfig: () => ({
          id: 'zzz-test-dept',
          head: 'zzz-test-head',
          agents: ['zzz-test-agent-a', 'zzz-test-peer', 'zzz-test-head'],
        }),
        readTaskOutput: () => null,
        logger: silentLogger,
      })

      const task = makeTask({ id: 'zzz-test-orch-selfail' })
      const result = await orchestrator.process('zzz-test-dept', task)

      assert.equal(result.passed, false)
      assert.ok(result.reason.includes('Self-check failed'))
      assert.equal(task.quality.peerReview, undefined, 'peer review should not run')
    })
  })

  describe('process — peer-review failure terminates pipeline', () => {
    it('returns passed=false on peer-review fail', async () => {
      let callCount = 0
      const orchestrator = new QualityOrchestrator({
        sendFn: async (agentId, sessionKey, msg, timeout) => {
          callCount++
          // First call = self-check (pass), second = peer-review (fail)
          if (callCount === 1) {
            return { ok: true, text: 'SCORE: 85\nPASSED: true\nISSUES: none' }
          }
          return { ok: true, text: 'SCORE: 30\nPASSED: false\nCOMMENTS: needs work' }
        },
        readAgentActivity: () => ({}),
        loadDeptConfig: () => ({
          id: 'zzz-test-dept',
          head: 'zzz-test-head',
          agents: ['zzz-test-agent-a', 'zzz-test-peer', 'zzz-test-head'],
        }),
        readTaskOutput: () => null,
        logger: silentLogger,
      })

      const task = makeTask({ id: 'zzz-test-orch-peerfail' })
      const result = await orchestrator.process('zzz-test-dept', task)

      assert.equal(result.passed, false)
      assert.ok(task.quality.selfCheck.passed)
      assert.equal(task.quality.peerReview.passed, false)
      assert.equal(task.quality.headApproval, undefined, 'head approval should not run')
    })
  })

  describe('process — head-approval failure terminates pipeline', () => {
    it('returns passed=false on head-approval fail', async () => {
      let callCount = 0
      const orchestrator = new QualityOrchestrator({
        sendFn: async (agentId, sessionKey, msg, timeout) => {
          callCount++
          if (callCount <= 2) {
            return { ok: true, text: 'SCORE: 85\nPASSED: true\nISSUES: none\nCOMMENTS: good' }
          }
          // Head rejects
          return { ok: true, text: 'REJECTED - not ready' }
        },
        readAgentActivity: () => ({}),
        loadDeptConfig: () => ({
          id: 'zzz-test-dept',
          head: 'zzz-test-head',
          agents: ['zzz-test-agent-a', 'zzz-test-peer', 'zzz-test-head'],
        }),
        readTaskOutput: () => null,
        logger: silentLogger,
      })

      const task = makeTask({ id: 'zzz-test-orch-headfail' })
      const result = await orchestrator.process('zzz-test-dept', task)

      assert.equal(result.passed, false)
      assert.equal(result.reason, 'Head rejected')
      assert.ok(task.quality.selfCheck.passed)
      assert.ok(task.quality.peerReview.passed)
      assert.equal(task.quality.headApproval.passed, false)
    })
  })

  describe('selectReviewer', () => {
    it('returns an agent from config (not assignee, not head)', () => {
      const orchestrator = new QualityOrchestrator({
        sendFn: passSendFn(),
        readAgentActivity: () => ({
          'zzz-test-peer': { idleMins: 10 },
          'zzz-test-peer2': { idleMins: 20 },
        }),
        loadDeptConfig: () => null,
        readTaskOutput: () => null,
        logger: silentLogger,
      })

      const task = makeTask({
        id: 'zzz-test-reviewer',
        assignedAgent: 'zzz-test-agent-a',
      })
      const config = {
        head: 'zzz-test-head',
        agents: ['zzz-test-agent-a', 'zzz-test-peer', 'zzz-test-peer2', 'zzz-test-head'],
      }

      const reviewer = orchestrator.selectReviewer('zzz-test-dept', task, config)
      assert.ok(reviewer)
      assert.notEqual(reviewer, 'zzz-test-agent-a', 'reviewer should not be the assignee')
      assert.notEqual(reviewer, 'zzz-test-head', 'reviewer should not be the head')
      // Should pick most idle
      assert.equal(reviewer, 'zzz-test-peer2')
    })

    it('returns null when no candidates available', () => {
      const orchestrator = new QualityOrchestrator({
        sendFn: passSendFn(),
        readAgentActivity: () => ({}),
        loadDeptConfig: () => null,
        readTaskOutput: () => null,
        logger: silentLogger,
      })

      const task = makeTask({
        id: 'zzz-test-no-reviewer',
        assignedAgent: 'zzz-test-only-agent',
      })
      const config = {
        head: 'zzz-test-head',
        agents: ['zzz-test-only-agent', 'zzz-test-head'],
      }

      const reviewer = orchestrator.selectReviewer('zzz-test-dept', task, config)
      assert.equal(reviewer, null)
    })
  })
})
