'use strict'
const { mkdirSync, existsSync, rmSync, renameSync } = require('fs')
const { join } = require('path')
const { ConfigRepository } = require('./config-repository.cjs')
const { AgentMetaRepository } = require('./agent-meta-repository.cjs')
const { validateAgentId } = require('./validators.cjs')

const PROJECT_ROOT = join(__dirname, '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')

class AgentService {
  constructor(configRepo, agentMetaRepo) {
    this._configRepo = configRepo || new ConfigRepository()
    this._agentMetaRepo = agentMetaRepo || new AgentMetaRepository()
  }

  /**
   * Delete Agent with workspace archival.
   * Replaces agents/route.ts DELETE handler core logic.
   */
  async deleteAgent(id) {
    // 1. Remove from openclaw.json
    this._configRepo.removeAgent(id)

    // 2. Delete agent directory
    const agentDir = join(AGENTS_DIR, id)
    if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true })

    // 3. Remove Gateway runtime state
    const stateDir = join(PROJECT_ROOT, '.openclaw-state', 'agents', id)
    if (existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true })

    // 4. Archive workspace
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
