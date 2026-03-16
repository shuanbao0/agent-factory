'use strict'

const STATUSES = ['pending', 'assigned', 'in_progress', 'review', 'completed', 'failed', 'rework']

const TRANSITIONS = {
  pending:     ['assigned', 'in_progress', 'completed', 'failed'],
  assigned:    ['in_progress', 'completed', 'failed'],
  in_progress: ['review', 'completed', 'rework', 'failed'],
  review:      ['completed', 'rework', 'in_progress', 'failed'],
  rework:      ['in_progress', 'review', 'completed', 'failed'],
  completed:   [],
  failed:      [],
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

/** Normalize non-standard statuses (e.g. 'running' → 'in_progress') */
function normalizeStatus(status) {
  if (status === 'running') return 'in_progress'
  return status
}

/**
 * Execute a state transition.
 * @param {object} task - Task object (will be mutated)
 * @param {string} to - Target status
 * @param {object} context - { actor, reason, extras?, recordHistory? }
 * @returns {{ ok: boolean, task?, error?, reason? }}
 */
function transition(task, to, context = {}) {
  const from = task.status
  if (!canTransition(from, to)) {
    return {
      ok: false,
      error: `Invalid transition: ${from} → ${to}`,
      reason: `Allowed: ${getValidTransitions(from).join(', ') || 'none (terminal)'}`,
    }
  }

  task.status = to
  task.updatedAt = new Date().toISOString()

  if (to === 'completed') task.completedAt = new Date().toISOString()
  if (context.extras) Object.assign(task, context.extras)

  if (context.recordHistory) {
    if (!task._transitions) task._transitions = []
    task._transitions.push({
      from, to,
      actor: context.actor || 'system',
      reason: context.reason || '',
      at: task.updatedAt,
    })
  }

  return { ok: true, task }
}

module.exports = {
  STATUSES, TRANSITIONS, TERMINAL,
  canTransition, getValidTransitions, isTerminal, isValidStatus,
  normalizeStatus, transition,
}
