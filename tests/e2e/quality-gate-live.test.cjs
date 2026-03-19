'use strict'
const { describe, it, before, after, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')

const { shouldSkip, isGatewayRunning, getRegisteredAgents, ROOT } = require('./_helpers/env-loader.cjs')
const { snapshotJsonl, restoreJsonl, COSTS_FILE, EVENTS_FILE } = require('./_helpers/cleanup.cjs')

const skip = shouldSkip()
if (skip.skip) {
  describe('(skipped) Quality Gate Live', () => {
    it(skip.reason, () => {})
  })
  return
}

// A sample output long enough (>500 chars) for quality gate evaluation
const SAMPLE_OUTPUT = [
  '在晨曦初绽的古城广场上，身披银灰色斗篷的旅者缓缓步入人群之中。',
  '他的目光如同深邃的湖水，沉静而充满故事。腰间悬挂着一柄古老的长剑，',
  '剑鞘上镌刻着已经褪色的家族纹章——一只展翅的鹰隼与三颗星辰。',
  '他的名字叫做艾尔温，曾是北境守卫军的精锐骑士，如今却以孤独行者的身份游走于大陆各地。',
  '三年前的那场战役改变了一切：他的部队在暴风雪中遭遇伏击，二十七名战友永远留在了冰原之上。',
  '作为唯一的幸存者，他背负着无法言说的愧疚，发誓要找到那场阴谋背后的真相。',
  '每一个夜晚，当篝火的光芒映照着他棱角分明的面庞时，他都会从怀中取出一枚已经磨得发亮的铜币——',
  '那是他最年轻的战友留给他的最后遗物。他知道，这段旅程才刚刚开始，',
  '而前方等待他的将是比暴风雪更加凶险的考验。但他已不再恐惧，因为他明白，',
  '唯有直面黑暗，才能为那些逝去的灵魂找到安息之所。他抬起头，望向远方连绵的山脉，',
  '深吸一口清晨带着露水气息的空气，重新踏上了征途。',
].join('')

describe('Quality Gate — real LLM scoring', () => {
  let agents
  let sendToAgent, closePool, QualityOrchestrator, transition
  let costsSize, eventsSize
  let gatewayAvailable = false

  before(async () => {
    const running = await isGatewayRunning()
    if (!running) {
      console.log('Gateway not running — skipping')
      return
    }

    agents = getRegisteredAgents()
    assert.ok(agents.length > 0, 'No registered agents')

    const core = require(join(ROOT, 'core', 'index.cjs'))
    sendToAgent = core.autopilot.sendToAgent
    closePool = core.autopilot.closePool
    QualityOrchestrator = core.task.QualityOrchestrator
    transition = core.task.transition
    gatewayAvailable = true
  })

  afterEach(() => {
    if (costsSize !== undefined) restoreJsonl(COSTS_FILE, costsSize)
    if (eventsSize !== undefined) restoreJsonl(EVENTS_FILE, eventsSize)
  })

  after(() => {
    if (closePool) closePool()
  })

  it('self-check: Agent scores its own output with SCORE/PASSED format', async () => {
    if (!gatewayAvailable) return
    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    const agentId = agents[0]
    const task = {
      id: `zzz-test-qg-self-${Date.now()}`,
      name: '撰写角色介绍',
      status: 'review',
      type: 'writing',
      priority: 'P1',
      assignees: [agentId],
      assignedAgent: agentId,
      dependencies: [],
      creator: 'e2e-test',
      progress: 80,
      quality: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const orchestrator = new QualityOrchestrator({
      sendFn: sendToAgent,
      readAgentActivity: () => ({ [agentId]: { idleMins: 0, totalTokens: 0 } }),
      loadDeptConfig: () => ({
        id: 'test-dept',
        name: 'Test Dept',
        head: agentId,
        agents: [agentId],
        enabled: true,
        interval: 600,
      }),
      readTaskOutput: () => SAMPLE_OUTPUT,
      logger: console,
    })

    const result = await orchestrator.process('test-dept', task)

    // Verify result structure
    assert.ok(typeof result.passed === 'boolean', 'result.passed should be boolean')

    // Verify self-check was populated
    assert.ok(task.quality.selfCheck, 'selfCheck should exist on task.quality')
    assert.ok(typeof task.quality.selfCheck.score === 'number', 'selfCheck.score should be a number')
    assert.ok(task.quality.selfCheck.score >= 0 && task.quality.selfCheck.score <= 100,
      `selfCheck.score should be 0-100, got ${task.quality.selfCheck.score}`)
    assert.ok(task.quality.selfCheck.at, 'selfCheck.at should be set')
  })

  it('full three-stage quality gate: self-check → peer review → head approval', async () => {
    if (!gatewayAvailable) return
    if (agents.length < 3) {
      console.log('Need ≥3 registered agents for three-stage test — skipping')
      return
    }

    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    const assignee = agents[0]
    const reviewer = agents[1]
    const head = agents[2]

    const task = {
      id: `zzz-test-qg-full-${Date.now()}`,
      name: '撰写角色介绍',
      status: 'review',
      type: 'writing',
      priority: 'P1',
      assignees: [assignee],
      assignedAgent: assignee,
      dependencies: [],
      creator: 'e2e-test',
      progress: 80,
      quality: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const orchestrator = new QualityOrchestrator({
      sendFn: sendToAgent,
      readAgentActivity: () => ({
        [assignee]: { idleMins: 0, totalTokens: 1000 },
        [reviewer]: { idleMins: 10, totalTokens: 500 },
        [head]: { idleMins: 0, totalTokens: 800 },
      }),
      loadDeptConfig: () => ({
        id: 'novel',
        name: 'Novel Department',
        head,
        agents: [assignee, reviewer, head],
        enabled: true,
        interval: 600,
      }),
      readTaskOutput: () => SAMPLE_OUTPUT,
      logger: console,
    })

    const result = await orchestrator.process('novel', task)
    assert.ok(typeof result.passed === 'boolean', 'result.passed should be boolean')

    // Self-check always runs
    assert.ok(task.quality.selfCheck, 'selfCheck should exist')
    assert.ok(typeof task.quality.selfCheck.score === 'number', 'selfCheck.score should be number')

    // Peer review and head approval only run if previous stages pass.
    // LLM is non-deterministic — verify structure of whatever stages ran.
    if (task.quality.selfCheck.passed) {
      // Self-check passed → peer review should have been attempted
      assert.ok(task.quality.peerReview, 'peerReview should exist when selfCheck passed')
      assert.equal(task.quality.peerReview.reviewer, reviewer, 'peerReview.reviewer should match')
      assert.ok(typeof task.quality.peerReview.score === 'number', 'peerReview.score should be number')

      if (task.quality.peerReview.passed) {
        // Peer review passed → head approval should have been attempted
        assert.ok(task.quality.headApproval, 'headApproval should exist when peerReview passed')
        assert.equal(task.quality.headApproval.approver, head, 'headApproval.approver should match')
        assert.ok(typeof task.quality.headApproval.passed === 'boolean', 'headApproval.passed should be boolean')
      } else {
        console.log('  peer review did not pass — head approval skipped (expected)')
      }
    } else {
      console.log(`  self-check did not pass (score: ${task.quality.selfCheck.score}) — subsequent stages skipped (expected)`)
      // Verify the orchestrator correctly short-circuited
      assert.ok(!task.quality.peerReview, 'peerReview should not exist when selfCheck failed')
    }
  })

  it('quality gate result drives correct state transition', async () => {
    if (!gatewayAvailable) return
    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    const agentId = agents[0]
    const task = {
      id: `zzz-test-qg-transition-${Date.now()}`,
      name: '测试质量门后状态流转',
      status: 'review',
      type: 'writing',
      priority: 'P1',
      assignees: [agentId],
      assignedAgent: agentId,
      dependencies: [],
      creator: 'e2e-test',
      progress: 80,
      quality: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const orchestrator = new QualityOrchestrator({
      sendFn: sendToAgent,
      readAgentActivity: () => ({ [agentId]: { idleMins: 0, totalTokens: 0 } }),
      loadDeptConfig: () => ({
        id: 'test-dept',
        name: 'Test Dept',
        head: agentId,
        agents: [agentId],
        enabled: true,
        interval: 600,
      }),
      readTaskOutput: () => SAMPLE_OUTPUT,
      logger: console,
    })

    const result = await orchestrator.process('test-dept', task)

    if (result.passed) {
      const tr = transition(task, 'completed', { actor: 'quality-gate' })
      assert.equal(tr.ok, true, 'transition to completed should succeed')
      assert.equal(task.status, 'completed')
    } else {
      const tr = transition(task, 'rework', { actor: 'quality-gate', reason: result.reason })
      assert.equal(tr.ok, true, 'transition to rework should succeed')
      assert.equal(task.status, 'rework')

      // Can continue: rework → in_progress → review
      transition(task, 'in_progress', { actor: agentId })
      const tr2 = transition(task, 'review', { actor: agentId })
      assert.equal(tr2.ok, true, 'rework cycle should work')
      assert.equal(task.status, 'review')
    }
  })
})
