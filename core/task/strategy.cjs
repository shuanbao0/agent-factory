'use strict'
/**
 * Task Strategy — type-aware thresholds for task auto-transition, quality gates, and reviewer selection.
 *
 * Replaces hardcoded IDLE_COMPLETE_MINS / STALE_TASK_MINS / score 60 / REVIEWER_MAP
 * with per-task-type strategy objects. Falls back to _fallback (identical to legacy values)
 * for tasks without a type, ensuring zero regression.
 */

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
  _fallback: {
    idleThresholdMins: 8,
    staleThresholdMins: 30,
    minPassingScore: 60,
    preferredReviewers: [],
  },
}

const REQUIRED_FIELDS = ['idleThresholdMins', 'staleThresholdMins', 'minPassingScore', 'preferredReviewers']

/**
 * Get the strategy for a task type with optional department-level overrides.
 *
 * Priority:
 *   1. deptConfig.workflow.strategies[taskType] (partial override, shallow-merged)
 *   2. BUILTIN_STRATEGIES[taskType]
 *   3. BUILTIN_STRATEGIES._fallback
 *
 * @param {string} [taskType] - Task type key (e.g. 'writing', 'coding')
 * @param {object} [deptConfig] - Department config object
 * @returns {object} Strategy object
 */
function getStrategy(taskType, deptConfig) {
  const base = (taskType && BUILTIN_STRATEGIES[taskType]) || BUILTIN_STRATEGIES._fallback

  // Check for department-level override
  const deptOverride = deptConfig?.workflow?.strategies?.[taskType]
  if (deptOverride && typeof deptOverride === 'object') {
    return Object.assign({}, base, deptOverride)
  }

  return base
}

module.exports = { BUILTIN_STRATEGIES, getStrategy, REQUIRED_FIELDS }
