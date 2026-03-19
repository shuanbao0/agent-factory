'use strict'
/**
 * CompletionWorkflow — 任务完成时的质量门 + 流水线编排
 *
 * 纯业务逻辑：判定质量、决定 rework/escalate、生成后续任务。
 * 不涉及持久化（由调用者完成）。
 */
const { checkQualityGate, createPipelineTask, createReworkTask } = require('./quality-validator.cjs')

/**
 * Apply completion workflow to a task.
 *
 * @param {object} task - Current task
 * @param {object} updates - Updates being applied
 * @param {object|null} pipelineStep - Pipeline step config (from workflow)
 * @param {Array} [taskTypes] - Task type definitions
 * @returns {{ updates: object, reworkTask: object|null, pipelineTask: object|null, gate: object }}
 */
function applyCompletionWorkflow(task, updates, pipelineStep, taskTypes) {
  const merged = { ...task, ...updates }
  const gate = checkQualityGate(merged, pipelineStep)
  const result = { updates: { ...updates }, reworkTask: null, pipelineTask: null, gate }

  if (!gate.passed) {
    if (gate.escalate) {
      result.updates.status = 'failed'
      result.updates.validationErrors = [...gate.errors, 'Max reworks exceeded']
      return result
    }
    if (gate.shouldRework) {
      result.updates.status = 'rework'
      result.updates.reworkCount = (merged.reworkCount || 0) + 1
      result.updates.validationErrors = gate.errors
      delete result.updates.completedAt
      result.reworkTask = createReworkTask(merged, gate.errors)
      return result
    }
  }

  // Quality passed — check for pipeline follow-up
  const pipelineTask = createPipelineTask(merged, pipelineStep, taskTypes)
  if (pipelineTask) result.pipelineTask = pipelineTask

  return result
}

module.exports = { applyCompletionWorkflow }
