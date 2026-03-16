// SYNC: keep in sync with ./autopilot.ts
'use strict'

const DEFAULT_INTERVAL_SEC = 1800

const DEFAULT_AUTOPILOT_STATE = {
  status: 'stopped',
  pid: null,
  cycleCount: 0,
  lastCycleAt: null,
  lastCycleResult: null,
  intervalSeconds: DEFAULT_INTERVAL_SEC,
  history: [],
}

module.exports = { DEFAULT_AUTOPILOT_STATE, DEFAULT_INTERVAL_SEC }
