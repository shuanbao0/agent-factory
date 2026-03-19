'use strict'
const { describe, it, before, after, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')

const { shouldSkip, isGatewayRunning, hasRegisteredAgents, ROOT } = require('./_helpers/env-loader.cjs')
const { snapshotJsonl, restoreJsonl, snapshotFile, restoreFile, COSTS_FILE, EVENTS_FILE } = require('./_helpers/cleanup.cjs')

const skip = shouldSkip()
if (skip.skip) {
  describe('(skipped) Quality Gate — Real Reviewer Selection', () => {
    it(skip.reason, () => {})
  })
  return
}

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

const NOVEL_DEPT_STATE_FILE = join(ROOT, 'config', 'departments', 'novel', 'state.json')

// Preferred reviewers for writing tasks (from strategy.cjs)
const WRITING_PREFERRED = ['reader-analyst', 'style-editor', 'continuity-mgr']

describe('Quality Gate — Real Reviewer Selection (Novel Department)', { timeout: 300_000 }, () => {
  let QualityOrchestrator, getStrategy, transition, checkBudget
  let sendToAgent, closePool
  let gatewayAvailable = false
  let costsSize, eventsSize, stateSnapshot

  before(async () => {
    const core = require(join(ROOT, 'core', 'index.cjs'))
    QualityOrchestrator = core.task.QualityOrchestrator
    getStrategy = core.task.getStrategy
    transition = core.task.transition
    checkBudget = core.observe.checkBudget

    const running = await isGatewayRunning()
    if (running) {
      sendToAgent = core.autopilot.sendToAgent
      closePool = core.autopilot.closePool
      gatewayAvailable = true
    }

    // Snapshot department state to restore after tests
    stateSnapshot = snapshotFile(NOVEL_DEPT_STATE_FILE)
  })

  afterEach(() => {
    if (costsSize !== undefined) { restoreJsonl(COSTS_FILE, costsSize); costsSize = undefined }
    if (eventsSize !== undefined) { restoreJsonl(EVENTS_FILE, eventsSize); eventsSize = undefined }
  })

  after(() => {
    if (closePool) closePool()
    restoreFile(NOVEL_DEPT_STATE_FILE, stateSnapshot)
  })

  function makeNovelConfig(overrides) {
    return {
      id: 'novel',
      name: 'Novel Department',
      head: 'novel-chief',
      agents: ['novel-chief', 'novel-writer', 'reader-analyst', 'style-editor', 'continuity-mgr', 'plot-architect'],
      enabled: true,
      interval: 600,
      budget: { dailyTokenLimit: 800000, alertThreshold: 0.8 },
      ...overrides,
    }
  }

  function makeWritingTask(overrides) {
    const now = new Date().toISOString()
    return {
      id: `zzz-test-qgr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: '撰写第一章',
      status: 'review',
      type: 'writing',
      priority: 'P1',
      assignees: ['novel-writer'],
      assignedAgent: 'novel-writer',
      dependencies: [],
      creator: 'e2e-test',
      progress: 80,
      quality: {},
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }
  }

  it('selectReviewer picks from preferredReviewers for writing tasks', () => {
    const config = makeNovelConfig()
    const task = makeWritingTask()

    const orchestrator = new QualityOrchestrator({
      sendFn: () => {},
      readAgentActivity: () => ({
        'reader-analyst': { idleMins: 10, totalTokens: 500 },
        'style-editor': { idleMins: 5, totalTokens: 800 },
        'continuity-mgr': { idleMins: 20, totalTokens: 300 },
      }),
      loadDeptConfig: () => config,
    })

    const reviewer = orchestrator.selectReviewer('novel', task, config)
    assert.ok(WRITING_PREFERRED.includes(reviewer), `reviewer ${reviewer} should be in preferredReviewers`)
    assert.notEqual(reviewer, 'novel-writer', 'reviewer should not be the assignee')
    assert.notEqual(reviewer, 'novel-chief', 'reviewer should not be the head')
  })

  it('selectReviewer picks most idle preferred reviewer', () => {
    const config = makeNovelConfig()
    const task = makeWritingTask()

    const orchestrator = new QualityOrchestrator({
      sendFn: () => {},
      readAgentActivity: () => ({
        'reader-analyst': { idleMins: 2, totalTokens: 500 },
        'style-editor': { idleMins: 30, totalTokens: 800 },
        'continuity-mgr': { idleMins: 15, totalTokens: 300 },
      }),
      loadDeptConfig: () => config,
    })

    const reviewer = orchestrator.selectReviewer('novel', task, config)
    assert.equal(reviewer, 'style-editor', 'should pick the most idle preferred reviewer')
  })

  it('selectReviewer falls back when preferred reviewers unavailable', () => {
    // Config with only novel-writer, plot-architect, and novel-chief
    // None of the preferred reviewers are present
    const config = makeNovelConfig({
      agents: ['novel-chief', 'novel-writer', 'plot-architect'],
    })
    const task = makeWritingTask()

    const orchestrator = new QualityOrchestrator({
      sendFn: () => {},
      readAgentActivity: () => ({
        'plot-architect': { idleMins: 10, totalTokens: 100 },
      }),
      loadDeptConfig: () => config,
    })

    const reviewer = orchestrator.selectReviewer('novel', task, config)
    assert.equal(reviewer, 'plot-architect', 'should fall back to only eligible candidate')
  })

  it('three-stage quality gate with real novel department agents', async () => {
    if (!gatewayAvailable) {
      console.log('  Gateway not available — skipping real quality gate test')
      return
    }

    const needed = ['novel-writer', 'reader-analyst', 'novel-chief']
    if (!hasRegisteredAgents(needed)) {
      console.log(`  Required agents ${needed.join(', ')} not all registered — skipping`)
      return
    }

    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    const config = makeNovelConfig()
    const task = makeWritingTask()

    const orchestrator = new QualityOrchestrator({
      sendFn: sendToAgent,
      readAgentActivity: () => ({
        'novel-writer': { idleMins: 0, totalTokens: 1000 },
        'reader-analyst': { idleMins: 30, totalTokens: 200 },
        'style-editor': { idleMins: 5, totalTokens: 500 },
        'continuity-mgr': { idleMins: 10, totalTokens: 400 },
        'novel-chief': { idleMins: 0, totalTokens: 800 },
      }),
      loadDeptConfig: () => config,
      readTaskOutput: () => SAMPLE_OUTPUT,
      logger: console,
    })

    const result = await orchestrator.process('novel', task)
    assert.ok(typeof result.passed === 'boolean', 'result.passed should be boolean')

    // Self-check always runs
    assert.ok(task.quality.selfCheck, 'selfCheck should exist')
    assert.ok(typeof task.quality.selfCheck.score === 'number')
    assert.ok(task.quality.selfCheck.score >= 0 && task.quality.selfCheck.score <= 100)

    if (task.quality.selfCheck.passed) {
      // Peer review should use reader-analyst (most idle preferred reviewer)
      assert.ok(task.quality.peerReview, 'peerReview should exist when selfCheck passed')
      assert.equal(task.quality.peerReview.reviewer, 'reader-analyst',
        'should pick reader-analyst as most idle preferred reviewer')

      if (task.quality.peerReview.passed) {
        assert.ok(task.quality.headApproval, 'headApproval should exist when peerReview passed')
        assert.equal(task.quality.headApproval.approver, 'novel-chief')
      } else {
        console.log('  peer review did not pass — head approval skipped (expected)')
      }
    } else {
      console.log(`  self-check did not pass (score: ${task.quality.selfCheck.score}) — subsequent stages skipped`)
    }
  })

  it('checkBudget returns valid result for novel department', () => {
    const result = checkBudget('novel')
    assert.ok(typeof result.allowed === 'boolean', 'allowed should be boolean')
    assert.ok(typeof result.ratio === 'number', 'ratio should be number')
    assert.ok(result.ratio >= 0, 'ratio should be >= 0')
  })

  it('quality gate result drives correct state transition', async () => {
    if (!gatewayAvailable) {
      console.log('  Gateway not available — skipping transition test')
      return
    }

    if (!hasRegisteredAgents(['novel-writer'])) {
      console.log('  novel-writer not registered — skipping')
      return
    }

    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    const task = makeWritingTask()

    const orchestrator = new QualityOrchestrator({
      sendFn: sendToAgent,
      readAgentActivity: () => ({ 'novel-writer': { idleMins: 0, totalTokens: 0 } }),
      loadDeptConfig: () => makeNovelConfig({ agents: ['novel-chief', 'novel-writer'] }),
      readTaskOutput: () => SAMPLE_OUTPUT,
      logger: console,
    })

    const result = await orchestrator.process('novel', task)

    if (result.passed) {
      const tr = transition(task, 'completed', { actor: 'quality-gate' })
      assert.ok(tr.ok, 'transition to completed should succeed')
      assert.equal(task.status, 'completed')
    } else {
      const tr = transition(task, 'rework', { actor: 'quality-gate', reason: result.reason })
      assert.ok(tr.ok, 'transition to rework should succeed')
      assert.equal(task.status, 'rework')

      // Verify rework cycle works
      transition(task, 'in_progress', { actor: 'novel-writer' })
      const tr2 = transition(task, 'review', { actor: 'novel-writer' })
      assert.ok(tr2.ok, 'rework cycle should work')
      assert.equal(task.status, 'review')
    }
  })
})
