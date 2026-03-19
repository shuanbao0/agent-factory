'use strict'
const { describe, it, before, after, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { existsSync } = require('fs')

const { shouldSkip, isGatewayRunning, getRegisteredAgents, ROOT } = require('./_helpers/env-loader.cjs')
const { snapshotJsonl, restoreJsonl, cleanupTestProjects, COSTS_FILE, EVENTS_FILE } = require('./_helpers/cleanup.cjs')

const skip = shouldSkip()
if (skip.skip) {
  describe('(skipped) Project Execution', () => {
    it(skip.reason, () => {})
  })
  return
}

describe('Project Execution — task assignment to completion', () => {
  let agentId
  let sendToAgent, closePool, transition, createProject, projectMetaRepo
  let costsSize, eventsSize
  const testProjectIds = []

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
    createProject = core.common.projectService.createProject
    projectMetaRepo = core.repo.projectMetaRepo
  })

  afterEach(() => {
    if (costsSize !== undefined) restoreJsonl(COSTS_FILE, costsSize)
    if (eventsSize !== undefined) restoreJsonl(EVENTS_FILE, eventsSize)
    cleanupTestProjects(testProjectIds.splice(0))
  })

  after(() => {
    if (closePool) closePool()
  })

  it('project creation → task assignment → agent execution → completion', async () => {
    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    // 1. Create project
    const projectId = `zzz-test-proj-e2e-${Date.now()}`
    testProjectIds.push(projectId)

    const projResult = createProject(
      { name: projectId, description: 'E2E 测试项目', department: 'novel' },
      { phases: ['draft'], directories: ['output'] }
    )
    assert.equal(projResult.ok, true, `createProject failed: ${projResult.error}`)

    // Verify project meta exists
    const metaPath = join(ROOT, 'projects', projectId, '.project-meta.json')
    assert.ok(existsSync(metaPath), '.project-meta.json should exist')

    // 2. Create a task for the project (in-memory, we'll write it to project meta)
    const task = {
      id: `zzz-test-task-proj-${Date.now()}`,
      name: '为测试项目撰写一段200字的场景描写',
      status: 'pending',
      type: 'writing',
      priority: 'P1',
      projectId,
      phase: 0,
      assignees: [],
      dependencies: [],
      creator: 'e2e-test',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // 3. Assign to Agent
    let result = transition(task, 'assigned', { actor: 'test' })
    assert.equal(result.ok, true, `pending→assigned failed: ${result.error}`)
    task.assignedAgent = agentId
    task.assignees = [agentId]

    // 4. Agent executes (real LLM call)
    result = transition(task, 'in_progress', { actor: agentId })
    assert.equal(result.ok, true, `assigned→in_progress failed: ${result.error}`)

    const sessionKey = `agent:${agentId}:e2e-proj-${Date.now()}`
    const response = await sendToAgent(
      agentId,
      sessionKey,
      `完成任务: ${task.name}\n直接输出内容。`,
      60000
    )
    assert.equal(response.ok, true, `sendToAgent failed: ${response.error}`)
    assert.ok(response.text.length > 30, `Output too short: ${response.text.length} chars`)
    task.output = response.text

    // 5. Complete
    transition(task, 'review', { actor: agentId })
    result = transition(task, 'completed', { actor: 'e2e-test' })
    assert.equal(result.ok, true, `review→completed failed: ${result.error}`)
    assert.equal(task.status, 'completed')

    // 6. Verify project still exists and is readable
    const projectMeta = projectMetaRepo.readMeta(projectId)
    assert.ok(projectMeta, 'project meta should be readable')
  })
})
