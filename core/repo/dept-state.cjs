'use strict'
const { join } = require('path')
const { BaseRepository } = require('./base.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const DEPARTMENTS_DIR = join(PROJECT_ROOT, 'config', 'departments')

const DEFAULT_STATE = {
  status: 'stopped',
  pid: null,
  cycleCount: 0,
  lastCycleAt: null,
  lastCycleResult: null,
  history: [],
  tokensUsedToday: 0,
  budgetResetAt: null,
}

class DeptStateRepository extends BaseRepository {
  /** Load department state (replaces readers.cjs:loadDeptState) */
  load(deptId) {
    const statePath = join(DEPARTMENTS_DIR, deptId, 'state.json')
    return this.read(statePath) || { ...DEFAULT_STATE }
  }

  /** Save department state (replaces readers.cjs:saveDeptState) */
  save(deptId, state) {
    const statePath = join(DEPARTMENTS_DIR, deptId, 'state.json')
    this.write(statePath, state)
  }

  /** Atomic update */
  updateState(deptId, mutator) {
    const current = this.load(deptId)
    const updated = mutator(current)
    this.save(deptId, updated)
    return updated
  }
}

const deptStateRepo = new DeptStateRepository({ cacheTtlMs: 30000 })
module.exports = { DeptStateRepository, deptStateRepo }
