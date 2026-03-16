'use strict'
/**
 * ConfigRepository — OpenClaw Gateway 配置文件（openclaw.json）的数据访问层
 *
 * 设计模式：Repository + Facade
 *
 * 职责：
 * - 读写 config/openclaw.json（Gateway 核心配置）
 * - 提取 Gateway 连接信息（端口 + Token），支持环境变量覆盖
 * - Agent 的注册（addAgent）和注销（removeAgent）
 *
 * 导出单例 configRepo（30 秒缓存），供 Autopilot 循环使用
 */
const { join } = require('path')
const { BaseRepository } = require('./base.cjs')

/** 项目根目录（core/repo/ 往上两级） */
const PROJECT_ROOT = join(__dirname, '..', '..')
/** openclaw.json 配置文件路径 */
const OPENCLAW_CONFIG = join(PROJECT_ROOT, 'config', 'openclaw.json')

class ConfigRepository extends BaseRepository {
  constructor(opts) {
    super(opts)
    this._configPath = OPENCLAW_CONFIG
  }

  /** 读取完整配置对象 */
  getConfig() {
    return this.read(this._configPath) || {}
  }

  /**
   * 原子更新配置
   * @param {function} mutator - (config) => config 修改函数
   */
  updateConfig(mutator) {
    return this.update(this._configPath, mutator, {})
  }

  /**
   * 获取 Gateway 连接信息（端口 + Token）
   *
   * 优先级：环境变量 > openclaw.json > 默认值
   * - 端口默认 19100
   * - Token 默认空字符串（本地开发无需认证）
   */
  getGatewayConfig() {
    const envPort = parseInt(process.env.AGENT_FACTORY_PORT || '0')
    const envToken = process.env.AGENT_FACTORY_TOKEN || ''
    const cfg = this.getConfig()
    return {
      port: envPort || cfg.gateway?.port || 19100,
      token: envToken || cfg.gateway?.auth?.token || '',
    }
  }

  /**
   * 注册 Agent 到配置文件
   *
   * 如果 Agent 已存在则合并更新，不存在则追加
   * 同时确保 agentToAgent 工具配置存在（Agent 间通信需要）
   *
   * @param {string} agentId - Agent 标识
   * @param {string} workspaceDir - Agent 定义目录（agents/{id}/）
   * @param {string} [model] - 主模型 ID（可选）
   */
  addAgent(agentId, workspaceDir, model) {
    this.updateConfig(config => {
      if (!config.agents) config.agents = {}
      if (!config.agents.list) config.agents.list = []
      if (!config.tools) config.tools = {}
      if (!config.tools.agentToAgent) config.tools.agentToAgent = { enabled: true, allow: ['*'] }

      const list = config.agents.list
      const entry = { id: agentId, workspace: workspaceDir }
      if (model) entry.model = { primary: model }
      entry.subagents = { allowAgents: [agentId] }

      // 已存在则合并，不存在则追加
      const idx = list.findIndex(a => a.id === agentId)
      if (idx >= 0) list[idx] = { ...list[idx], ...entry }
      else list.push(entry)

      return config
    })
  }

  /**
   * 从配置文件中注销 Agent
   *
   * @param {string} agentId - 要移除的 Agent 标识
   */
  removeAgent(agentId) {
    this.updateConfig(config => {
      if (config.agents?.list) {
        config.agents.list = config.agents.list.filter(a => a.id !== agentId)
      }
      return config
    })
  }
}

/** 带缓存的单例（30 秒 TTL），供 Autopilot 循环高频读取 */
const configRepo = new ConfigRepository({ cacheTtlMs: 30000 })

module.exports = { ConfigRepository, configRepo }
