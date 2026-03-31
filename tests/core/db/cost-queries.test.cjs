'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { mkdirSync, rmSync } = require('fs')
const os = require('os')

describe('Cost Queries', () => {
  let db
  const tmpDir = join(os.tmpdir(), `af-cost-test-${Date.now()}`)

  before(() => {
    mkdirSync(tmpDir, { recursive: true })
    const Database = require('better-sqlite3')
    db = new Database(':memory:')
    const { runMigrations } = require('../../../core/db/migrations.cjs')
    runMigrations(db)
  })

  after(() => {
    if (db) db.close()
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ok */ }
  })

  it('should insert and query cost entries', () => {
    db.prepare(`
      INSERT INTO cost_entries (ts, date, model, input_tokens, output_tokens, cost, source, agent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('2026-03-31T10:00:00Z', '2026-03-31', 'claude-sonnet-4-6', 1000, 500, 0.0105, 'dept:novel', 'writer')

    db.prepare(`
      INSERT INTO cost_entries (ts, date, model, input_tokens, output_tokens, cost, source, agent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('2026-03-31T11:00:00Z', '2026-03-31', 'claude-sonnet-4-6', 2000, 1000, 0.021, 'dept:novel', 'writer')

    db.prepare(`
      INSERT INTO cost_entries (ts, date, model, input_tokens, output_tokens, cost, source, agent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('2026-03-30T10:00:00Z', '2026-03-30', 'claude-opus-4-6', 500, 200, 0.0225, 'ceo', 'ceo')

    // Query all
    const all = db.prepare('SELECT COUNT(*) AS cnt FROM cost_entries').get()
    assert.equal(all.cnt, 3)

    // Query by date
    const today = db.prepare('SELECT COUNT(*) AS cnt FROM cost_entries WHERE date = ?').get('2026-03-31')
    assert.equal(today.cnt, 2)

    // Aggregation
    const totals = db.prepare(`
      SELECT SUM(cost) AS totalCost, SUM(input_tokens) AS totalInput, SUM(output_tokens) AS totalOutput
      FROM cost_entries WHERE date = ?
    `).get('2026-03-31')
    assert.ok(Math.abs(totals.totalCost - 0.0315) < 0.0001)
    assert.equal(totals.totalInput, 3000)
    assert.equal(totals.totalOutput, 1500)
  })

  it('should group by date and source for daily summary', () => {
    const rows = db.prepare(`
      SELECT date, source, ROUND(SUM(cost), 6) AS cost, SUM(input_tokens) AS inputTokens,
             SUM(output_tokens) AS outputTokens, COUNT(*) AS calls
      FROM cost_entries GROUP BY date, source ORDER BY date, source
    `).all()

    assert.equal(rows.length, 2)
    assert.equal(rows[0].date, '2026-03-30')
    assert.equal(rows[0].source, 'ceo')
    assert.equal(rows[1].date, '2026-03-31')
    assert.equal(rows[1].source, 'dept:novel')
    assert.equal(rows[1].calls, 2)
  })
})
