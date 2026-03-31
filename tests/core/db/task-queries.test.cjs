'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')

describe('Task Queries', () => {
  let db

  before(() => {
    const Database = require('better-sqlite3')
    db = new Database(':memory:')
    const { runMigrations } = require('../../../core/db/migrations.cjs')
    runMigrations(db)
  })

  after(() => { if (db) db.close() })

  it('should upsert and query tasks', () => {
    const { taskToRow, rowToTask } = require('../../../core/db/queries/task-queries.cjs')

    const task = {
      id: 'task-1', name: 'Test', status: 'pending', priority: 'P0',
      assignees: ['agent-1'], assignedAgent: 'agent-1', creator: 'user',
      progress: 0, dependencies: ['task-0'], projectId: 'proj-1',
      createdAt: '2026-03-31T00:00:00Z', updatedAt: '2026-03-31T00:00:00Z',
    }

    const row = taskToRow(task)
    db.prepare(`
      INSERT OR REPLACE INTO tasks (
        id, name, description, project_id, phase, status, priority,
        assignees, assigned_agent, creator, progress, dependencies,
        output, tags, type, parent_task_id, quality, rework_count,
        rework_from_id, failure_reason, created_at, updated_at, completed_at
      ) VALUES (
        @id, @name, @description, @project_id, @phase, @status, @priority,
        @assignees, @assigned_agent, @creator, @progress, @dependencies,
        @output, @tags, @type, @parent_task_id, @quality, @rework_count,
        @rework_from_id, @failure_reason, @created_at, @updated_at, @completed_at
      )
    `).run(row)

    // Query back
    const dbRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get('task-1')
    assert.ok(dbRow, 'task should exist in DB')
    const result = rowToTask(dbRow)
    assert.equal(result.id, 'task-1')
    assert.equal(result.status, 'pending')
    assert.equal(result.priority, 'P0')
    assert.deepEqual(result.assignees, ['agent-1'])
    assert.deepEqual(result.dependencies, ['task-0'])
    assert.equal(result.projectId, 'proj-1')
  })

  it('should filter tasks by status', () => {
    // Add another task
    const { taskToRow } = require('../../../core/db/queries/task-queries.cjs')
    db.prepare(`
      INSERT OR REPLACE INTO tasks (
        id, name, description, project_id, phase, status, priority,
        assignees, assigned_agent, creator, progress, dependencies,
        output, tags, type, parent_task_id, quality, rework_count,
        rework_from_id, failure_reason, created_at, updated_at, completed_at
      ) VALUES (
        @id, @name, @description, @project_id, @phase, @status, @priority,
        @assignees, @assigned_agent, @creator, @progress, @dependencies,
        @output, @tags, @type, @parent_task_id, @quality, @rework_count,
        @rework_from_id, @failure_reason, @created_at, @updated_at, @completed_at
      )
    `).run(taskToRow({
      id: 'task-2', name: 'Completed', status: 'completed', priority: 'P1',
      assignees: [], creator: 'system', progress: 100, dependencies: [],
      createdAt: '2026-03-31T00:00:00Z', updatedAt: '2026-03-31T01:00:00Z',
      completedAt: '2026-03-31T01:00:00Z',
    }))

    const pending = db.prepare("SELECT COUNT(*) AS cnt FROM tasks WHERE status = 'pending'").get()
    assert.equal(pending.cnt, 1)

    const completed = db.prepare("SELECT COUNT(*) AS cnt FROM tasks WHERE status = 'completed'").get()
    assert.equal(completed.cnt, 1)
  })

  it('should insert and query transitions', () => {
    db.prepare(`
      INSERT INTO task_transitions (task_id, from_st, to_st, actor, reason, at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('task-1', 'pending', 'assigned', 'system', 'auto-assign', '2026-03-31T00:01:00Z')

    db.prepare(`
      INSERT INTO task_transitions (task_id, from_st, to_st, actor, reason, at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('task-1', 'assigned', 'in_progress', 'agent-1', 'started', '2026-03-31T00:02:00Z')

    const transitions = db.prepare(
      'SELECT from_st AS "from", to_st AS "to", actor, reason, at FROM task_transitions WHERE task_id = ? ORDER BY at'
    ).all('task-1')

    assert.equal(transitions.length, 2)
    assert.equal(transitions[0].from, 'pending')
    assert.equal(transitions[0].to, 'assigned')
    assert.equal(transitions[1].from, 'assigned')
    assert.equal(transitions[1].to, 'in_progress')
  })
})
