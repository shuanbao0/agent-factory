'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync, writeFileSync } = require('fs')

const { TASKS_FILE } = require('../../core/common/paths.cjs')
const { TaskRepository, taskRepo } = require('../../core/repo/task.cjs')

describe('TaskRepository', () => {
  let repo

  beforeEach(() => {
    repo = new TaskRepository()
  })

  describe('normalizeTask', () => {
    it('fills defaults for minimal input', () => {
      const t = repo.normalizeTask({})
      assert.equal(t.status, 'pending')
      assert.equal(t.priority, 'P1')
      assert.ok(Array.isArray(t.assignees))
      assert.equal(t.assignees.length, 0)
      assert.ok(Array.isArray(t.dependencies))
      assert.equal(t.dependencies.length, 0)
      assert.ok(typeof t.createdAt === 'string')
      assert.ok(typeof t.updatedAt === 'string')
    })

    it('preserves existing fields', () => {
      const t = repo.normalizeTask({
        id: 'task-1',
        name: 'Test Task',
        status: 'completed',
        priority: 'P0',
        assignees: ['agent-a'],
        creator: 'ceo',
      })
      assert.equal(t.id, 'task-1')
      assert.equal(t.name, 'Test Task')
      assert.equal(t.status, 'completed')
      assert.equal(t.priority, 'P0')
      assert.deepEqual(t.assignees, ['agent-a'])
      assert.equal(t.creator, 'ceo')
    })

    it('normalizes status running to in_progress', () => {
      const t = repo.normalizeTask({ status: 'running' })
      assert.equal(t.status, 'in_progress')
    })

    it('sets projectId from second argument', () => {
      const t = repo.normalizeTask({}, 'proj-1')
      assert.equal(t.projectId, 'proj-1')
    })

    it('derives assignees from assignedAgent when assignees missing', () => {
      const t = repo.normalizeTask({ assignedAgent: 'agent-x' })
      assert.deepEqual(t.assignees, ['agent-x'])
      assert.equal(t.assignedAgent, 'agent-x')
    })

    it('sets assignedAgent to first of assignees', () => {
      const t = repo.normalizeTask({ assignees: ['a1', 'a2'] })
      assert.equal(t.assignedAgent, 'a1')
    })
  })

  describe('I/O operations', () => {
    let backupRaw

    beforeEach(() => {
      backupRaw = existsSync(TASKS_FILE) ? readFileSync(TASKS_FILE, 'utf-8') : null
    })

    afterEach(() => {
      if (backupRaw !== null) writeFileSync(TASKS_FILE, backupRaw)
    })

    it('readStandaloneTasks returns array', () => {
      const tasks = taskRepo.readStandaloneTasks()
      assert.ok(Array.isArray(tasks))
    })

    it('findAllTasks returns array', () => {
      const tasks = taskRepo.findAllTasks()
      assert.ok(Array.isArray(tasks))
    })

    it('findTaskById returns null for non-existent ID', () => {
      const result = taskRepo.findTaskById('zzz-nonexistent-task-' + Date.now())
      assert.equal(result, null)
    })

    it('writeStandaloneTasks + readStandaloneTasks roundtrip', () => {
      const testTask = {
        id: 'zzz-test-task-' + Date.now(),
        name: 'Roundtrip Test',
        status: 'pending',
        priority: 'P2',
        assignees: [],
        dependencies: [],
        creator: 'user',
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const current = taskRepo.readStandaloneTasks()
      taskRepo.writeStandaloneTasks([...current, testTask])
      const after = taskRepo.readStandaloneTasks()
      const found = after.find(t => t.id === testTask.id)
      assert.ok(found, 'test task should be present after write')
      assert.equal(found.name, 'Roundtrip Test')
    })

    it('updateTaskInPlace returns null for non-existent task', () => {
      const result = taskRepo.updateTaskInPlace('zzz-nonexistent-' + Date.now(), { name: 'nope' })
      assert.equal(result, null)
    })
  })
})
