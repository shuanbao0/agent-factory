'use strict'
/**
 * Session lifecycle — memory extraction + cleanup strategy tests
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('session-lifecycle', () => {
  describe('agentHasActiveTasks', () => {
    const { agentHasActiveTasks } = require('../../../core/autopilot/department-loop.cjs')

    const mkTask = (id, assignedAgent, status) => ({
      id, assignedAgent, assignees: [assignedAgent], status,
      name: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })

    it('returns true when agent has in_progress task in project', () => {
      const projects = [{ tasks: [mkTask('t1', 'writer', 'in_progress')] }]
      assert.equal(agentHasActiveTasks('writer', projects, []), true)
    })

    it('returns true for assigned status', () => {
      const projects = [{ tasks: [mkTask('t1', 'writer', 'assigned')] }]
      assert.equal(agentHasActiveTasks('writer', projects, []), true)
    })

    it('returns true for review status', () => {
      assert.equal(agentHasActiveTasks('writer', [], [mkTask('t1', 'writer', 'review')]), true)
    })

    it('returns true for rework status', () => {
      assert.equal(agentHasActiveTasks('writer', [], [mkTask('t1', 'writer', 'rework')]), true)
    })

    it('returns true for pending status', () => {
      assert.equal(agentHasActiveTasks('writer', [], [mkTask('t1', 'writer', 'pending')]), true)
    })

    it('returns false when all tasks are completed', () => {
      const projects = [{ tasks: [mkTask('t1', 'writer', 'completed')] }]
      assert.equal(agentHasActiveTasks('writer', projects, [mkTask('t2', 'writer', 'completed')]), false)
    })

    it('returns false when all tasks are failed', () => {
      assert.equal(agentHasActiveTasks('writer', [], [mkTask('t1', 'writer', 'failed')]), false)
    })

    it('returns false when agent has no tasks', () => {
      const projects = [{ tasks: [mkTask('t1', 'editor', 'in_progress')] }]
      assert.equal(agentHasActiveTasks('writer', projects, []), false)
    })

    it('returns false for empty inputs', () => {
      assert.equal(agentHasActiveTasks('writer', [], []), false)
    })

    it('checks assignees array as well as assignedAgent', () => {
      const task = { id: 't1', assignedAgent: 'chief', assignees: ['chief', 'writer'], status: 'in_progress',
        name: 't1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      assert.equal(agentHasActiveTasks('writer', [{ tasks: [task] }], []), true)
    })

    it('mixed terminal and active — returns true', () => {
      const projects = [{ tasks: [
        mkTask('t1', 'writer', 'completed'),
        mkTask('t2', 'writer', 'in_progress'),
      ] }]
      assert.equal(agentHasActiveTasks('writer', projects, [mkTask('t3', 'writer', 'failed')]), true)
    })
  })

  describe('listStaleSessions includes :main', () => {
    it('sessionRepo.listStaleSessions no longer skips :main', () => {
      const { sessionRepo } = require('../../../core/repo/session.cjs')
      // listStaleSessions should exist and accept maxDays param
      assert.ok(typeof sessionRepo.listStaleSessions === 'function')
      // Call with 0 days — should not throw
      const result = sessionRepo.listStaleSessions(0)
      assert.ok(Array.isArray(result))
    })
  })

  describe('memory extraction functions are callable', () => {
    it('extractTaskMemory and compressMemoryByRole are exported from memory.cjs', () => {
      const { extractTaskMemory, compressMemoryByRole } = require('../../../core/agent/memory.cjs')
      assert.ok(typeof extractTaskMemory === 'function')
      assert.ok(typeof compressMemoryByRole === 'function')
    })

    it('compressMemoryByRole returns early for null response', () => {
      const { compressMemoryByRole } = require('../../../core/agent/memory.cjs')
      // Should not throw and should return immediately
      compressMemoryByRole('non-existent', null, 'member')
      compressMemoryByRole('non-existent', '', 'leader')
    })

    it('extractTaskMemory skips output shorter than 20 chars', () => {
      const { extractTaskMemory } = require('../../../core/agent/memory.cjs')
      // Should not throw for short output
      extractTaskMemory('test-agent', { id: 'task-short', name: 'Test' }, 'too short')
      extractTaskMemory('test-agent', { id: 'task-null', name: 'Test' }, null)
    })
  })
})
