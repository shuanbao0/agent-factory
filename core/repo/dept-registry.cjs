'use strict'
/**
 * DeptRegistryRepository — 部门注册表（config/departments.json）的数据访问层
 *
 * 管理 UI 部门列表：名称、emoji、楼层颜色、家具
 */
const { join } = require('path')
const { BaseRepository } = require('./base.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const DEPARTMENTS_FILE = join(PROJECT_ROOT, 'config', 'departments.json')

const DEFAULT_DEPARTMENTS = [
  {
    id: 'dev',
    name: '软件开发部',
    nameEn: 'Software Development',
    emoji: '💻',
    order: 0,
    floorColor: { h: 35, s: 30, b: 15, c: 0 },
    furniture: [
      { type: 'desk', count: 4 },
      { type: 'bookshelf', count: 1 },
      { type: 'plant', count: 2 },
      { type: 'whiteboard', count: 1 },
      { type: 'cooler', count: 1 },
    ],
  },
  {
    id: 'novel',
    name: '网文创作部',
    nameEn: 'Novel Writing',
    emoji: '📚',
    order: 1,
    floorColor: { h: 25, s: 45, b: 5, c: 10 },
    furniture: [
      { type: 'desk', count: 4 },
      { type: 'bookshelf', count: 2 },
      { type: 'plant', count: 1 },
      { type: 'lamp', count: 2 },
      { type: 'meeting_table', count: 1 },
    ],
  },
]

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
