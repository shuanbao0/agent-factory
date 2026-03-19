'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')

const PROJECT_ROOT = join(__dirname, '..', '..')
const { parseTaskAssignments, parseTaskCompletions, computeTransitions, IDLE_COMPLETE_MINS, STALE_TASK_MINS } = require('../../core/task/auto-transition.cjs')

describe('AutoTransition', () => {
  it('IDLE_COMPLETE_MINS is 18', () => {
    assert.equal(IDLE_COMPLETE_MINS, 18)
  })

  it('STALE_TASK_MINS is 30', () => {
    assert.equal(STALE_TASK_MINS, 30)
  })

  it('parseTaskAssignments with valid text returns assignments', () => {
    const text = `[任务分配]
- @agent-a: 完成报告
- @agent-b: 代码审查
`
    const result = parseTaskAssignments(text)
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 2)
    assert.equal(result[0].agentId, '@agent-a')
    assert.equal(result[0].summary, '完成报告')
    assert.equal(result[1].agentId, '@agent-b')
    assert.equal(result[1].summary, '代码审查')
  })

  it('parseTaskAssignments with empty text returns empty array', () => {
    const result = parseTaskAssignments('')
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 0)
  })

  it('parseTaskCompletions with valid text returns task IDs', () => {
    const text = `[任务完成]
- task-123
- task-456
`
    const result = parseTaskCompletions(text)
    assert.ok(Array.isArray(result))
    assert.ok(result.includes('task-123'))
    assert.ok(result.includes('task-456'))
  })

  it('parseTaskCompletions with empty text returns empty array', () => {
    const result = parseTaskCompletions('')
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 0)
  })

  it('computeTransitions with idle task (idleMins > 18) produces review transition', () => {
    const result = computeTransitions({
      allTasks: [
        { id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'agent-a', assignees: ['agent-a'], progress: 80 },
      ],
      agentActivity: { 'agent-a': { idleMins: 20, totalTokens: 1000 } },
      chiefResponseText: '',
    })
    assert.ok(Array.isArray(result))
    assert.ok(result.length >= 1)
    const t = result.find(r => r.taskId === 't1')
    assert.ok(t, 'should find transition for t1')
    assert.equal(t.to, 'review')
  })

  it('computeTransitions with stale task (idleMins > 30 and low progress) produces failed transition', () => {
    const result = computeTransitions({
      allTasks: [
        { id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'agent-a', assignees: ['agent-a'], progress: 10 },
      ],
      agentActivity: { 'agent-a': { idleMins: 35, totalTokens: 1000 } },
      chiefResponseText: '',
    })
    assert.ok(Array.isArray(result))
    assert.ok(result.length >= 1)
    const t = result.find(r => r.taskId === 't1')
    assert.ok(t, 'should find transition for t1')
    assert.equal(t.to, 'failed')
  })

  it('computeTransitions skips terminal tasks (completed/failed)', () => {
    const result = computeTransitions({
      allTasks: [
        { id: 't1', name: 'Done Task', status: 'completed', assignedAgent: 'agent-a', assignees: ['agent-a'] },
        { id: 't2', name: 'Failed Task', status: 'failed', assignedAgent: 'agent-b', assignees: ['agent-b'] },
      ],
      agentActivity: {
        'agent-a': { idleMins: 999, totalTokens: 0 },
        'agent-b': { idleMins: 999, totalTokens: 0 },
      },
      chiefResponseText: '',
    })
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 0)
  })

  it('computeTransitions with empty input returns empty array', () => {
    const result = computeTransitions({
      allTasks: [],
      agentActivity: {},
      chiefResponseText: '',
    })
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 0)
  })
})
