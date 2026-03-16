'use strict'
/**
 * AgentService — Agent 生命周期管理服务
 *
 * 设计模式：Facade（门面模式）
 *
 * 职责：
 * - 封装 Agent 删除的完整流程（配置注销 → 目录清理 → 工作空间归档）
 * - 协调 ConfigRepository 和 AgentMetaRepository 完成多步操作
 *
 * 删除流程：
 *   1. 从 openclaw.json 中移除 Agent 注册
 *   2. 删除 agents/{id}/ 目录（核心定义）
 *   3. 删除 .openclaw-state/agents/{id}/ 目录（Gateway 运行时状态）
 *   4. 将 workspaces/{id}/ 归档到 workspaces/.archived/{id}_{timestamp}/
 */
const { mkdirSync, existsSync, rmSync, renameSync } = require('fs')
const { join } = require('path')
const { ConfigRepository } = require('../repo/config.cjs')
const { AgentMetaRepository } = require('../repo/agent-meta.cjs')
const { validateAgentId } = require('./validators.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')

class AgentService {
  /**
   * @param {ConfigRepository} [configRepo] - 配置仓库实例（可注入，便于测试）
   * @param {AgentMetaRepository} [agentMetaRepo] - Agent 元数据仓库实例
   */
  constructor(configRepo, agentMetaRepo) {
    this._configRepo = configRepo || new ConfigRepository()
    this._agentMetaRepo = agentMetaRepo || new AgentMetaRepository()
  }

  /**
   * 删除 Agent 并归档工作空间
   *
   * @param {string} id - Agent ID
   * @returns {Promise<{ ok: boolean, archivedTo: string|null }>}
   *   archivedTo — 工作空间归档路径（如果有的话），否则为 null
   */
  async deleteAgent(id) {
    // 1. 从 openclaw.json 中注销
    this._configRepo.removeAgent(id)

    // 2. 删除 Agent 定义目录
    const agentDir = join(AGENTS_DIR, id)
    if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true })

    // 3. 删除 Gateway 运行时状态
    const stateDir = join(PROJECT_ROOT, '.openclaw-state', 'agents', id)
    if (existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true })

    // 4. 归档工作空间（重命名到 .archived/ 目录，保留产出数据）
    let archivedTo = null
    const wsDir = join(WORKSPACES_DIR, id)
    if (existsSync(wsDir)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const archiveDir = join(WORKSPACES_DIR, '.archived')
      mkdirSync(archiveDir, { recursive: true })
      const archivePath = join(archiveDir, `${id}_${timestamp}`)
      renameSync(wsDir, archivePath)
      archivedTo = `workspaces/.archived/${id}_${timestamp}`
    }

    return { ok: true, archivedTo }
  }
}

module.exports = { AgentService }
