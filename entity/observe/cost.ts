/**
 * Cost tracking entity — pricing table and cost types.
 */

export const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':   { input: 3.0,  output: 15.0 },
  'claude-opus-4-6':     { input: 15.0, output: 75.0 },
  'claude-haiku-4-5':    { input: 0.80, output: 4.0 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
  'MiniMax-M2.5':        { input: 0.0,  output: 0.0 },
  'MiniMax-M2.1':        { input: 0.0,  output: 0.0 },
}

export interface CostEntry {
  date?: string
  source?: string
  cost?: number
  inputTokens?: number
  outputTokens?: number
  calls?: number
  model?: string
  [key: string]: unknown
}

export interface CostQueryResult {
  entries: CostEntry[]
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
}

export interface DailyCostSummary {
  date: string
  source: string
  cost: number
  inputTokens: number
  outputTokens: number
  calls: number
}
