'use strict'
/**
 * StallDetector — 任务/部门停滞检测
 *
 * 设计模式：Observer Reactor
 */

// Lazy require
let _deptStateRepo
function getDeptStateRepo() {
  if (!_deptStateRepo) _deptStateRepo = require('../repo/dept-state.cjs').deptStateRepo
  return _deptStateRepo
}

/**
 * Detect stalled tasks in a department.
 * @param {string} deptId
 * @returns {Array<{taskId: string, taskName: string, stalledCycles: number, suggestion: string}>}
 */
function detectStalls(deptId) {
  const state = getDeptStateRepo().load(deptId)
  const history = state.history || []
  const stalls = []
  if (history.length < 3) return stalls

  const recent = history.slice(-3)
  const taskMentions = {}
  for (const entry of recent) {
    const result = entry.result || ''
    const mentions = result.match(/\[([^\]]+)\]/g) || []
    for (const mention of mentions) {
      const taskRef = mention.replace(/[\[\]]/g, '')
      taskMentions[taskRef] = (taskMentions[taskRef] || 0) + 1
    }
  }

  for (const [taskRef, count] of Object.entries(taskMentions)) {
    if (count >= 3) {
      stalls.push({
        taskId: taskRef,
        taskName: taskRef,
        stalledCycles: count,
        suggestion: 'Task mentioned in 3+ consecutive cycles. Consider: reassigning, splitting into subtasks, or changing approach.',
      })
    }
  }
  return stalls
}

/**
 * Detect department-level stall.
 * @param {string} deptId
 * @returns {{stalled: boolean, reason?: string}}
 */
function detectDepartmentStall(deptId) {
  const state = getDeptStateRepo().load(deptId)
  const history = state.history || []
  if (history.length < 3) return { stalled: false }

  const recent = history.slice(-3)
  const results = recent.map(h => h.result || '')
  if (results.every(r => r === results[0]) && results[0].length > 0) {
    return { stalled: true, reason: `Last 3 cycles produced identical results: "${results[0].slice(0, 100)}..."` }
  }
  if (recent.every(h => (h.result || '').startsWith('Error:'))) {
    return { stalled: true, reason: 'Last 3 cycles all resulted in errors' }
  }
  return { stalled: false }
}

module.exports = { detectStalls, detectDepartmentStall }
