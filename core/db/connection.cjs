'use strict'
/**
 * connection.cjs — SQLite 单例连接管理
 *
 * 设计模式：Singleton（全局唯一 DB 连接）
 *
 * 职责：
 * - 懒初始化 better-sqlite3 连接
 * - WAL 模式支持 autopilot + dashboard 并发访问
 * - 自动运行 schema 迁移
 */
const { existsSync, mkdirSync } = require('fs')
const { dirname } = require('path')
const { DB_FILE } = require('../common/paths.cjs')
const logger = require('../common/logger.cjs')

let _db = null

/**
 * 获取 DB 单例连接（懒初始化）
 *
 * 首次调用时创建 DB 文件、设置 WAL 模式、运行迁移。
 * 后续调用直接返回缓存的连接。
 *
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (_db) return _db

  const Database = require('better-sqlite3')
  const dir = dirname(DB_FILE)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  _db = new Database(DB_FILE)
  _db.pragma('journal_mode = WAL')
  _db.pragma('synchronous = NORMAL')
  _db.pragma('foreign_keys = ON')
  _db.pragma('busy_timeout = 5000')

  const { runMigrations } = require('./migrations.cjs')
  runMigrations(_db)

  logger.info('db', 'Database initialized', { path: DB_FILE })
  return _db
}

/**
 * 关闭 DB 连接（优雅关闭时调用）
 */
function closeDb() {
  if (_db) {
    _db.close()
    _db = null
  }
}

module.exports = { getDb, closeDb }
