'use strict'
const { describe, it, before, after, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')

const { shouldSkip, isGatewayRunning, getRegisteredAgents, ROOT } = require('./_helpers/env-loader.cjs')
const { snapshotJsonl, restoreJsonl, COSTS_FILE, EVENTS_FILE } = require('./_helpers/cleanup.cjs')

const skip = shouldSkip()
if (skip.skip) {
  describe('(skipped) Task State Flow', () => {
    it(skip.reason, () => {})
  })
  return
}

describe('Task State Flow — real agent interaction', () => {
  let agentId
  let sendToAgent, closePool, transition, parseTaskAssignments, normalizeTask
  let costsSize, eventsSize

  before(async () => {
    const running = await isGatewayRunning()
    if (!running) {
      console.log('Gateway not running — skipping')
      process.exit(0)
    }

    const agents = getRegisteredAgents()
    assert.ok(agents.length > 0, 'No registered agents')
    agentId = agents[0]

    const core = require(join(ROOT, 'core', 'index.cjs'))
    sendToAgent = core.autopilot.sendToAgent
    closePool = core.autopilot.closePool
    transition = core.task.transition
    parseTaskAssignments = core.task.parseTaskAssignments
    normalizeTask = core.repo.taskRepo.normalizeTask.bind(core.repo.taskRepo)
  })

  afterEach(() => {
    if (costsSize !== undefined) restoreJsonl(COSTS_FILE, costsSize)
    if (eventsSize !== undefined) restoreJsonl(EVENTS_FILE, eventsSize)
  })

  after(() => {
    if (closePool) closePool()
  })

  it('full task flow: pending → assigned → in_progress → review → completed', async () => {
    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    const task = {
      id: `zzz-test-flow-${Date.now()}`,
      name: '撰写一段100字的角色介绍',
      status: 'pending',
      type: 'writing',
      priority: 'P1',
      assignees: [],
      dependencies: [],
      creator: 'e2e-test',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // pending → assigned
    let result = transition(task, 'assigned', { actor: 'test', reason: '测试分配', recordHistory: true })
    assert.equal(result.ok, true, `pending→assigned failed: ${result.error}`)
    task.assignedAgent = agentId
    task.assignees = [agentId]
    assert.equal(task.status, 'assigned')

    // assigned → in_progress
    result = transition(task, 'in_progress', { actor: agentId, recordHistory: true })
    assert.equal(result.ok, true, `assigned→in_progress failed: ${result.error}`)
    assert.equal(task.status, 'in_progress')

    // Send task to Agent for real LLM output
    const sessionKey = `agent:${agentId}:e2e-task-${Date.now()}`
    const response = await sendToAgent(
      agentId,
      sessionKey,
      `请完成以下任务：${task.name}\n要求：直接输出内容，不少于100字。`,
      60000
    )
    assert.equal(response.ok, true, `sendToAgent failed: ${response.error}`)
    assert.ok(response.text.length > 50, `Output too short (${response.text.length} chars)`)
    task.output = response.text

    // in_progress → review
    result = transition(task, 'review', { actor: agentId, reason: '产出完成', recordHistory: true })
    assert.equal(result.ok, true, `in_progress→review failed: ${result.error}`)
    assert.equal(task.status, 'review')

    // review → completed
    result = transition(task, 'completed', { actor: 'quality-gate', reason: '质量门通过', recordHistory: true })
    assert.equal(result.ok, true, `review→completed failed: ${result.error}`)
    assert.equal(task.status, 'completed')
    assert.ok(task.completedAt, 'completedAt should be set')
    assert.ok(Array.isArray(task._transitions), '_transitions should be an array')
    assert.ok(task._transitions.length >= 4, `Expected ≥4 transition entries, got ${task._transitions.length}`)
  })

  it('rework path: review → rework → in_progress → review → completed', () => {
    const task = {
      id: `zzz-test-rework-${Date.now()}`,
      name: '测试返工流程',
      status: 'pending',
      type: 'writing',
      priority: 'P1',
      assignees: [agentId],
      assignedAgent: agentId,
      dependencies: [],
      creator: 'e2e-test',
      progress: 0,
      reworkCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Fast-forward to review
    transition(task, 'assigned', { actor: 'test' })
    transition(task, 'in_progress', { actor: agentId })
    transition(task, 'review', { actor: agentId })
    assert.equal(task.status, 'review')

    // review → rework
    let result = transition(task, 'rework', { actor: 'reviewer', reason: '需要改进' })
    assert.equal(result.ok, true, `review→rework failed: ${result.error}`)
    assert.equal(task.status, 'rework')
    // State machine doesn't auto-increment reworkCount; track manually like Autopilot does
    task.reworkCount = (task.reworkCount || 0) + 1

    // rework → in_progress
    result = transition(task, 'in_progress', { actor: agentId })
    assert.equal(result.ok, true, `rework→in_progress failed: ${result.error}`)

    // in_progress → review → completed
    transition(task, 'review', { actor: agentId })
    result = transition(task, 'completed', { actor: 'quality-gate' })
    assert.equal(result.ok, true, `review→completed failed: ${result.error}`)
    assert.equal(task.status, 'completed')
    assert.ok(task.reworkCount >= 1, `reworkCount should be ≥1, got ${task.reworkCount}`)
  })

  it('parseTaskAssignments parses real Agent response', async () => {
    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    const sessionKey = `agent:${agentId}:e2e-assign-${Date.now()}`
    const prompt = [
      '请按以下格式回复（不要添加其他内容）：',
      '[任务分配]',
      '- @novel-writer: 撰写第一章开头',
      '- @worldbuilder: 设定世界观',
      '',
      '直接输出上述格式即可。',
    ].join('\n')

    const response = await sendToAgent(agentId, sessionKey, prompt, 60000)
    assert.equal(response.ok, true, `sendToAgent failed: ${response.error}`)

    // Parse the real LLM response — it may or may not follow the format exactly
    const assignments = parseTaskAssignments(response.text)
    assert.ok(Array.isArray(assignments), 'parseTaskAssignments should return an array')
    // LLM might not strictly follow format, so just verify no crash
    // If it did parse, verify structure
    for (const item of assignments) {
      assert.ok(typeof item.agentId === 'string', 'each assignment should have agentId')
      assert.ok(typeof item.summary === 'string', 'each assignment should have summary')
    }
  })
})
