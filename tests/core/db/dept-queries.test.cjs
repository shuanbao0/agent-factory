'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')

describe('Dept & KPI Queries', () => {
  let db

  before(() => {
    const Database = require('better-sqlite3')
    db = new Database(':memory:')
    const { runMigrations } = require('../../../core/db/migrations.cjs')
    runMigrations(db)
  })

  after(() => { if (db) db.close() })

  it('should insert and query dept cycles', () => {
    const stmt = db.prepare(`
      INSERT INTO dept_cycles (dept_id, cycle_num, started_at, completed_at, elapsed_sec, result, tokens_used)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run('novel', 1, '2026-03-31T10:00:00Z', '2026-03-31T10:05:00Z', 300.5, 'success', 50000)
    stmt.run('novel', 2, '2026-03-31T10:30:00Z', '2026-03-31T10:35:00Z', 280.2, 'success', 45000)
    stmt.run('tech', 1, '2026-03-31T10:00:00Z', '2026-03-31T10:04:00Z', 240.0, 'error', 30000)

    // Query by dept
    const novelCycles = db.prepare('SELECT * FROM dept_cycles WHERE dept_id = ? ORDER BY started_at DESC').all('novel')
    assert.equal(novelCycles.length, 2)

    // Token aggregation
    const totals = db.prepare('SELECT SUM(tokens_used) AS total FROM dept_cycles WHERE dept_id = ?').get('novel')
    assert.equal(totals.total, 95000)
  })

  it('should insert and query KPI snapshots', () => {
    const kpis = { completion_rate: { target: 80, actual: 75, achievement: 0.9375 } }
    db.prepare('INSERT INTO kpi_snapshots (dept_id, ts, kpis) VALUES (?, ?, ?)').run(
      'novel', '2026-03-31T10:00:00Z', JSON.stringify(kpis)
    )
    db.prepare('INSERT INTO kpi_snapshots (dept_id, ts, kpis) VALUES (?, ?, ?)').run(
      'novel', '2026-03-31T11:00:00Z', JSON.stringify({ completion_rate: { target: 80, actual: 80, achievement: 1.0 } })
    )

    const history = db.prepare('SELECT ts AS timestamp, kpis FROM kpi_snapshots WHERE dept_id = ? ORDER BY ts DESC LIMIT ?').all('novel', 10)
    assert.equal(history.length, 2)

    const latest = JSON.parse(history[0].kpis)
    assert.equal(latest.completion_rate.actual, 80)
  })
})
