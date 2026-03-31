'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')

describe('Agent Queries', () => {
  let db

  before(() => {
    const Database = require('better-sqlite3')
    db = new Database(':memory:')
    const { runMigrations } = require('../../../core/db/migrations.cjs')
    runMigrations(db)
  })

  after(() => { if (db) db.close() })

  it('should upsert and find agent', () => {
    const { agentToRow, rowToAgent } = require('../../../core/db/queries/agent-queries.cjs')
    const agent = { id: 'writer', name: 'Writer', role: 'writer', department: 'novel',
      skills: ['github', 'tmux'], peers: ['researcher'], model: 'claude-sonnet-4-6',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }

    db.prepare(`INSERT OR REPLACE INTO agents (id, template_id, name, role, description, model, skills, peers, department, created_at, updated_at)
      VALUES (@id, @template_id, @name, @role, @description, @model, @skills, @peers, @department, @created_at, @updated_at)`).run(agentToRow(agent))

    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get('writer')
    const result = rowToAgent(row)
    assert.equal(result.id, 'writer')
    assert.equal(result.department, 'novel')
    assert.deepEqual(result.skills, ['github', 'tmux'])
    assert.deepEqual(result.peers, ['researcher'])
  })

  it('should filter by department', () => {
    const { agentToRow } = require('../../../core/db/queries/agent-queries.cjs')
    db.prepare(`INSERT OR REPLACE INTO agents (id, template_id, name, role, description, model, skills, peers, department, created_at, updated_at)
      VALUES (@id, @template_id, @name, @role, @description, @model, @skills, @peers, @department, @created_at, @updated_at)`)
      .run(agentToRow({ id: 'researcher', name: 'Researcher', role: 'researcher', department: 'novel',
        skills: [], peers: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }))
    db.prepare(`INSERT OR REPLACE INTO agents (id, template_id, name, role, description, model, skills, peers, department, created_at, updated_at)
      VALUES (@id, @template_id, @name, @role, @description, @model, @skills, @peers, @department, @created_at, @updated_at)`)
      .run(agentToRow({ id: 'ceo', name: 'CEO', role: 'ceo', department: null,
        skills: [], peers: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }))

    const novel = db.prepare('SELECT id FROM agents WHERE department = ?').all('novel')
    assert.equal(novel.length, 2)
    const all = db.prepare('SELECT id FROM agents').all()
    assert.equal(all.length, 3)
  })
})
