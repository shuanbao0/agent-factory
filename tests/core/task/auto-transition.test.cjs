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

    // Dual-session tests
    it('skips working agent in dual-session mode', () => {
      const result = computeTransitions({
        allTasks: [{ id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'a1' }],
        agentActivity: { a1: { idleMins: 0 } },
        chiefResponseText: '',
        dualSessionEnabled: true,
        statusQueryResults: { a1: { working: true } },
      })
      assert.equal(result.length, 0)
    })

    it('moves to review when agent reports completed in dual-session mode', () => {
      const result = computeTransitions({
        allTasks: [{ id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'a1' }],
        agentActivity: { a1: { idleMins: 0 } },
        chiefResponseText: '',
        dualSessionEnabled: true,
        statusQueryResults: { a1: { completed: true } },
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].to, 'review')
      assert.ok(result[0].reason.includes('完成'))
    })

    it('moves to review when agent reports idle in dual-session mode', () => {
      const result = computeTransitions({
        allTasks: [{ id: 't1', name: 'Task 1', status: 'rework', assignedAgent: 'a1' }],
        agentActivity: { a1: { idleMins: 0 } },
        chiefResponseText: '',
        dualSessionEnabled: true,
        statusQueryResults: { a1: { idle: true } },
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].to, 'review')
    })

    it('emits _no_response when agent times out in dual-session mode', () => {
      const result = computeTransitions({
        allTasks: [{ id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'a1' }],
        agentActivity: { a1: { idleMins: 0 } },
        chiefResponseText: '',
        dualSessionEnabled: true,
        statusQueryResults: { a1: { timeout: true } },
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].to, '_no_response')
    })

    it('uses legacy path when dualSessionEnabled but no statusQueryResults', () => {
      const result = computeTransitions({
        allTasks: [{ id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'a1', progress: 80 }],
        agentActivity: { a1: { idleMins: 20 } },
        chiefResponseText: '',
        dualSessionEnabled: true,
        statusQueryResults: null,
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].to, 'review')
    })

    it('uses legacy path when dualSessionEnabled is false', () => {
      const result = computeTransitions({
        allTasks: [{ id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'a1', progress: 80 }],
        agentActivity: { a1: { idleMins: 20 } },
        chiefResponseText: '',
        dualSessionEnabled: false,
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].to, 'review')
    })

    // Issue #4: idle=9999 fallback fix
    it('does not auto-fail new agent with no activity (updatedAt 5 min ago)', () => {
      const result = computeTransitions({
        allTasks: [{
          id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'a1',
          progress: 30,
          updatedAt: new Date(Date.now() - 5 * 60000).toISOString(),
        }],
        agentActivity: {},
        chiefResponseText: '',
      })
      // idleMins ≈ 5, should not trigger any transition
      assert.equal(result.length, 0)
    })

    it('auto-fails agent with no activity when updatedAt 35 min ago', () => {
      const result = computeTransitions({
        allTasks: [{
          id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'a1',
          progress: 30,
          updatedAt: new Date(Date.now() - 35 * 60000).toISOString(),
        }],
        agentActivity: {},
        chiefResponseText: '',
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].to, 'failed')
    })

    it('falls back to createdAt when updatedAt missing', () => {
      const result = computeTransitions({
        allTasks: [{
          id: 't1', name: 'Task 1', status: 'in_progress', assignedAgent: 'a1',
          progress: 80,
          createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
        }],
        agentActivity: {},
        chiefResponseText: '',
      })
      // idleMins ≈ 20, goes to review
      assert.equal(result.length, 1)
      assert.equal(result[0].to, 'review')
    })
  })

  // Issue #5: robust regex parsing
  describe('parseTaskAssignments — robust regex', () => {
    it('parses numbered list (1. prefix)', () => {
      const text = '[任务分配]\n1. writer-a: 写第一章\n2. writer-b: 写第二章'
      const result = parseTaskAssignments(text)
      assert.equal(result.length, 2)
      assert.equal(result[0].agentId, 'writer-a')
      assert.equal(result[1].agentId, 'writer-b')
    })

    it('parses numbered list (1) prefix)', () => {
      const text = '[任务分配]\n1) writer-a: 写第一章\n2) writer-b: 写第二章'
      const result = parseTaskAssignments(text)
      assert.equal(result.length, 2)
    })

    it('parses fullwidth brackets 【任务分配】', () => {
      const text = '【任务分配】\n- writer-a: 写第一章'
      const result = parseTaskAssignments(text)
      assert.equal(result.length, 1)
      assert.equal(result[0].agentId, 'writer-a')
    })

    it('parses [project: xxx] annotation', () => {
      const text = '[任务分配]\n- writer-a: 写第一章 [project: novel/chapter-1]\n- writer-b: 写第二章'
      const result = parseTaskAssignments(text)
      assert.equal(result.length, 2)
      assert.equal(result[0].agentId, 'writer-a')
      assert.equal(result[0].summary, '写第一章')
      assert.equal(result[0].projectId, 'novel/chapter-1')
      assert.equal(result[1].agentId, 'writer-b')
      assert.equal(result[1].summary, '写第二章')
      assert.equal(result[1].projectId, undefined)
    })
  })

  describe('parseTaskCompletions — robust regex', () => {
    it('parses fullwidth brackets 【任务完成】', () => {
      const text = '【任务完成】\n- task-abc: 已完成'
      const result = parseTaskCompletions(text)
      assert.deepEqual(result, ['task-abc'])
    })

    it('parses fullwidth brackets 【进展汇报】', () => {
      const text = '【进展汇报】\n- task-xyz: 已完成 100%'
      const result = parseTaskCompletions(text)
      assert.deepEqual(result, ['task-xyz'])
    })
  })
})
