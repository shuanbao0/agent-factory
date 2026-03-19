'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('TaskRepository', () => {
  it('exports TaskRepository and taskRepo', () => {
    const mod = require('../../../core/repo/task.cjs')
    assert.ok(mod.TaskRepository)
    assert.ok(mod.taskRepo)
    assert.ok(typeof mod.taskRepo.normalizeTask === 'function')
    assert.ok(typeof mod.taskRepo.readStandaloneTasks === 'function')
    assert.ok(typeof mod.taskRepo.readProjectsWithTasks === 'function')
    assert.ok(typeof mod.taskRepo.readProjectTasks === 'function')
    assert.ok(typeof mod.taskRepo.findAllTasks === 'function')
    assert.ok(typeof mod.taskRepo.findTaskById === 'function')
    assert.ok(typeof mod.taskRepo.updateProjectTask === 'function')
    assert.ok(typeof mod.taskRepo.deleteProjectTask === 'function')
    assert.ok(typeof mod.taskRepo.updateTaskInPlace === 'function')
  })

  it('normalizeTask handles legacy "running" status', () => {
    const { taskRepo } = require('../../../core/repo/task.cjs')
    const task = taskRepo.normalizeTask({ id: 't1', name: 'test', status: 'running' })
    assert.equal(task.status, 'in_progress')
  })

  it('normalizeTask defaults', () => {
    const { taskRepo } = require('../../../core/repo/task.cjs')
    const task = taskRepo.normalizeTask({ id: 't2', name: 'test' })
    assert.equal(task.status, 'pending')
    assert.equal(task.priority, 'P1')
    assert.equal(task.creator, 'user')
    assert.equal(task.progress, 0)
    assert.deepEqual(task.dependencies, [])
    assert.deepEqual(task.assignees, [])
  })

  it('normalizeTask extracts assignees from assignedAgent', () => {
    const { taskRepo } = require('../../../core/repo/task.cjs')
    const task = taskRepo.normalizeTask({ id: 't3', name: 'test', assignedAgent: 'writer-a' })
    assert.deepEqual(task.assignees, ['writer-a'])
    assert.equal(task.assignedAgent, 'writer-a')
  })
})
