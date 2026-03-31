'use strict'
/**
 * migrations.cjs — 版本化 Schema 迁移引擎
 *
 * 设计模式：前向迁移（只有 up，无 down）
 *
 * 文件数据是恢复路径，不需要 down migration。
 * 迁移在事务中执行，失败自动回滚。
 */
const logger = require('../common/logger.cjs')

const ALL_MIGRATIONS = [
  require('./schema/001-initial.cjs'),
  require('./schema/002-dept-cycles.cjs'),
  require('./schema/003-messages.cjs'),
  require('./schema/004-metadata-tables.cjs'),
]

/**
 * 运行所有未应用的迁移
 *
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )`)

  const applied = new Set(
    db.prepare('SELECT version FROM _migrations').all().map(r => r.version)
  )

  for (const m of ALL_MIGRATIONS) {
    if (applied.has(m.version)) continue
    db.transaction(() => {
      m.up(db)
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(m.version, m.name)
    })()
    logger.info('db', 'Migration applied', { version: m.version, name: m.name })
  }
}

module.exports = { runMigrations, ALL_MIGRATIONS }
