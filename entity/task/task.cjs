// SYNC: keep in sync with ./task.ts
'use strict'

const STATUSES = ['pending', 'assigned', 'in_progress', 'review', 'completed', 'failed', 'rework']

const TRANSITIONS = {
  pending:     ['assigned', 'in_progress', 'completed', 'failed'],
  assigned:    ['in_progress', 'completed', 'failed'],
  in_progress: ['review', 'completed', 'rework', 'failed'],
  review:      ['completed', 'rework', 'in_progress', 'failed'],
  rework:      ['in_progress', 'review', 'completed', 'failed'],
  completed:   [],
  failed:      ['completed'],
}

const TERMINAL = new Set(['completed', 'failed'])

function canTransition(from, to) {
  const allowed = TRANSITIONS[from]
  if (!allowed) return false
  return allowed.includes(to)
}

function getValidTransitions(from) {
  return TRANSITIONS[from] || []
}

function isTerminal(status) {
  return TERMINAL.has(status)
}

function isValidStatus(status) {
  return STATUSES.includes(status)
}

function normalizeStatus(status) {
  if (status === 'running') return 'in_progress'
  return status
}

module.exports = {
  STATUSES, TRANSITIONS, TERMINAL,
  canTransition, getValidTransitions, isTerminal, isValidStatus, normalizeStatus,
}
