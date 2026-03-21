'use strict'
/**
 * DeptStateRepository — 部门运行状态的数据访问层
 *
 * 设计模式：Repository（继承 BaseRepository）
 *
 * 职责：
 * - 管理 config/departments/{deptId}/state.json
 * - 存储部门运行时状态：运行状态、PID、循环计数、Token 用量、预算重置时间等
 * - 文件不存在时返回默认状态（status: 'stopped'）
 *
 * 替代原 readers.cjs 中的 loadDeptState / saveDeptState 函数
 */
const { join } = require('path')
const { BaseRepository } = require('./base.cjs')
const { DEPARTMENTS_DIR } = require('../common/paths.cjs')

const { DEFAULT_DEPT_STATE } = require('../../entity/dept/dept.cjs')
/** 部门状态默认值（来自 entity/dept） */
const DEFAULT_STATE = { ...DEFAULT_DEPT_STATE }

class DeptStateRepository extends BaseRepository {
  /**
   * 读取部门状态
   * @param {string} deptId - 部门 ID
   * @returns {object} 状态对象（文件不存在时返回默认值）
   */
  load(deptId) {
    const statePath = join(DEPARTMENTS_DIR, deptId, 'state.json')
    return this.read(statePath) || { ...DEFAULT_STATE }
  }

  /**
   * 保存部门状态（原子写入）
   * @param {string} deptId - 部门 ID
   * @param {object} state - 状态对象
   */
  save(deptId, state) {
    const statePath = join(DEPARTMENTS_DIR, deptId, 'state.json')
    this.write(statePath, state)
  }

  /**
   * 原子更新部门状态：读取 → 修改 → 写回
   * @param {string} deptId - 部门 ID
   * @param {function} mutator - (currentState) => newState
   * @returns {object} 更新后的状态
   */
  updateState(deptId, mutator) {
    const current = this.load(deptId)
    const updated = mutator(current)
    this.save(deptId, updated)
    return updated
  }
}

/** 带缓存的单例（30 秒 TTL），供 Autopilot 循环使用 */
const deptStateRepo = new DeptStateRepository({ cacheTtlMs: 30000 })
module.exports = { DeptStateRepository, deptStateRepo }
