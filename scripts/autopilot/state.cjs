/**
 * State — 薄 Facade，委托 core/common/autopilot-state
 */
const coreState = require('../../core/common/autopilot-state.cjs')

module.exports = {
  loadState: coreState.loadState,
  saveState: coreState.saveState,
  withStateLock: coreState.withStateLock,
  DEFAULT_STATE: coreState.DEFAULT_STATE,
}
