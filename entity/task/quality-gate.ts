/**
 * Quality gate stages, transitions, and predicates.
 * Single source of truth for quality gate lifecycle constants.
 */

export const GATE_STAGES = ['pending', 'self_checking', 'peer_reviewing', 'head_approving', 'done', 'failed'] as const
export type GateStage = typeof GATE_STAGES[number]

export const GATE_TRANSITIONS: Record<GateStage, readonly GateStage[]> = {
  pending:        ['self_checking'],
  self_checking:  ['peer_reviewing', 'failed'],
  peer_reviewing: ['head_approving', 'failed'],
  head_approving: ['done', 'failed'],
  done:           [],
  failed:         [],
}

export const GATE_TERMINAL: ReadonlySet<GateStage> = new Set(['done', 'failed'] as const)

export function canAdvanceGate(from: string, to: string): boolean {
  const allowed = GATE_TRANSITIONS[from as GateStage]
  return allowed ? allowed.includes(to as GateStage) : false
}

export function isGateDone(stage: string): boolean {
  return GATE_TERMINAL.has(stage as GateStage)
}
