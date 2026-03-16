// SYNC: keep in sync with ./quality-gate.ts
'use strict'

const GATE_STAGES = ['pending', 'self_checking', 'peer_reviewing', 'head_approving', 'done', 'failed']

const GATE_TRANSITIONS = {
  pending:        ['self_checking'],
  self_checking:  ['peer_reviewing', 'failed'],
  peer_reviewing: ['head_approving', 'failed'],
  head_approving: ['done', 'failed'],
  done:           [],
  failed:         [],
}

const GATE_TERMINAL = new Set(['done', 'failed'])

function canAdvanceGate(from, to) {
  const allowed = GATE_TRANSITIONS[from]
  return allowed ? allowed.includes(to) : false
}

function isGateDone(stage) {
  return GATE_TERMINAL.has(stage)
}

module.exports = {
  GATE_STAGES, GATE_TRANSITIONS, GATE_TERMINAL,
  canAdvanceGate, isGateDone,
}
