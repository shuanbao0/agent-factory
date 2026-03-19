'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  parseTaskAssignments,
  parseTaskCompletions,
  computeTransitions,
  IDLE_COMPLETE_MINS,
  STALE_TASK_MINS,
} = require('../../core/task/auto-transition.cjs')

describe('parseTaskAssignments', () => {
  it('parses assignments from [任务分配] section', () => {
    const text = `一些前置文字

[任务分配]
- @agent-a: 完成报告撰写
- @agent-b: 代码审查

[其他段落]
一些内容`

    const result = parseTaskAssignments(text)
    assert.equal(result.length, 2)
    assert.equal(result[0].agentId, '@agent-a')
    assert.equal(result[0].summary, '完成报告撰写')
    assert.equal(result[1].agentId, '@agent-b')
    assert.equal(result[1].summary, '代码审查')
  })

  it('returns empty array for null/empty text', () => {
    assert.deepEqual(parseTaskAssignments(null), [])
    assert.deepEqual(parseTaskAssignments(''), [])
  })

  it('returns empty array when no [任务分配] section', () => {
    assert.deepEqual(parseTaskAssignments('just some text without sections'), [])
  })

  it('skips lines with 无需分配', () => {
    const text = `[任务分配]
- @agent-a: 无需分配
- @agent-b: 写文档`

    const result = parseTaskAssignments(text)
    assert.equal(result.length, 1)
    assert.equal(result[0].agentId, '@agent-b')
  })
})

describe('parseTaskCompletions', () => {
  it('parses completions from [任务完成] section', () => {
    const text = `[任务完成]
- task-123: 已完成
- task-456: 已完成

[其他]`

    const result = parseTaskCompletions(text)
    assert.equal(result.length, 2)
    assert.ok(result.includes('task-123'))
    assert.ok(result.includes('task-456'))
  })

  it('parses completions from [进展汇报] section with keywords', () => {
    const text = `[进展汇报]
- task-abc: 已完成，交付产出
- task-def: 进行中，50% 进度`

    const result = parseTaskCompletions(text)
    assert.equal(result.length, 1)
    assert.ok(result.includes('task-abc'))
  })

  it('returns empty array for null/empty text', () => {
    assert.deepEqual(parseTaskCompletions(null), [])
    assert.deepEqual(parseTaskCompletions(''), [])
  })

  it('deduplicates task IDs across sections', () => {
    const text = `[任务完成]
- task-dup: 已完成

[进展汇报]
- task-dup: 100% completed`

    const result = parseTaskCompletions(text)
    assert.equal(result.length, 1)
  })
})

describe('computeTransitions', () => {
  it('idle auto-complete: in_progress task with idleMins > IDLE_COMPLETE_MINS → review', () => {
    const transitions = computeTransitions({
      allTasks: [{
        id: 'zzz-test-idle-1',
        name: 'Idle Task',
        status: 'in_progress',
        assignedAgent: 'zzz-test-agent',
        progress: 80,
      }],
      agentActivity: {
        'zzz-test-agent': { idleMins: IDLE_COMPLETE_MINS + 5 },
      },
      chiefResponseText: '',
    })

    assert.equal(transitions.length, 1)
    assert.equal(transitions[0].taskId, 'zzz-test-idle-1')
    assert.equal(transitions[0].from, 'in_progress')
    assert.equal(transitions[0].to, 'review')
  })

  it('stale auto-fail: in_progress task with idleMins > STALE_TASK_MINS and low progress → failed', () => {
    const transitions = computeTransitions({
      allTasks: [{
        id: 'zzz-test-stale-1',
        name: 'Stale Task',
        status: 'in_progress',
        assignedAgent: 'zzz-test-agent',
        progress: 10,
      }],
      agentActivity: {
        'zzz-test-agent': { idleMins: STALE_TASK_MINS + 5 },
      },
      chiefResponseText: '',
    })

    assert.equal(transitions.length, 1)
    assert.equal(transitions[0].to, 'failed')
  })

  it('skips terminal status tasks', () => {
    const transitions = computeTransitions({
      allTasks: [
        { id: 'zzz-test-done', name: 'Done', status: 'completed', assignedAgent: 'zzz-test-agent' },
        { id: 'zzz-test-failed', name: 'Failed', status: 'failed', assignedAgent: 'zzz-test-agent' },
      ],
      agentActivity: {
        'zzz-test-agent': { idleMins: 999 },
      },
      chiefResponseText: '',
    })

    assert.equal(transitions.length, 0)
  })

  it('skips tasks with no matching agent activity (uses default idle=9999)', () => {
    // With no activity, idleMins defaults to 9999 which triggers stale
    // But a task with progress >= 50 won't go to failed, it'll go to review
    const transitions = computeTransitions({
      allTasks: [{
        id: 'zzz-test-noact',
        name: 'No Activity',
        status: 'in_progress',
        assignedAgent: 'zzz-test-unknown',
        progress: 60,
      }],
      agentActivity: {},
      chiefResponseText: '',
    })

    // idleMins=9999 > IDLE_COMPLETE_MINS, so goes to review
    assert.ok(transitions.length >= 1)
    assert.equal(transitions[0].to, 'review')
  })

  it('dual session mode with statusQueryResults', () => {
    const transitions = computeTransitions({
      allTasks: [{
        id: 'zzz-test-dual-1',
        name: 'Dual Session Task',
        status: 'in_progress',
        assignedAgent: 'zzz-test-agent',
        progress: 80,
      }],
      agentActivity: {
        'zzz-test-agent': { idleMins: 5 },
      },
      chiefResponseText: '',
      dualSessionEnabled: true,
      statusQueryResults: {
        'zzz-test-agent': { completed: true },
      },
    })

    assert.equal(transitions.length, 1)
    assert.equal(transitions[0].to, 'review')
    assert.ok(transitions[0].reason.includes('完成'))
  })

  it('dual session mode: working agent is not transitioned', () => {
    const transitions = computeTransitions({
      allTasks: [{
        id: 'zzz-test-dual-working',
        name: 'Working Task',
        status: 'in_progress',
        assignedAgent: 'zzz-test-agent',
        progress: 50,
      }],
      agentActivity: {
        'zzz-test-agent': { idleMins: 5 },
      },
      chiefResponseText: '',
      dualSessionEnabled: true,
      statusQueryResults: {
        'zzz-test-agent': { working: true },
      },
    })

    assert.equal(transitions.length, 0)
  })

  it('empty chief response → empty results (no tasks)', () => {
    const transitions = computeTransitions({
      allTasks: [],
      agentActivity: {},
      chiefResponseText: '',
    })

    assert.deepEqual(transitions, [])
  })

  it('chief-reported completion moves in_progress task to review', () => {
    const transitions = computeTransitions({
      allTasks: [{
        id: 'task-abc123',
        name: 'Chief Reported',
        status: 'in_progress',
        assignedAgent: 'zzz-test-agent',
        progress: 100,
      }],
      agentActivity: {
        'zzz-test-agent': { idleMins: 2 },
      },
      chiefResponseText: `[任务完成]
- task-abc123: 已完成`,
    })

    assert.equal(transitions.length, 1)
    assert.equal(transitions[0].taskId, 'task-abc123')
    assert.equal(transitions[0].to, 'review')
    assert.ok(transitions[0].reason.includes('chief'))
  })

  it('assigned task with active agent → in_progress', () => {
    const transitions = computeTransitions({
      allTasks: [{
        id: 'zzz-test-assigned',
        name: 'Assigned Task',
        status: 'assigned',
        assignedAgent: 'zzz-test-agent',
      }],
      agentActivity: {
        'zzz-test-agent': { idleMins: 2 },
      },
      chiefResponseText: '',
    })

    assert.equal(transitions.length, 1)
    assert.equal(transitions[0].from, 'assigned')
    assert.equal(transitions[0].to, 'in_progress')
  })
})
