'use strict'
/**
 * TaskStrategy — 按任务类型定义的策略配置
 *
 * 设计模式：Strategy + Fallback
 *
 * 职责：
 * - 为不同任务类型提供差异化的阈值配置
 * - 通用类型（coding/research/analysis/design/marketing/tutorial/operations/finance/review）
 * - 创作类型（writing/editing/worldbuilding/character/plotting）
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

/**
 * 内置策略
 *
 * 分三组：
 *   1. 通用类型 — 适用于所有部门（coding/research/analysis/design/marketing/tutorial/operations/finance/review）
 *   2. 创作类型 — 适用于小说/动画/内容创作部门（writing/editing/worldbuilding/character/plotting）
 *   3. 兜底策略 — 未知类型自动使用
 *
 * preferredReviewers 留空 — 由部门通过 deptConfig.workflow.strategies[type] 覆盖
 */
const BUILTIN_STRATEGIES = {
  // ── 通用类型 ──────────────────────────────────────────────
  coding: {
    idleThresholdMins: 20,
    staleThresholdMins: 45,
    minPassingScore: 80,
    preferredReviewers: [],
    reviewCriteria: '功能完整性、测试覆盖、安全性、代码规范',
  },
  research: {
    idleThresholdMins: 30,
    staleThresholdMins: 60,
    minPassingScore: 65,
    preferredReviewers: [],
    reviewCriteria: '数据可靠性、分析深度、结论可操作性',
  },
  analysis: {
    idleThresholdMins: 30,
    staleThresholdMins: 60,
    minPassingScore: 65,
    preferredReviewers: [],
    reviewCriteria: '数据准确性、框架合理性、洞察价值',
  },
  design: {
    idleThresholdMins: 40,
    staleThresholdMins: 90,
    minPassingScore: 70,
    preferredReviewers: [],
    reviewCriteria: '方案可行性、技术选型合理性、接口清晰度',
  },
  marketing: {
    idleThresholdMins: 30,
    staleThresholdMins: 60,
    minPassingScore: 65,
    preferredReviewers: [],
    reviewCriteria: '目标受众匹配、信息准确性、创意质量',
  },
  tutorial: {
    idleThresholdMins: 45,
    staleThresholdMins: 90,
    minPassingScore: 70,
    preferredReviewers: [],
    reviewCriteria: '教学准确性、步骤清晰度、示例可运行',
  },
  operations: {
    idleThresholdMins: 20,
    staleThresholdMins: 45,
    minPassingScore: 70,
    preferredReviewers: [],
    reviewCriteria: '流程完整性、合规性、执行可行性',
  },
  finance: {
    idleThresholdMins: 30,
    staleThresholdMins: 60,
    minPassingScore: 75,
    preferredReviewers: [],
    reviewCriteria: '数据准确性、计算正确性、合规性',
  },
  review: {
    idleThresholdMins: 20,
    staleThresholdMins: 45,
    minPassingScore: 70,
    preferredReviewers: [],
    reviewCriteria: '评审全面性、反馈建设性',
  },

  // ── 创作类型 ──────────────────────────────────────────────
  writing: {
    idleThresholdMins: 60,
    staleThresholdMins: 120,
    minPassingScore: 70,
    preferredReviewers: [],
    reviewCriteria: '完成度、文笔质量、情节连贯性',
  },
  editing: {
    idleThresholdMins: 30,
    staleThresholdMins: 60,
    minPassingScore: 75,
    preferredReviewers: [],
    reviewCriteria: '修改质量、一致性',
  },
  worldbuilding: {
    idleThresholdMins: 45,
    staleThresholdMins: 90,
    minPassingScore: 65,
    preferredReviewers: [],
  },
  character: {
    idleThresholdMins: 40,
    staleThresholdMins: 80,
    minPassingScore: 65,
    preferredReviewers: [],
  },
  plotting: {
    idleThresholdMins: 40,
    staleThresholdMins: 80,
    minPassingScore: 65,
    preferredReviewers: [],
  },

  /** 兜底策略：未知类型自动使用 */
  _fallback: {
    idleThresholdMins: 20,
    staleThresholdMins: 45,
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
