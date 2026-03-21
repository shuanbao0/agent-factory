'use strict'
/**
 * DeptConfigRepository — 部门配置的数据访问层
 *
 * 设计模式：Repository + Dual Instance（缓存实例 / 无缓存实例）
 *
 * 职责：
 * - 管理 config/departments/{deptId}/config.json
 * - 存储部门配置：成员列表、head agent、workflow 策略等
 *
 * 导出两个实例：
 * - deptConfigRepo      — 30 秒缓存，供 Autopilot 循环读取
 * - deptConfigRepoNoCache — 无缓存，供 API 路由并发写入（需要每次读到最新数据）
 */
const { join } = require('path')
const { existsSync, readdirSync } = require('fs')
const { BaseRepository } = require('./base.cjs')
const { DEPARTMENTS_DIR } = require('../common/paths.cjs')

class DeptConfigRepository extends BaseRepository {
  /**
   * 读取部门配置
   * @param {string} deptId - 部门 ID
   * @returns {object|null} 配置对象，不存在返回 null
   */
  load(deptId) {
    const configPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
    return this.read(configPath)
  }

  /**
   * 保存部门配置（原子写入）
   * @param {string} deptId - 部门 ID
   * @param {object} config - 配置对象
   */
  save(deptId, config) {
    const configPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
    this.write(configPath, config)
  }

  /**
   * 原子更新部门配置：读取 → 修改 → 写回
   * @param {string} deptId - 部门 ID
   * @param {function} mutator - (currentConfig) => newConfig
   * @returns {object} 更新后的配置
   */
  updateConfig(deptId, mutator) {
    const configPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
    return this.update(configPath, mutator)
  }

  /**
   * 获取部门配置文件的绝对路径
   * @param {string} deptId - 部门 ID
   */
  configPath(deptId) {
    return join(DEPARTMENTS_DIR, deptId, 'config.json')
  }

  /**
   * 扫描 config/departments/ 返回所有部门 ID
   * @returns {string[]}
   */
  listDeptIds() {
    if (!existsSync(DEPARTMENTS_DIR)) return []
    return readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  }
}

/** 带缓存的单例，供 Autopilot 循环使用 */
const deptConfigRepo = new DeptConfigRepository({ cacheTtlMs: 30000 })
/** 无缓存实例，供 API 路由并发写入使用（避免读到过期数据） */
const deptConfigRepoNoCache = new DeptConfigRepository()

module.exports = { DeptConfigRepository, deptConfigRepo, deptConfigRepoNoCache }
