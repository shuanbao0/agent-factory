'use strict'
const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { TaskService } = require('./task-service.cjs')

describe('TaskService', () => {
  let service
  let updatedTasks

  beforeEach(() => {
    updatedTasks = []
    service = new TaskService({
      updateTaskStatus: async (agentId, taskId, status, extras) => {
        updatedTasks.push({ agentId, taskId, status, extras })
      },
    })
  })

  it('transitionTask succeeds for valid transition', async () => {
    const task = { status: 'pending', id: 'task-1' }
    const result = await service.transitionTask('agent-a', 'task-1', task, 'assigned', 'test')
    assert.equal(result.ok, true)
    assert.equal(task.status, 'assigned')
    assert.equal(updatedTasks.length, 1)
    assert.equal(updatedTasks[0].status, 'assigned')
  })

  it('transitionTask rejects invalid transition', async () => {
    const task = { status: 'completed', id: 'task-2' }
    const result = await service.transitionTask('agent-a', 'task-2', task, 'pending', 'test')
    assert.equal(result.ok, false)
    assert.ok(result.error.includes('Invalid transition'))
    assert.equal(updatedTasks.length, 0)
  })

  it('transitionTask passes extras through', async () => {
    const task = { status: 'in_progress', id: 'task-3' }
    const extras = { progress: 100 }
    const result = await service.transitionTask('agent-b', 'task-3', task, 'review', 'done', extras)
    assert.equal(result.ok, true)
    assert.equal(updatedTasks[0].extras, extras)
  })

  it('transitionTask sets completedAt on completed', async () => {
    const task = { status: 'review', id: 'task-4' }
    const result = await service.transitionTask('agent-a', 'task-4', task, 'completed', 'approved')
    assert.equal(result.ok, true)
    assert.ok(task.completedAt)
  })

  it('transitionTask rejects failed to pending (terminal state)', async () => {
    const task = { status: 'failed', id: 'task-5' }
    const result = await service.transitionTask('agent-a', 'task-5', task, 'pending', 'retry')
    assert.equal(result.ok, false)
    assert.equal(updatedTasks.length, 0)
  })
})
