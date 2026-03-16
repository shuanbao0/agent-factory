'use strict'
const { join } = require('path')
const { BaseRepository } = require('./base-repository.cjs')

const PROJECT_ROOT = join(__dirname, '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')

class AgentMetaRepository extends BaseRepository {
  readMeta(agentId) {
    const metaPath = join(AGENTS_DIR, agentId, 'agent.json')
    return this.read(metaPath)
  }

  writeMeta(agentId, data) {
    const metaPath = join(AGENTS_DIR, agentId, 'agent.json')
    this.write(metaPath, data)
  }

  updateMeta(agentId, mutator) {
    const metaPath = join(AGENTS_DIR, agentId, 'agent.json')
    return this.update(metaPath, mutator, {})
  }
}

const agentMetaRepo = new AgentMetaRepository({ cacheTtlMs: 30000 })
module.exports = { AgentMetaRepository, agentMetaRepo }
