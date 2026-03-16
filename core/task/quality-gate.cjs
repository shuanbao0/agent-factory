'use strict'

/**
 * Quality Gate State Machine — tracks review progress across cycles.
 *
 * Stages: pending → self_checking → peer_reviewing → head_approving → done/failed
 *
 * Each stage runs one sendToAgent() call per cycle instead of blocking
 * all three sequentially (which could take up to 3×60s = 3min per task).
 */

const STAGES = ['pending', 'self_checking', 'peer_reviewing', 'head_approving', 'done', 'failed']
const TERMINAL = new Set(['done', 'failed'])

const TRANSITIONS = {
  pending:        ['self_checking'],
  self_checking:  ['peer_reviewing', 'failed'],
  peer_reviewing: ['head_approving', 'failed'],
  head_approving: ['done', 'failed'],
  done:           [],
  failed:         [],
}

/**
 * Check if a gate stage transition is valid.
 */
function canAdvance(from, to) {
  const allowed = TRANSITIONS[from]
  return allowed ? allowed.includes(to) : false
}

/**
 * Check if gate stage is terminal.
 */
function isGateDone(stage) {
  return TERMINAL.has(stage)
}

/**
 * Get or initialize the quality gate state on a task.
 *
 * @param {object} task - Task object
 * @returns {{ stage: string, selfCheck?: object, peerReview?: object, headApproval?: object, startedAt?: string }}
 */
function getGateState(task) {
  if (!task.qualityGate || typeof task.qualityGate !== 'object') {
    return { stage: 'pending' }
  }
  return task.qualityGate
}

/**
 * Initialize or reset quality gate on a task.
 *
 * @param {object} task - Task object (mutated)
 * @returns {object} The gate state
 */
function initGate(task) {
  task.qualityGate = {
    stage: 'pending',
    startedAt: new Date().toISOString(),
  }
  // Clear legacy quality field
  task.quality = {}
  return task.qualityGate
}

/**
 * Advance gate to next stage with result.
 *
 * @param {object} task - Task object (mutated)
 * @param {string} nextStage - Target stage
 * @param {object} [result] - Stage result data
 * @returns {{ ok: boolean, error?: string }}
 */
function advanceGate(task, nextStage, result) {
  const gate = getGateState(task)
  if (!canAdvance(gate.stage, nextStage)) {
    return { ok: false, error: `Invalid gate transition: ${gate.stage} → ${nextStage}` }
  }

  const prevStage = gate.stage
  gate.stage = nextStage

  // Store result under the appropriate key
  if (prevStage === 'self_checking' && result) {
    gate.selfCheck = result
    // Also populate legacy quality field for backward compat
    if (!task.quality) task.quality = {}
    task.quality.selfCheck = result
  } else if (prevStage === 'peer_reviewing' && result) {
    gate.peerReview = result
    if (!task.quality) task.quality = {}
    task.quality.peerReview = result
  } else if (prevStage === 'head_approving' && result) {
    gate.headApproval = result
    if (!task.quality) task.quality = {}
    task.quality.headApproval = result
  }

  gate.updatedAt = new Date().toISOString()
  task.qualityGate = gate
  return { ok: true }
}

/**
 * Get which stage should be processed next for a task.
 * Returns null if gate is done/failed or not started.
 *
 * @param {object} task
 * @returns {string|null} The current stage to process, or null
 */
function nextAction(task) {
  const gate = getGateState(task)
  if (isGateDone(gate.stage)) return null
  if (gate.stage === 'pending') return 'self_checking'
  return gate.stage
}

module.exports = {
  STAGES, TERMINAL, TRANSITIONS,
  canAdvance, isGateDone, getGateState, initGate, advanceGate, nextAction,
}
