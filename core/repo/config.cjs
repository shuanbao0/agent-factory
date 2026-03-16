'use strict'
const { join } = require('path')
const { BaseRepository } = require('./base.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const OPENCLAW_CONFIG = join(PROJECT_ROOT, 'config', 'openclaw.json')

class ConfigRepository extends BaseRepository {
  constructor(opts) {
    super(opts)
    this._configPath = OPENCLAW_CONFIG
  }

  /** Read full config */
  getConfig() {
    return this.read(this._configPath) || {}
  }

  /** Atomic update config */
  updateConfig(mutator) {
    return this.update(this._configPath, mutator, {})
  }

  /**
   * Extract gateway connection info (port + token).
   * Replaces gateway.cjs:getGatewayConfig()
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
   * Add/update agent in config.
   * Replaces agents/route.ts addToOpenclawConfig()
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

      const idx = list.findIndex(a => a.id === agentId)
      if (idx >= 0) list[idx] = { ...list[idx], ...entry }
      else list.push(entry)

      return config
    })
  }

  /**
   * Remove agent from config.
   * Replaces agents/route.ts removeFromOpenclawConfig()
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

// Singleton with cache for autopilot use
const configRepo = new ConfigRepository({ cacheTtlMs: 30000 })

module.exports = { ConfigRepository, configRepo }
