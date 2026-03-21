'use strict'
/**
 * KPI — 部门 KPI 计算引擎
 *
 * 设计模式：Calculation Engine + JSONL 持久化
 */
const { readFileSync, appendFileSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')
const { DEPARTMENTS_DIR } = require('../common/paths.cjs')
const logger = require('../common/logger.cjs')

// Lazy require to avoid circular deps
let _deptConfigRepo, _taskRepo
function getDeptConfigRepo() {
  if (!_deptConfigRepo) _deptConfigRepo = require('../repo/dept-config.cjs').deptConfigRepo
  return _deptConfigRepo
}
function getTaskRepo() {
  if (!_taskRepo) _taskRepo = require('../repo/task.cjs').taskRepo
  return _taskRepo
}

/**
 * Calculate current KPI values for a department.
 */
function calculateDepartmentKPIs(deptId) {
  const config = getDeptConfigRepo().load(deptId)
  if (!config || !config.kpis) return {}

  const results = {}
  for (const [metric, def] of Object.entries(config.kpis)) {
    const actual = calculateMetric(deptId, metric, config)
    results[metric] = { ...def, actual, achievement: def.target > 0 ? actual / def.target : 0 }
  }
  return results
}

function calculateMetric(deptId, metric, config) {
  const projects = getTaskRepo().readProjectsWithTasks()
  const agentIds = config.agents || []
  const today = new Date().toISOString().slice(0, 10)

  const isAssignedToAgent = (task) => {
    return agentIds.includes(task.assignedAgent) || (task.assignees || []).some(a => agentIds.includes(a))
  }

  switch (metric) {
    case 'chapters_per_day':
    case 'tasks_completed_per_day': {
      let count = 0
      for (const proj of projects) {
        for (const task of (proj.tasks || [])) {
          if (task.status === 'completed' && task.completedAt?.startsWith(today) && isAssignedToAgent(task)) {
            count++
          }
        }
      }
      return count
    }
    case 'quality_score': {
      let totalScore = 0, count = 0
      for (const proj of projects) {
        for (const task of (proj.tasks || [])) {
          if (task.quality?.peerReview?.score && isAssignedToAgent(task)) {
            totalScore += task.quality.peerReview.score
            count++
          }
        }
      }
      return count > 0 ? Math.round(totalScore / count) : 0
    }
    case 'completion_rate': {
      let total = 0, completed = 0
      for (const proj of projects) {
        for (const task of (proj.tasks || [])) {
          if (isAssignedToAgent(task)) {
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

function saveKPISnapshot(deptId, kpis) {
  const deptDir = join(DEPARTMENTS_DIR, deptId)
  if (!existsSync(deptDir)) mkdirSync(deptDir, { recursive: true })
  const historyFile = join(deptDir, 'kpi-history.jsonl')
  try {
    appendFileSync(historyFile, JSON.stringify({ timestamp: new Date().toISOString(), kpis }) + '\n')
  } catch (err) {
    logger.debug('kpi', 'failed to save KPI snapshot', { deptId, error: err.message })
  }
}

function readKPIHistory(deptId, limit = 100) {
  const historyFile = join(DEPARTMENTS_DIR, deptId, 'kpi-history.jsonl')
  if (!existsSync(historyFile)) return []
  try {
    const lines = readFileSync(historyFile, 'utf-8').trim().split('\n')
    return lines.slice(-limit).map(line => {
      try { return JSON.parse(line) } catch { /* skip malformed line */ return null }
    }).filter(Boolean)
  } catch (err) {
    logger.debug('kpi', 'failed to read KPI history', { deptId, error: err.message })
    return []
  }
}

function getCompanyKPIs() {
  const { readdirSync } = require('fs')
  const results = {}
  if (!existsSync(DEPARTMENTS_DIR)) return results
  try {
    const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      results[dir.name] = calculateDepartmentKPIs(dir.name)
    }
  } catch (err) {
    logger.debug('kpi', 'failed to enumerate departments for company KPIs', { error: err.message })
  }
  return results
}

module.exports = { calculateDepartmentKPIs, saveKPISnapshot, readKPIHistory, getCompanyKPIs }
