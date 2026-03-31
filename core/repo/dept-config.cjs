'use strict'
/**
 * DeptConfigRepository — 部门配置的数据访问层
 *
 * 设计模式：Repository（DB 读 + 文件双写）
 *
 * 职责：
 * - 配置读取走 DB dept_config 表（替代文件缓存）
 * - 写入双写到 DB + departments/{deptId}/config.json
 *
 * DB 读取是亚毫秒级，不再需要缓存/无缓存双实例模式。
 * 保留 deptConfigRepoNoCache 导出名用于向后兼容（指向同一实例）。
 */
const { join } = require('path')
const { existsSync, readdirSync } = require('fs')
const { BaseRepository } = require('./base.cjs')
const { DEPARTMENTS_DIR } = require('../common/paths.cjs')
const logger = require('../common/logger.cjs')

// Lazy DB requires
let _upsertDeptConfig, _findDeptConfigById, _findAllDeptConfigs, _listDeptIdsFromDb, _deleteDeptConfigFromDb
function db() {
  if (!_upsertDeptConfig) {
    const q = require('../db/queries/dept-config-queries.cjs')
    _upsertDeptConfig = q.upsertDeptConfig
    _findDeptConfigById = q.findDeptConfigById
    _findAllDeptConfigs = q.findAllDeptConfigs
    _listDeptIdsFromDb = q.listDeptIdsFromDb
    _deleteDeptConfigFromDb = q.deleteDeptConfigFromDb
  }
}

class DeptConfigRepository extends BaseRepository {
  /** 读取部门配置（DB 读） */
  load(deptId) {
    try {
      db()
      const config = _findDeptConfigById(deptId)
      if (config) return config
    } catch (err) {
      logger.debug('dept-config-repo', 'DB read failed, falling back to file', { deptId, error: err.message })
    }
    // Fallback
    const configPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
    return this.read(configPath)
  }

  /** 保存部门配置（DB + 文件双写） */
  save(deptId, config) {
    // DB 写入
    try {
      db()
      _upsertDeptConfig({ ...config, id: deptId })
    } catch (err) {
      logger.debug('dept-config-repo', 'DB write failed', { deptId, error: err.message })
    }
    // 文件写入
    const configPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
    this.write(configPath, config)
  }

  /** 原子更新部门配置 */
  updateConfig(deptId, mutator) {
    const current = this.load(deptId) || {}
    const updated = mutator(current)
    this.save(deptId, updated)
    return updated
  }

  configPath(deptId) {
    return join(DEPARTMENTS_DIR, deptId, 'config.json')
  }

  /** 列出所有部门 ID（DB 查询） */
  listDeptIds() {
    try {
      db()
      const ids = _listDeptIdsFromDb()
      if (ids.length > 0) return ids
    } catch (err) {
      logger.debug('dept-config-repo', 'DB listDeptIds failed, falling back', { error: err.message })
    }
    // Fallback
    if (!existsSync(DEPARTMENTS_DIR)) return []
    return readdirSync(DEPARTMENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  }
}

/** 单例（DB 读不需要缓存） */
const deptConfigRepo = new DeptConfigRepository()
/** 向后兼容导出（指向同一实例） */
const deptConfigRepoNoCache = deptConfigRepo

module.exports = { DeptConfigRepository, deptConfigRepo, deptConfigRepoNoCache }
