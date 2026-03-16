/**
 * KPI — key performance indicator tracking for departments
 */
const { readFileSync, appendFileSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')
const { DEPARTMENTS_DIR, PROJECTS_DIR } = require('./constants.cjs')
const { loadDeptConfig, readProjectTasks } = require('./readers.cjs')
const logger = require('./logger.cjs')

/**
 * Calculate current KPI values for a department.
 *
 * @param {string} deptId - Department ID
 * @returns {object} KPI results keyed by metric name
 */
function calculateDepartmentKPIs(deptId) {
  const config = loadDeptConfig(deptId)
  if (!config || !config.kpis) return {}

  const kpiDefs = config.kpis
  const results = {}

  for (const [metric, def] of Object.entries(kpiDefs)) {
    const actual = calculateMetric(deptId, metric, config)
    results[metric] = {
      ...def,
      actual,
      achievement: def.target > 0 ? actual / def.target : 0,
    }
  }

  return results
}

/**
 * Calculate a specific metric from project/task data.
 */
function calculateMetric(deptId, metric, config) {
  const projects = readProjectTasks()
  const agentIds = config.agents || []
  const today = new Date().toISOString().slice(0, 10)

  switch (metric) {
    case 'chapters_per_day': {
      // Count chapters completed today for novel department
      let count = 0
      for (const proj of projects) {
        for (const task of (proj.tasks || [])) {
          if (task.status === 'completed' && task.completedAt?.startsWith(today)) {
            if (agentIds.includes(task.assignedAgent) || (task.assignees || []).some(a => agentIds.includes(a))) {
              const isChapter = task.type === 'writing' || task.type === 'chapter' ||
                /chapter|章|篇/.test((task.name || '').toLowerCase())
              if (isChapter) count++
            }
          }
        }
      }
      return count
    }

    case 'tasks_completed_per_day': {
      let count = 0
      for (const proj of projects) {
        for (const task of (proj.tasks || [])) {
          if (task.status === 'completed' && task.completedAt?.startsWith(today)) {
            if (agentIds.includes(task.assignedAgent) || (task.assignees || []).some(a => agentIds.includes(a))) {
              count++
            }
          }
        }
      }
      return count
    }

    case 'quality_score': {
      // Average quality score from tasks with quality gates
      let totalScore = 0
      let count = 0
      for (const proj of projects) {
        for (const task of (proj.tasks || [])) {
          if (task.quality?.peerReview?.score) {
            if (agentIds.includes(task.assignedAgent) || (task.assignees || []).some(a => agentIds.includes(a))) {
              totalScore += task.quality.peerReview.score
              count++
            }
          }
        }
      }
      return count > 0 ? Math.round(totalScore / count) : 0
    }

    case 'completion_rate': {
      let total = 0
      let completed = 0
      for (const proj of projects) {
        for (const task of (proj.tasks || [])) {
          if (agentIds.includes(task.assignedAgent) || (task.assignees || []).some(a => agentIds.includes(a))) {
            total++
            if (task.status === 'completed') completed++
          }
        }
      }
      return total > 0 ? Math.round((completed / total) * 100) : 0
    }

    default:
      return 0
  }
}

/**
 * Save a KPI snapshot (append to JSONL for trend analysis).
 */
function saveKPISnapshot(deptId, kpis) {
  const deptDir = join(DEPARTMENTS_DIR, deptId)
  if (!existsSync(deptDir)) mkdirSync(deptDir, { recursive: true })

  const historyFile = join(deptDir, 'kpi-history.jsonl')
  const entry = {
    timestamp: new Date().toISOString(),
    kpis,
  }

  try {
    appendFileSync(historyFile, JSON.stringify(entry) + '\n')
  } catch (err) {
    logger.warn('kpi', `Failed to save KPI snapshot for ${deptId}`, err)
  }
}

/**
 * Read KPI history for a department.
 *
 * @param {string} deptId - Department ID
 * @param {number} limit - Max entries to return
 * @returns {Array} KPI history entries
 */
function readKPIHistory(deptId, limit = 100) {
  const historyFile = join(DEPARTMENTS_DIR, deptId, 'kpi-history.jsonl')
  if (!existsSync(historyFile)) return []

  try {
    const lines = readFileSync(historyFile, 'utf-8').trim().split('\n')
    return lines.slice(-limit).map(line => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)
  } catch (err) {
    logger.warn('kpi', `Failed to read KPI history for ${deptId}`, err)
    return []
  }
}

/**
 * Get KPI summary for all departments (for CEO dashboard).
 */
function getCompanyKPIs() {
  const { readdirSync } = require('fs')
  const results = {}

  if (!existsSync(DEPARTMENTS_DIR)) return results

  try {
    const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const dir of dirs) {
      results[dir.name] = calculateDepartmentKPIs(dir.name)
    }
  } catch (err) {
    logger.warn('kpi', 'Failed to get company KPIs', err)
  }

  return results
}

/**
 * Check if an individual agent is within its daily budget.
 * Uses cost-tracker JSONL data to sum today's cost for the agent.
 *
 * @param {string} agentId - Agent ID
 * @param {number} [dailyLimitUsd] - Per-agent daily limit in USD (default from budget.json)
 * @returns {{ allowed: boolean, reason?: string, todayCost: number, limit: number }}
 */
function checkAgentBudget(agentId, dailyLimitUsd) {
  const { readFileSync, existsSync: fileExists } = require('fs')
  const { join: joinPath } = require('path')
  const { BUDGET_FILE } = require('./constants.cjs')

  // Determine limit: explicit param > budget.json > $5 default
  let limit = dailyLimitUsd
  if (limit === undefined) {
    try {
      if (fileExists(BUDGET_FILE)) {
        const budgetConfig = JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'))
        limit = budgetConfig.agentDailyLimit
      }
    } catch { /* ignore */ }
    if (limit === undefined) limit = 5
  }

  // Sum today's cost for this agent from cost tracker
  const costsFile = joinPath(require('path').resolve(__dirname, '../..'), 'config', 'autopilot-costs.jsonl')
  const today = new Date().toISOString().slice(0, 10)
  let todayCost = 0

  try {
    if (fileExists(costsFile)) {
      const lines = readFileSync(costsFile, 'utf-8').split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const entry = JSON.parse(line)
          if (entry.date === today && entry.agentId === agentId) {
            todayCost += entry.cost || 0
          }
        } catch { /* skip bad lines */ }
      }
    }
  } catch { /* ignore */ }

  if (todayCost >= limit) {
    return { allowed: false, reason: `agent ${agentId} daily cost $${todayCost.toFixed(4)} >= limit $${limit}`, todayCost, limit }
  }
  return { allowed: true, todayCost, limit }
}

module.exports = { calculateDepartmentKPIs, saveKPISnapshot, readKPIHistory, getCompanyKPIs, checkAgentBudget }
