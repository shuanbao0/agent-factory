/**
 * Department Activity Level — for AdaptiveTimer
 *
 * Extracted from the former scripts/autopilot/readers.cjs facade.
 */
const { deptConfigRepo } = require('../repo/dept-config.cjs')
const { taskRepo } = require('../repo/task.cjs')

/**
 * Determine department activity level (for AdaptiveTimer).
 * @param {string} deptId
 * @returns {'active' | 'idle' | 'budget_constrained'}
 */
function getDeptActivityLevel(deptId) {
  // Check budget first
  try {
    const { checkBudget } = require('../observe/budget.cjs')
    const budget = checkBudget(deptId)
    if (!budget.allowed) return 'budget_constrained'
  } catch { /* proceed without budget check */ }

  // Check if department has active tasks
  const config = deptConfigRepo.load(deptId)
  if (!config) return 'idle'

  const agents = config.agents || []
  const projects = taskRepo.readProjectsWithTasks()
  const activeStatuses = ['in_progress', 'review', 'rework']

  for (const proj of projects) {
    for (const t of (proj.tasks || [])) {
      if (!activeStatuses.includes(t.status)) continue
      const assignees = [t.assignedAgent, ...(t.assignees || [])]
      if (assignees.some(a => agents.includes(a))) {
        return 'active'
      }
    }
  }

  return 'idle'
}

module.exports = { getDeptActivityLevel }
