'use strict'
/**
 * AutopilotState — 全局 Autopilot 状态持久化
 *
 * 设计模式：Repository（原子写入）
 */
const { readFileSync, writeFileSync, renameSync, existsSync } = require('fs')
const { join, resolve } = require('path')

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const STATE_FILE = join(PROJECT_ROOT, 'config', 'autopilot-state.json')
const { DEFAULT_AUTOPILOT_STATE, DEFAULT_INTERVAL_SEC } = require('../../entity/autopilot/autopilot.cjs')
const DEFAULT_STATE = { ...DEFAULT_AUTOPILOT_STATE }

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    }
  } catch { /* skip */ }
  return { ...DEFAULT_STATE }
}

function saveState(state) {
  const tmpFile = STATE_FILE + '.tmp'
  try {
    writeFileSync(tmpFile, JSON.stringify(state, null, 2))
    renameSync(tmpFile, STATE_FILE)
  } catch {
    try { writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)) } catch { /* skip */ }
  }
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
