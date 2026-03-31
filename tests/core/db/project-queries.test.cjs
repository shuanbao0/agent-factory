'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')

describe('Project Queries', () => {
  let db

  before(() => {
    const Database = require('better-sqlite3')
    db = new Database(':memory:')
    const { runMigrations } = require('../../../core/db/migrations.cjs')
    runMigrations(db)
  })

  after(() => { if (db) db.close() })

  it('should upsert and find project', () => {
    const { projectToRow, rowToProject } = require('../../../core/db/queries/project-queries.cjs')
    const project = { id: 'novel/default', name: 'Novel', status: 'in-progress',
      currentPhase: 2, totalPhases: 5, department: 'novel',
      assignedAgents: ['writer', 'researcher'],
      createdAt: '2026-01-01T00:00:00Z' }

    db.prepare(`INSERT OR REPLACE INTO projects (id, name, description, status, current_phase, total_phases, phases, department, assigned_agents, created_at, updated_at)
      VALUES (@id, @name, @description, @status, @current_phase, @total_phases, @phases, @department, @assigned_agents, @created_at, @updated_at)`).run(projectToRow(project))

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get('novel/default')
    const result = rowToProject(row)
    assert.equal(result.id, 'novel/default')
    assert.equal(result.status, 'in-progress')
    assert.equal(result.currentPhase, 2)
    assert.deepEqual(result.assignedAgents, ['writer', 'researcher'])
  })

  it('should filter by department', () => {
    const { projectToRow } = require('../../../core/db/queries/project-queries.cjs')
    db.prepare(`INSERT OR REPLACE INTO projects (id, name, description, status, current_phase, total_phases, phases, department, assigned_agents, created_at, updated_at)
      VALUES (@id, @name, @description, @status, @current_phase, @total_phases, @phases, @department, @assigned_agents, @created_at, @updated_at)`)
      .run(projectToRow({ id: 'tech/api', name: 'API', status: 'planning', department: 'tech',
        assignedAgents: [], createdAt: '2026-01-01T00:00:00Z' }))

    const novel = db.prepare('SELECT id FROM projects WHERE department = ?').all('novel')
    assert.equal(novel.length, 1)
    const all = db.prepare('SELECT id FROM projects').all()
    assert.equal(all.length, 2)
  })
})
