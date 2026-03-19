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
const { existsSync, readdirSync, writeFileSync, mkdirSync } = require('fs')
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

  /**
   * 扫描 agents/ 目录返回所有 Agent ID
   * @returns {string[]}
   */
  listAllAgentIds() {
    if (!existsSync(AGENTS_DIR)) return []
    return readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  }

  /**
   * 检查 agent.json 是否存在
   * @param {string} agentId
   * @returns {boolean}
   */
  exists(agentId) {
    return existsSync(join(AGENTS_DIR, agentId, 'agent.json'))
  }

  /**
   * 写入非 JSON 文件到 agents/{agentId}/{filename}
   * @param {string} agentId
   * @param {string} filename
   * @param {string} content
   */
  writeAgentFile(agentId, filename, content) {
    const dir = join(AGENTS_DIR, agentId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, filename), content)
  }

  /**
   * 返回指定部门的所有 agent ID
   * @param {string} deptId
   * @returns {string[]}
   */
  listAgentsByDepartment(deptId) {
    const ids = this.listAllAgentIds()
    const result = []
    for (const id of ids) {
      const meta = this.readMeta(id)
      if (meta && meta.department === deptId) result.push(id)
    }
    return result
  }

  /**
   * 清除所有属于该部门的 agent 的 department 字段
   * @param {string} deptId
   * @returns {number} 被清除的 agent 数量
   */
  clearDepartment(deptId) {
    const ids = this.listAgentsByDepartment(deptId)
    for (const id of ids) {
      this.updateMeta(id, meta => {
        delete meta.department
        return meta
      })
    }
    return ids.length
  }
}

/** 带缓存的单例（30 秒 TTL），供 Autopilot 循环使用 */
const agentMetaRepo = new AgentMetaRepository({ cacheTtlMs: 30000 })
module.exports = { AgentMetaRepository, agentMetaRepo }
