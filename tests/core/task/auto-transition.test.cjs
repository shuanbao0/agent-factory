'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseTaskAssignments, parseTaskCompletions, computeTransitions } = require('../../../core/task/auto-transition.cjs')

describe('AutoTransition', () => {
  describe('parseTaskAssignments', () => {
    it('returns empty for null', () => {
      assert.deepEqual(parseTaskAssignments(null), [])
    })

    it('parses assignments', () => {
      const text = '[任务分配]\n- writer-a: 写第一章\n- writer-b: 写第二章'
      const result = parseTaskAssignments(text)
      assert.equal(result.length, 2)
      assert.equal(result[0].agentId, 'writer-a')
      assert.equal(result[0].summary, '写第一章')
    })

    it('skips 无需分配', () => {
      const text = '[任务分配]\n- writer-a: 无需分配'
      assert.deepEqual(parseTaskAssignments(text), [])
    })
  })

  describe('parseTaskCompletions', () => {
    it('returns empty for null', () => {
      assert.deepEqual(parseTaskCompletions(null), [])
    })

    it('parses completion section', () => {
      const text = '[任务完成]\n- task-abc123: 已完成'
      const result = parseTaskCompletions(text)
      assert.deepEqual(result, ['task-abc123'])
    })
  })

  describe('computeTransitions', () => {
    it('promotes assigned task when agent active', () => {
      const result = computeTransitions({
        allTasks: [{ id: 't1', name: 'Task 1', status: 'assigned', assignedAgent: 'a1' }],
        agentActivity: { a1: { idleMins: 2 } },
        chiefResponseText: '',
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].to, 'in_progress')
    })

    it('fails assigned task when agent stale', () => {
      const result = computeTransitions({
        allTasks: [{ id: 't1', name: 'Task 1', status: 'assigned', assignedAgent: 'a1' }],
        agentActivity: { a1: { idleMins: 35 } },
        chiefResponseText: '',
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].to, 'failed')
    })

    it('moves in_progress to review when idle', () => {
      const result = computeTransitions({
        allTasks: [{ id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'a1', progress: 80 }],
        agentActivity: { a1: { idleMins: 20 } },
        chiefResponseText: '',
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].to, 'review')
    })

    it('skips in idleOnly mode for chief completions', () => {
      const result = computeTransitions({
        allTasks: [{ id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'a1' }],
        agentActivity: {},
        chiefResponseText: '[任务完成]\n- t1: 完成',
        idleOnly: true,
      })
      assert.equal(result.filter(t => t.to === 'review' && t.reason.includes('chief')).length, 0)
    })
  })
})
