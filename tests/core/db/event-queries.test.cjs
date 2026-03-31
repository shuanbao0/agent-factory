'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')

describe('Event Queries', () => {
  let db

  before(() => {
    const Database = require('better-sqlite3')
    db = new Database(':memory:')
    const { runMigrations } = require('../../../core/db/migrations.cjs')
    runMigrations(db)
  })

  after(() => { if (db) db.close() })

  it('should insert and query events', () => {
    db.prepare('INSERT INTO events (type, ts, payload) VALUES (?, ?, ?)').run(
      'cycle.start', '2026-03-31T10:00:00Z', JSON.stringify({ deptId: 'novel', cycleNum: 1 })
    )
    db.prepare('INSERT INTO events (type, ts, payload) VALUES (?, ?, ?)').run(
      'cycle.end', '2026-03-31T10:05:00Z', JSON.stringify({ deptId: 'novel', cycleNum: 1, ok: true })
    )
    db.prepare('INSERT INTO events (type, ts, payload) VALUES (?, ?, ?)').run(
      'cost.tracked', '2026-03-31T10:01:00Z', JSON.stringify({ model: 'sonnet', cost: 0.01 })
    )

    // All events
    const all = db.prepare('SELECT COUNT(*) AS cnt FROM events').get()
    assert.equal(all.cnt, 3)

    // Filter by type
    const cycles = db.prepare("SELECT * FROM events WHERE type LIKE 'cycle.%' ORDER BY ts").all()
    assert.equal(cycles.length, 2)

    // Filter by time range
    const range = db.prepare("SELECT * FROM events WHERE ts >= ? AND ts <= ?").all(
      '2026-03-31T10:00:00Z', '2026-03-31T10:02:00Z'
    )
    assert.equal(range.length, 2)

    // Payload parsing
    const first = db.prepare('SELECT payload FROM events WHERE type = ?').get('cycle.start')
    const parsed = JSON.parse(first.payload)
    assert.equal(parsed.deptId, 'novel')
    assert.equal(parsed.cycleNum, 1)
  })

  it('should respect limit', () => {
    const limited = db.prepare('SELECT * FROM events ORDER BY ts DESC LIMIT ?').all(1)
    assert.equal(limited.length, 1)
    assert.equal(limited[0].type, 'cycle.end')
  })
})
