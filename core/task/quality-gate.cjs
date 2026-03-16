'use strict'
/**
 * QualityGateMachine — 质量门状态机（3 阶段评审流程）
 *
 * 设计模式：State Machine（显式阶段转换表）
 *
 * 职责：
 * - 管理任务的三阶段质量评审流程
 * - 每个阶段在单独的 Autopilot 循环中执行（非阻塞），避免 3×60s 串行等待
 * - 存储各阶段评审结果（分数、是否通过、评审意见）
 *
 * 阶段流转图：
 *   pending → self_checking → peer_reviewing → head_approving → done
 *               ↘                ↘                ↘
 *              failed           failed           failed
 *
 * 各阶段说明：
 * - self_checking   — Agent 自检：评估自己产出的质量
 * - peer_reviewing  — 同行评审：其他 Agent 评估产出质量
 * - head_approving  — 主管审批：部门主管最终签字
 */

// Constants and predicates from entity/ (single source of truth)
const {
  GATE_STAGES, GATE_TRANSITIONS, GATE_TERMINAL,
  canAdvanceGate, isGateDone,
} = require('../../entity/task/quality-gate.cjs')

// Re-export with original names for backward compatibility
const STAGES = GATE_STAGES
const TRANSITIONS = GATE_TRANSITIONS
const TERMINAL = GATE_TERMINAL
const canAdvance = canAdvanceGate

/**
 * 从任务对象中获取质量门状态
 *
 * 如果任务没有 qualityGate 字段，返回 { stage: 'pending' }
 *
 * @param {object} task - 任务对象
 * @returns {{ stage: string, selfCheck?: object, peerReview?: object, headApproval?: object, startedAt?: string }}
 */
function getGateState(task) {
  if (!task.qualityGate || typeof task.qualityGate !== 'object') {
    return { stage: 'pending' }
  }
  return task.qualityGate
}

/**
 * 初始化或重置任务的质量门状态
 *
 * 会清除旧的 quality 字段（兼容旧版）
 *
 * @param {object} task - 任务对象（会被修改）
 * @returns {object} 初始化后的质量门状态
 */
function initGate(task) {
  task.qualityGate = {
    stage: 'pending',
    startedAt: new Date().toISOString(),
  }
  // 清除旧版 quality 字段
  task.quality = {}
  return task.qualityGate
}

/**
 * 推进质量门到下一阶段，并存储上一阶段的评审结果
 *
 * @param {object} task - 任务对象（会被修改）
 * @param {string} nextStage - 目标阶段
 * @param {object} [result] - 上一阶段的评审结果（score, passed, issues 等）
 * @returns {{ ok: boolean, error?: string }}
 */
function advanceGate(task, nextStage, result) {
  const gate = getGateState(task)
  if (!canAdvance(gate.stage, nextStage)) {
    return { ok: false, error: `Invalid gate transition: ${gate.stage} → ${nextStage}` }
  }

  const prevStage = gate.stage
  gate.stage = nextStage

  // 将评审结果存储到对应字段，同时写入旧版 quality 字段（向后兼容）
  if (prevStage === 'self_checking' && result) {
    gate.selfCheck = result
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
 * 获取任务下一步应执行的质量门阶段
 *
 * - pending → 返回 'self_checking'（开始自检）
 * - 进行中的阶段 → 返回当前阶段（继续处理）
 * - 终态 → 返回 null（无需处理）
 *
 * @param {object} task - 任务对象
 * @returns {string|null} 下一步要处理的阶段，或 null
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
