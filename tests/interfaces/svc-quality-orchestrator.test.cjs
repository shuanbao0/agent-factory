'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { QualityOrchestrator } = require('../../core/task/quality-orchestrator.cjs')

const mockSendFn = async (agentId, sessionKey, msg, timeout) => ({
  ok: true, text: 'SCORE: 85\nPASSED: true\nISSUES: none\nCOMMENTS: looks good\nAPPROVED'
})
const failSendFn = async () => ({
  ok: true, text: 'SCORE: 30\nPASSED: false\nISSUES: quality too low'
})
const mockActivity = () => ({
  'agent-a': { totalTokens: 1000, idleMins: 2, lastActive: new Date().toISOString() },
  'agent-b': { totalTokens: 500, idleMins: 5, lastActive: new Date().toISOString() },
})
const mockDeptConfig = (deptId) => ({
  id: deptId, head: 'chief-test', agents: ['agent-a', 'agent-b', 'chief-test'],
  workflow: { taskTypes: ['coding'] }
})
const mockReadOutput = () => 'Sample task output content'
const mockLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }

describe('QualityOrchestrator', () => {
  it('constructor creates instance without error', () => {
    const orchestrator = new QualityOrchestrator({
      sendFn: mockSendFn,
      readAgentActivity: mockActivity,
      loadDeptConfig: mockDeptConfig,
      readTaskOutput: mockReadOutput,
      logger: mockLogger,
    })
    assert.ok(orchestrator instanceof QualityOrchestrator)
  })

  it('process with all-pass sendFn returns passed: true', async () => {
    const orchestrator = new QualityOrchestrator({
      sendFn: mockSendFn,
      readAgentActivity: mockActivity,
      loadDeptConfig: mockDeptConfig,
      readTaskOutput: mockReadOutput,
      logger: mockLogger,
    })

    const task = {
      id: 'test-task',
      name: 'Test Task',
      status: 'review',
      assignees: ['agent-a'],
      assignedAgent: 'agent-a',
      type: 'coding',
      projectId: 'test-proj',
      quality: {},
    }

    const result = await orchestrator.process('test-dept', task)
    assert.equal(result.passed, true)
  })

  it('process with fail sendFn (self-check fails) returns passed: false', async () => {
    const orchestrator = new QualityOrchestrator({
      sendFn: failSendFn,
      readAgentActivity: mockActivity,
      loadDeptConfig: mockDeptConfig,
      readTaskOutput: mockReadOutput,
      logger: mockLogger,
    })

    const task = {
      id: 'test-task-fail',
      name: 'Failing Task',
      status: 'review',
      assignees: ['agent-a'],
      assignedAgent: 'agent-a',
      type: 'coding',
      projectId: 'test-proj',
      quality: {},
    }

    const result = await orchestrator.process('test-dept', task)
    assert.equal(result.passed, false)
  })

  it('selectReviewer returns agent from config (not assignee, not head)', () => {
    const orchestrator = new QualityOrchestrator({
      sendFn: mockSendFn,
      readAgentActivity: mockActivity,
      loadDeptConfig: mockDeptConfig,
      readTaskOutput: mockReadOutput,
      logger: mockLogger,
    })

    const task = {
      id: 'test-task',
      name: 'Test Task',
      assignedAgent: 'agent-a',
      assignees: ['agent-a'],
      type: 'coding',
    }
    const config = {
      id: 'test-dept',
      head: 'chief-test',
      agents: ['agent-a', 'agent-b', 'chief-test'],
      workflow: { taskTypes: ['coding'] },
    }

    const reviewer = orchestrator.selectReviewer('test-dept', task, config)
    assert.equal(reviewer, 'agent-b')
  })

  it('selectReviewer returns null if no eligible agents', () => {
    const orchestrator = new QualityOrchestrator({
      sendFn: mockSendFn,
      readAgentActivity: mockActivity,
      loadDeptConfig: mockDeptConfig,
      readTaskOutput: mockReadOutput,
      logger: mockLogger,
    })

    const task = {
      id: 'test-task',
      name: 'Test Task',
      assignedAgent: 'agent-a',
      assignees: ['agent-a'],
      type: 'coding',
    }
    const config = {
      id: 'test-dept',
      head: 'agent-a',
      agents: ['agent-a'],
      workflow: { taskTypes: ['coding'] },
    }

    const reviewer = orchestrator.selectReviewer('test-dept', task, config)
    assert.equal(reviewer, null)
  })

  it('findTasksInReview finds tasks with status review', () => {
    const orchestrator = new QualityOrchestrator({
      sendFn: mockSendFn,
      readAgentActivity: mockActivity,
      loadDeptConfig: mockDeptConfig,
      readTaskOutput: mockReadOutput,
      logger: mockLogger,
    })

    const projects = [
      {
        tasks: [
          { id: 't1', status: 'review', assignedAgent: 'agent-a', assignees: ['agent-a'] },
          { id: 't2', status: 'in_progress', assignedAgent: 'agent-b', assignees: ['agent-b'] },
          { id: 't3', status: 'review', assignedAgent: 'agent-b', assignees: ['agent-b'] },
        ],
      },
    ]

    const result = orchestrator.findTasksInReview('test-dept', projects)
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 2)
    assert.ok(result.every(t => t.status === 'review'))
  })
})
