'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')

describe('DeptConfig Queries', () => {
  let db

  before(() => {
    const Database = require('better-sqlite3')
    db = new Database(':memory:')
    const { runMigrations } = require('../../../core/db/migrations.cjs')
    runMigrations(db)
  })

  after(() => { if (db) db.close() })

  it('should upsert and find dept config', () => {
    const { deptConfigToRow, rowToDeptConfig } = require('../../../core/db/queries/dept-config-queries.cjs')
    const config = { id: 'novel', name: 'Novel Writing', head: 'novel-chief',
      interval: 600, enabled: true, agents: ['writer', 'researcher'],
      budget: { dailyTokenLimit: 500000, alertThreshold: 0.8 },
      kpis: { chapters_per_day: { target: 5, unit: 'chapters' } } }

    db.prepare(`INSERT OR REPLACE INTO dept_config (id, name, head, interval_s, enabled, agents, budget, kpis, workflow, updated_at)
      VALUES (@id, @name, @head, @interval_s, @enabled, @agents, @budget, @kpis, @workflow, @updated_at)`).run(deptConfigToRow(config))

    const row = db.prepare('SELECT * FROM dept_config WHERE id = ?').get('novel')
    const result = rowToDeptConfig(row)
    assert.equal(result.id, 'novel')
    assert.equal(result.head, 'novel-chief')
    assert.equal(result.enabled, true)
    assert.deepEqual(result.agents, ['writer', 'researcher'])
    assert.equal(result.budget.dailyTokenLimit, 500000)
  })

  it('should list all dept IDs', () => {
    const { deptConfigToRow } = require('../../../core/db/queries/dept-config-queries.cjs')
    db.prepare(`INSERT OR REPLACE INTO dept_config (id, name, head, interval_s, enabled, agents, budget, kpis, workflow, updated_at)
      VALUES (@id, @name, @head, @interval_s, @enabled, @agents, @budget, @kpis, @workflow, @updated_at)`)
      .run(deptConfigToRow({ id: 'tech', name: 'Tech', head: 'tech-lead', interval: 300,
        enabled: false, agents: ['dev'] }))

    const ids = db.prepare('SELECT id FROM dept_config ORDER BY id').all().map(r => r.id)
    assert.deepEqual(ids, ['novel', 'tech'])
  })
})
