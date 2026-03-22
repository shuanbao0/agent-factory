'use strict'
/**
 * DeptRegistryRepository — 部门注册表（config/departments.json）的数据访问层
 *
 * 管理 UI 部门列表：名称、emoji、楼层颜色、家具
 */
const { BaseRepository } = require('./base.cjs')
const { DEPARTMENTS_FILE } = require('../common/paths.cjs')

const DEFAULT_DEPARTMENTS = []

class DeptRegistryRepository extends BaseRepository {
  /**
   * 读取所有部门注册数据
   * @returns {Array} 部门列表
   */
  readAll() {
    const data = this.read(DEPARTMENTS_FILE)
    if (!data) return [...DEFAULT_DEPARTMENTS]
    return data.departments || [...DEFAULT_DEPARTMENTS]
  }

  /**
   * 写入部门注册数据（原子写入）
   * @param {Array} departments - 部门列表
   */
  writeAll(departments) {
    this.write(DEPARTMENTS_FILE, { departments })
  }
}

const deptRegistryRepo = new DeptRegistryRepository()
module.exports = { DeptRegistryRepository, deptRegistryRepo, DEFAULT_DEPARTMENTS }
