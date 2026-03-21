'use strict'
/**
 * AutopilotState — 全局 Autopilot 状态持久化
 *
 * 设计模式：Repository（原子写入，委托 BaseRepository）
 */
const { BaseRepository } = require('../repo/base.cjs')
const { STATE_FILE } = require('./paths.cjs')
const { DEFAULT_AUTOPILOT_STATE } = require('../../entity/autopilot/autopilot.cjs')
const logger = require('./logger.cjs')
const DEFAULT_STATE = { ...DEFAULT_AUTOPILOT_STATE }

const _repo = new BaseRepository({ cacheTtlMs: 0 })

function loadState() {
  return _repo.read(STATE_FILE) || { ...DEFAULT_STATE }
}

function saveState(state) {
  _repo.write(STATE_FILE, state)
  logger.debug('autopilot-state', 'State saved', { status: state.status, cycleCount: state.cycleCount })
}

async function withStateLock(fn) {
  const state = loadState()
  if (state._locked) return null
  state._locked = true
  saveState(state)
  try {
    const result = await fn(state)
    delete state._locked
    saveState(state)
    return result
  } catch (err) {
    delete state._locked
    saveState(state)
    throw err
  }
}

module.exports = { loadState, saveState, withStateLock, DEFAULT_STATE }
