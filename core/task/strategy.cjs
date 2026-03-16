'use strict'
/**
 * TaskStrategy — 按任务类型定义的策略配置
 *
 * 设计模式：Strategy + Fallback
 *
 * 职责：
 * - 为不同任务类型（writing/editing/coding 等）提供差异化的阈值配置
 * - 控制：空闲自动完成时间、过期超时、质量门最低分数、推荐评审人
 * - 支持部门级覆盖（deptConfig.workflow.strategies[taskType]）
 * - 未知类型回退到 _fallback 策略（与旧版硬编码值一致，零回归）
 *
 * 策略字段说明：
 * - idleThresholdMins    — Agent 空闲超过此时间，任务自动推进到 review
 * - staleThresholdMins   — 任务超过此时间无进展，标记为 failed
 * - minPassingScore      — 质量门自检/评审的最低通过分数 (0-100)
 * - preferredReviewers   — 推荐的同行评审 Agent ID 列表
 * - reviewCriteria       — 评审关注点描述（可选，传给评审 Agent 的提示）
 */

/** 8 种内置策略 + 1 个兜底策略 */
const BUILTIN_STRATEGIES = {
  writing: {
    idleThresholdMins: 60,
    staleThresholdMins: 120,
    minPassingScore: 70,
    preferredReviewers: ['reader-analyst', 'style-editor', 'continuity-mgr'],
    reviewCriteria: '完成度、文笔质量、情节连贯性',
  },
  editing: {
    idleThresholdMins: 30,
    staleThresholdMins: 60,
    minPassingScore: 75,
    preferredReviewers: ['reader-analyst', 'continuity-mgr'],
    reviewCriteria: '修改质量、一致性',
  },
  worldbuilding: {
    idleThresholdMins: 45,
    staleThresholdMins: 90,
    minPassingScore: 65,
    preferredReviewers: ['worldbuilder', 'continuity-mgr'],
  },
  character: {
    idleThresholdMins: 40,
    staleThresholdMins: 80,
    minPassingScore: 65,
    preferredReviewers: ['character-designer', 'continuity-mgr'],
  },
  plotting: {
    idleThresholdMins: 40,
    staleThresholdMins: 80,
    minPassingScore: 65,
    preferredReviewers: ['plot-architect', 'pacing-designer'],
  },
  coding: {
    idleThresholdMins: 20,
    staleThresholdMins: 45,
    minPassingScore: 80,
    preferredReviewers: [],
  },
  analysis: {
    idleThresholdMins: 30,
    staleThresholdMins: 60,
    minPassingScore: 65,
    preferredReviewers: [],
  },
  research: {
    idleThresholdMins: 30,
    staleThresholdMins: 60,
    minPassingScore: 65,
    preferredReviewers: [],
  },
  /** 兜底策略：与旧版硬编码值一致，保证零回归 */
  _fallback: {
    idleThresholdMins: 8,
    staleThresholdMins: 30,
    minPassingScore: 60,
    preferredReviewers: [],
  },
}

/** 策略对象的必填字段 */
const REQUIRED_FIELDS = ['idleThresholdMins', 'staleThresholdMins', 'minPassingScore', 'preferredReviewers']

/**
 * 获取指定任务类型的策略
 *
 * 查找优先级：
 *   1. 部门配置覆盖 deptConfig.workflow.strategies[taskType]（浅合并）
 *   2. 内置策略 BUILTIN_STRATEGIES[taskType]
 *   3. 兜底策略 BUILTIN_STRATEGIES._fallback
 *
 * @param {string} [taskType] - 任务类型（如 'writing', 'coding'）
 * @param {object} [deptConfig] - 部门配置对象
 * @returns {object} 策略对象
 */
function getStrategy(taskType, deptConfig) {
  // 查找内置策略，不存在则用兜底
  const base = (taskType && BUILTIN_STRATEGIES[taskType]) || BUILTIN_STRATEGIES._fallback

  // 检查部门级覆盖（浅合并，部门值优先）
  const deptOverride = deptConfig?.workflow?.strategies?.[taskType]
  if (deptOverride && typeof deptOverride === 'object') {
    return Object.assign({}, base, deptOverride)
  }

  return base
}

module.exports = { BUILTIN_STRATEGIES, getStrategy, REQUIRED_FIELDS }
