/**
 * Budget entity — company budget types and defaults.
 */

export const DEFAULT_BUDGET = {
  company: { dailyTokenLimit: 5000000, monthlyTokenLimit: 100000000, alertThreshold: 0.8 },
  overBudgetAction: 'pause_and_notify' as const,
}

export interface CompanyBudget {
  dailyTokenLimit?: number
  alertThreshold?: number
  [key: string]: unknown
}

export interface BudgetSummary {
  company: {
    dailyLimit: number
    used: number
    ratio: number
  }
  departments: Record<string, {
    limit: number
    used: number
    ratio: number
  }>
}
