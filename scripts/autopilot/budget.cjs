/**
 * Budget — 薄 Facade，委托 core/observe/budget
 */
const coreBudget = require('../../core/observe/budget.cjs')

module.exports = {
  checkBudget: coreBudget.checkBudget,
  trackTokenUsage: coreBudget.trackTokenUsage,
  loadCompanyBudget: coreBudget.loadCompanyBudget,
  getBudgetSummary: coreBudget.getBudgetSummary,
  shouldResetDaily: coreBudget.shouldResetDaily,
}
