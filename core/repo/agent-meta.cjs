'use strict'
/**
 * AgentMetaRepository — Agent 元数据（agent.json）的数据访问层
 *
 * 设计模式：Repository（继承 BaseRepository）
 *
 * 职责：
 * - 管理 agents/{agentId}/agent.json
 * - 存储 Agent 的核心元信息：名称、模型、部门、模板来源等
 *
 * 带 30 秒缓存的单例，供 Autopilot 循环高频读取
 */
const { join } = require('path')
const { BaseRepository } = require('./base.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')

class AgentMetaRepository extends BaseRepository {
  /**
   * 读取 Agent 元数据
   * @param {string} agentId - Agent ID
   * @returns {object|null} agent.json 内容，不存在返回 null
   */
  readMeta(agentId) {
    const metaPath = join(AGENTS_DIR, agentId, 'agent.json')
    return this.read(metaPath)
  }

  /**
   * 写入 Agent 元数据（原子写入）
   * @param {string} agentId - Agent ID
   * @param {object} data - 元数据对象
   */
  writeMeta(agentId, data) {
    const metaPath = join(AGENTS_DIR, agentId, 'agent.json')
    this.write(metaPath, data)
  }

  /**
   * 原子更新 Agent 元数据
   * @param {string} agentId - Agent ID
   * @param {function} mutator - (currentData) => newData
   * @returns {object} 更新后的数据
   */
  updateMeta(agentId, mutator) {
    const metaPath = join(AGENTS_DIR, agentId, 'agent.json')
    return this.update(metaPath, mutator, {})
  }
}

/** 带缓存的单例（30 秒 TTL），供 Autopilot 循环使用 */
const agentMetaRepo = new AgentMetaRepository({ cacheTtlMs: 30000 })
module.exports = { AgentMetaRepository, agentMetaRepo }
