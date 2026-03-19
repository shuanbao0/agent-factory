// SYNC: keep in sync with ./dept.ts
'use strict'

const DEFAULT_DEPT_STATE = {
  status: 'stopped',
  pid: null,
  cycleCount: 0,
  lastCycleAt: null,
  lastCycleResult: null,
  history: [],
  tokensUsedToday: 0,
  budgetResetAt: null,
}

module.exports = { DEFAULT_DEPT_STATE }
