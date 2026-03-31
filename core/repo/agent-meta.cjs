'use strict'
/**
 * AgentMetaRepository — Agent 元数据的数据访问层
 *
 * 设计模式：Repository（DB 读 + 文件双写）
 *
 * 职责：
 * - 元数据读取走 DB agents 表（索引查询）
 * - 写入双写到 DB + agents/{agentId}/agent.json（Gateway 兼容）
 * - 提供 agent 目录下文件的读写、追加、目录管理（不变）
 */
const { join } = require('path')
const { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, statSync, rmSync } = require('fs')
const { BaseRepository } = require('./base.cjs')
const { AGENTS_DIR } = require('../common/paths.cjs')
const logger = require('../common/logger.cjs')

// Lazy DB requires
let _upsertAgent, _findAgentById, _findAllAgents, _findAgentsByDept, _listAgentIds, _deleteAgentFromDb, _clearDeptInDb
function db() {
  if (!_upsertAgent) {
    const q = require('../db/queries/agent-queries.cjs')
    _upsertAgent = q.upsertAgent
    _findAgentById = q.findAgentById
    _findAllAgents = q.findAllAgents
    _findAgentsByDept = q.findAgentsByDepartment
    _listAgentIds = q.listAgentIds
    _deleteAgentFromDb = q.deleteAgentFromDb
    _clearDeptInDb = q.clearDepartmentInDb
  }
}

class AgentMetaRepository extends BaseRepository {
  /** 读取 Agent 元数据（DB 读） */
  readMeta(agentId) {
    try {
      db()
      const agent = _findAgentById(agentId)
      if (agent) return agent
    } catch (err) {
      logger.debug('agent-meta-repo', 'DB read failed, falling back to file', { agentId, error: err.message })
    }
    // Fallback to file (backfill 未跑时)
    const metaPath = join(AGENTS_DIR, agentId, 'agent.json')
    return this.read(metaPath)
  }

  /** 写入 Agent 元数据（DB + 文件双写） */
  writeMeta(agentId, data) {
    // DB 写入
    try {
      db()
      _upsertAgent({ ...data, id: agentId })
    } catch (err) {
      logger.debug('agent-meta-repo', 'DB write failed', { agentId, error: err.message })
    }
    // 文件写入（Gateway 兼容）
    const metaPath = join(AGENTS_DIR, agentId, 'agent.json')
    this.write(metaPath, data)
  }

  /** 原子更新 Agent 元数据 */
  updateMeta(agentId, mutator) {
    const current = this.readMeta(agentId) || {}
    const updated = mutator(current)
    this.writeMeta(agentId, updated)
    return updated
  }

  /** 列出所有 Agent ID（DB 查询） */
  listAllAgentIds() {
    try {
      db()
      const ids = _listAgentIds()
      if (ids.length > 0) return ids
    } catch (err) {
      logger.debug('agent-meta-repo', 'DB listAgentIds failed, falling back to dir scan', { error: err.message })
    }
    // Fallback
    if (!existsSync(AGENTS_DIR)) return []
    return readdirSync(AGENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  }

  /** 检查 agent 是否存在 */
  exists(agentId) {
    try {
      db()
      if (_findAgentById(agentId)) return true
    } catch { /* fallback */ }
    return existsSync(join(AGENTS_DIR, agentId, 'agent.json'))
  }

  // ── 文件操作方法（不变，Gateway 需要直接读这些文件）──────────

  readAgentFile(agentId, filename) {
    const filePath = join(AGENTS_DIR, agentId, filename)
    try {
      if (existsSync(filePath)) return readFileSync(filePath, 'utf-8')
    } catch (err) {
      logger.debug('agent-meta-repo', 'failed to read agent file', { agentId, filename, error: err.message })
    }
    return null
  }

  writeAgentFile(agentId, filename, content) {
    const filePath = join(AGENTS_DIR, agentId, filename)
    const dir = join(filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, content)
  }

  ensureAgentDir(agentId, subpath) {
    const dir = subpath ? join(AGENTS_DIR, agentId, subpath) : join(AGENTS_DIR, agentId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  appendAgentFile(agentId, filename, content) {
    const filePath = join(AGENTS_DIR, agentId, filename)
    const dir = join(filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(filePath, content)
  }

  agentFileExists(agentId, filename) {
    return existsSync(join(AGENTS_DIR, agentId, filename))
  }

  agentFileStat(agentId, filename) {
    const filePath = join(AGENTS_DIR, agentId, filename)
    try {
      if (!existsSync(filePath)) return null
      const st = statSync(filePath)
      return { size: st.size, mtimeMs: st.mtimeMs }
    } catch (err) {
      logger.debug('agent-meta-repo', 'failed to stat agent file', { agentId, filename, error: err.message })
      return null
    }
  }

  listAgentDir(agentId, subpath) {
    const dir = subpath ? join(AGENTS_DIR, agentId, subpath) : join(AGENTS_DIR, agentId)
    if (!existsSync(dir)) return []
    try {
      return readdirSync(dir, { withFileTypes: true }).map(entry => {
        let mtime = 0
        try { mtime = statSync(join(dir, entry.name)).mtimeMs } catch { /* skip */ }
        return { name: entry.name, isFile: entry.isFile(), mtime }
      })
    } catch (err) {
      logger.debug('agent-meta-repo', 'failed to list agent dir', { agentId, subpath, error: err.message })
      return []
    }
  }

  deleteAgentDir(agentId) {
    // DB 删除
    try { db(); _deleteAgentFromDb(agentId) } catch { /* ok */ }
    // 文件删除
    const agentDir = join(AGENTS_DIR, agentId)
    if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true })
  }

  /** 返回指定部门的所有 agent ID（DB 索引查询） */
  listAgentsByDepartment(deptId) {
    try {
      db()
      return _findAgentsByDept(deptId).map(a => a.id)
    } catch (err) {
      logger.debug('agent-meta-repo', 'DB listByDept failed, falling back', { error: err.message })
    }
    // Fallback
    const ids = this.listAllAgentIds()
    const result = []
    for (const id of ids) {
      const meta = this.readMeta(id)
      if (meta && meta.department === deptId) result.push(id)
    }
    return result
  }

  /** 清除所有属于该部门的 agent 的 department 字段 */
  clearDepartment(deptId) {
    // DB 批量清除
    try { db(); _clearDeptInDb(deptId) } catch { /* ok */ }
    // 文件逐个更新
    const ids = this.listAgentsByDepartment(deptId)
    for (const id of ids) {
      try {
        const metaPath = join(AGENTS_DIR, id, 'agent.json')
        const meta = this.read(metaPath)
        if (meta) { delete meta.department; this.write(metaPath, meta) }
      } catch { /* skip */ }
    }
    return ids.length
  }
}

const agentMetaRepo = new AgentMetaRepository({ cacheTtlMs: 0 })
module.exports = { AgentMetaRepository, agentMetaRepo }
