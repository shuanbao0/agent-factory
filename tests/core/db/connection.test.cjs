'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')
const { mkdirSync, rmSync, existsSync } = require('fs')
const os = require('os')

describe('DB Connection', () => {
  const tmpDir = join(os.tmpdir(), `af-db-test-${Date.now()}`)
  const dbFile = join(tmpDir, 'test.db')

  before(() => {
    mkdirSync(tmpDir, { recursive: true })
    // Override DB_FILE for testing
    process.env.AGENT_FACTORY_DATA_DIR = tmpDir
  })

  after(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ok */ }
    delete process.env.AGENT_FACTORY_DATA_DIR
  })

  it('should create DB with WAL mode and run migrations', () => {
    // Fresh require to pick up env override
    const Database = require('better-sqlite3')
    const dbPath = join(tmpDir, 'agent-factory.db')
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')

    const { runMigrations } = require('../../../core/db/migrations.cjs')
    runMigrations(db)

    // Check tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
    const tableNames = tables.map(t => t.name)
    assert.ok(tableNames.includes('cost_entries'), 'cost_entries table should exist')
    assert.ok(tableNames.includes('tasks'), 'tasks table should exist')
    assert.ok(tableNames.includes('task_transitions'), 'task_transitions table should exist')
    assert.ok(tableNames.includes('events'), 'events table should exist')
    assert.ok(tableNames.includes('dept_cycles'), 'dept_cycles table should exist')
    assert.ok(tableNames.includes('kpi_snapshots'), 'kpi_snapshots table should exist')
    assert.ok(tableNames.includes('messages'), 'messages table should exist')
    assert.ok(tableNames.includes('agents'), 'agents table should exist')
    assert.ok(tableNames.includes('projects'), 'projects table should exist')
    assert.ok(tableNames.includes('dept_config'), 'dept_config table should exist')
    assert.ok(tableNames.includes('_migrations'), '_migrations table should exist')

    // Check migrations recorded
    const migrations = db.prepare('SELECT version, name FROM _migrations ORDER BY version').all()
    assert.equal(migrations.length, 4)
    assert.equal(migrations[0].version, 1)
    assert.equal(migrations[1].version, 2)

    // Check WAL mode
    const journalMode = db.pragma('journal_mode', { simple: true })
    assert.equal(journalMode, 'wal')

    db.close()
  })

  it('should be idempotent — running migrations twice does not error', () => {
    const Database = require('better-sqlite3')
    const dbPath = join(tmpDir, 'idempotent.db')
    const db = new Database(dbPath)
    const { runMigrations } = require('../../../core/db/migrations.cjs')

    runMigrations(db)
    runMigrations(db) // second run should be no-op

    const migrations = db.prepare('SELECT version FROM _migrations').all()
    assert.equal(migrations.length, 4)

    db.close()
  })
})
