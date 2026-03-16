// SYNC: keep in sync with ./budget.ts
'use strict'

const DEFAULT_BUDGET = {
  company: { dailyTokenLimit: 5000000, monthlyTokenLimit: 100000000, alertThreshold: 0.8 },
  overBudgetAction: 'pause_and_notify',
}

module.exports = { DEFAULT_BUDGET }
