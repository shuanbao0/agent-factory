'use strict'
const { join } = require('path')
const { BaseRepository } = require('./base.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const DEPARTMENTS_DIR = join(PROJECT_ROOT, 'config', 'departments')

class DeptConfigRepository extends BaseRepository {
  /** Read department config */
  load(deptId) {
    const configPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
    return this.read(configPath)
  }

  /** Write department config (atomic) */
  save(deptId, config) {
    const configPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
    this.write(configPath, config)
  }

  /** Atomic read-mutate-write for department config */
  updateConfig(deptId, mutator) {
    const configPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
    return this.update(configPath, mutator)
  }

  /** Get config path for a department */
  configPath(deptId) {
    return join(DEPARTMENTS_DIR, deptId, 'config.json')
  }
}

const deptConfigRepo = new DeptConfigRepository({ cacheTtlMs: 30000 })
// No-cache instance for API routes (concurrent writes need fresh reads)
const deptConfigRepoNoCache = new DeptConfigRepository()

module.exports = { DeptConfigRepository, deptConfigRepo, deptConfigRepoNoCache }
