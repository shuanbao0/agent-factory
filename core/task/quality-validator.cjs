'use strict'
/**
 * QualityValidator — 质量验证引擎（合并 UI 与 autopilot 的验证逻辑）
 *
 * 设计模式：Strategy（可插拔 validators）
 *
 * 职责：
 * - 质量分数判定（minScore 阈值）
 * - 内置 validators（wordCount, similarity, endingKeywords, noEndingKeywords）
 * - 返工/升级决策（maxReworks 超限 → escalate）
 */

const { DEFAULT_GATE_CONFIG } = require('../../entity/task/quality-validator.cjs')

/**
 * Check quality gate for a completed task.
 *
 * @param {object} task - Task object with quality, type, output, reworkCount fields
 * @param {object} pipelineStep - Pipeline step with qualityGate config (or null)
 * @returns {{passed: boolean, errors: string[], shouldRework: boolean, escalate: boolean}}
 */
function checkQualityGate(task, pipelineStep) {
  const result = { passed: true, errors: [], shouldRework: false, escalate: false }

  if (!pipelineStep) return result

  const gateConfig = pipelineStep.qualityGate
  // Backward compat: no qualityGate config AND no quality data → pass through
  if (!gateConfig && !task.quality) return result

  const gate = {
    minScore: gateConfig?.minScore ?? DEFAULT_GATE_CONFIG.minScore,
    requireSelfCheck: gateConfig?.requireSelfCheck ?? DEFAULT_GATE_CONFIG.requireSelfCheck,
    requirePeerReview: gateConfig?.requirePeerReview ?? DEFAULT_GATE_CONFIG.requirePeerReview,
    maxReworks: gateConfig?.maxReworks ?? DEFAULT_GATE_CONFIG.maxReworks,
    validators: gateConfig?.validators ?? [],
    validatorConfig: gateConfig?.validatorConfig ?? {},
  }

  // If quality data was already populated by the async gate (processQualityGate),
  // trust its pass/fail verdict. headApproval.passed is ONLY set by the async gate.
  const asyncGatePopulated = task.quality?.headApproval?.passed === true

  // Check selfCheck
  if (gate.requireSelfCheck) {
    if (!task.quality?.selfCheck) {
      result.passed = false
      result.errors.push('Self-check not performed')
    } else if (!task.quality.selfCheck.passed) {
      result.passed = false
      result.errors.push(`Self-check failed (score: ${task.quality.selfCheck.score})`)
    } else if (!asyncGatePopulated && task.quality.selfCheck.score < gate.minScore) {
      result.passed = false
      result.errors.push(`Self-check score ${task.quality.selfCheck.score} below minimum ${gate.minScore}`)
    }
  }

  // Check peerReview
  if (gate.requirePeerReview) {
    if (!task.quality?.peerReview) {
      if (!asyncGatePopulated) {
        result.passed = false
        result.errors.push('Peer review not performed')
      }
    } else if (!task.quality.peerReview.passed) {
      result.passed = false
      result.errors.push('Peer review not passed')
    }
  }

  // Run validators
  for (const v of gate.validators) {
    const vConfig = gate.validatorConfig[v] ?? {}
    const vErrors = runValidator(v, task, vConfig)
    if (vErrors.length > 0) {
      result.passed = false
      result.errors.push(...vErrors)
    }
  }

  if (!result.passed) {
    const reworkCount = task.reworkCount ?? 0
    if (reworkCount >= gate.maxReworks) {
      result.escalate = true
    } else {
      result.shouldRework = true
    }
  }

  return result
}

/**
 * Run a built-in validator against task output.
 *
 * @param {string} name - Validator name
 * @param {object} task - Task object
 * @param {object} config - Validator-specific config
 * @returns {string[]} Array of error messages (empty = passed)
 */
function runValidator(name, task, config) {
  switch (name) {
    case 'wordCount': {
      const min = config.min ?? 500
      const len = task.output ? Buffer.byteLength(task.output, 'utf-8') : 0
      if (len < min) {
        return [`Output too short: ${len} bytes (min: ${min})`]
      }
      return []
    }
    case 'endingKeywords': {
      const keywords = config.keywords ?? ['全书完', '大结局', '（完）', 'THE END']
      if (!task.output) return ['No output to check for ending keywords']
      const found = keywords.some(kw => task.output.includes(kw))
      if (!found) {
        return [`Output missing ending keyword (expected one of: ${keywords.join(', ')})`]
      }
      return []
    }
    case 'noEndingKeywords': {
      const keywords = config.keywords ?? ['全书完', '大结局', '（完）', 'THE END', '完结', '终章']
      if (!task.output) return []
      const found = keywords.filter(kw => task.output.includes(kw))
      if (found.length > 0) {
        return [`Non-final chapter contains ending keywords: ${found.join(', ')}`]
      }
      return []
    }
    case 'similarity': {
      const maxRepeatRatio = config.maxRepeatRatio ?? 0.3
      const minBlockSize = config.minBlockSize ?? 100
      if (!task.output || task.output.length < minBlockSize * 2) return []
      const blocks = []
      for (let i = 0; i <= task.output.length - minBlockSize; i += minBlockSize) {
        blocks.push(task.output.slice(i, i + minBlockSize))
      }
      const unique = new Set(blocks)
      const repeatRatio = 1 - unique.size / blocks.length
      if (repeatRatio > maxRepeatRatio) {
        return [`Content repeat ratio ${(repeatRatio * 100).toFixed(0)}% exceeds max ${(maxRepeatRatio * 100).toFixed(0)}%`]
      }
      return []
    }
    default:
      return []
  }
}

/**
 * Create a pipeline follow-up task when a task completes and passes quality gate.
 *
 * @param {object} completedTask - The completed task
 * @param {object} pipelineStep - Pipeline step {from, to}
 * @param {Array} taskTypes - Array of {value, labelEn} from workflow
 * @returns {object|null} New pipeline task or null
 */
function createPipelineTask(completedTask, pipelineStep, taskTypes) {
  if (!completedTask.type || !completedTask.projectId || !pipelineStep) return null

  const toType = (taskTypes || []).find(tt => tt.value === pipelineStep.to)
  const label = toType ? toType.labelEn : pipelineStep.to

  const now = new Date().toISOString()
  return {
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: `${label}: ${completedTask.name}`,
    description: `Auto-created from pipeline: ${completedTask.type} -> ${pipelineStep.to}`,
    projectId: completedTask.projectId,
    status: 'pending',
    priority: completedTask.priority,
    assignees: completedTask.assignees?.length ? [...completedTask.assignees] : [],
    assignedAgent: completedTask.assignedAgent,
    creator: 'pipeline',
    progress: 0,
    dependencies: [completedTask.id],
    type: pipelineStep.to,
    parentTaskId: completedTask.parentTaskId,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Create a rework task from a failed quality gate.
 *
 * @param {object} task - Original task
 * @param {string[]} errors - Quality gate errors
 * @returns {object} Rework task
 */
function createReworkTask(task, errors) {
  const now = new Date().toISOString()
  return {
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: `[Rework] ${task.name}`,
    description: `Rework required:\n${errors.map(e => `- ${e}`).join('\n')}`,
    projectId: task.projectId ?? null,
    status: 'pending',
    priority: task.priority,
    assignees: [...(task.assignees || [])],
    assignedAgent: task.assignedAgent,
    creator: 'quality-gate',
    progress: 0,
    dependencies: [],
    type: task.type,
    parentTaskId: task.parentTaskId,
    reworkCount: (task.reworkCount ?? 0) + 1,
    reworkFromId: task.id,
    createdAt: now,
    updatedAt: now,
  }
}

module.exports = {
  DEFAULT_GATE_CONFIG,
  checkQualityGate,
  runValidator,
  createPipelineTask,
  createReworkTask,
}
