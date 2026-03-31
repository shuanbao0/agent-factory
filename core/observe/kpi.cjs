'use strict'
/**
 * KPI — 部门 KPI 计算引擎
 *
 * 设计模式：Calculation Engine + SQLite 持久化
 */
const { existsSync } = require('fs')
const { DEPARTMENTS_DIR } = require('../common/paths.cjs')
const logger = require('../common/logger.cjs')
const { insertKpiSnapshot, readKpiHistoryFromDb } = require('../db/queries/dept-queries.cjs')

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
  const { getDb } = require('../db/connection.cjs')
  const db = getDb()
  const agentIds = config.agents || []
  if (agentIds.length === 0) return 0

  const today = new Date().toISOString().slice(0, 10)
  const placeholders = agentIds.map(() => '?').join(',')

  switch (metric) {
    case 'chapters_per_day':
    case 'tasks_completed_per_day': {
      const row = db.prepare(`
        SELECT COUNT(*) AS cnt FROM tasks
        WHERE assigned_agent IN (${placeholders})
          AND status = 'completed'
          AND completed_at >= ? AND completed_at < ?
      `).get(...agentIds, today + 'T00:00:00', today + 'T23:59:59.999Z')
      return row?.cnt || 0
    }
    case 'quality_score': {
      // quality 是 JSON blob，需要用 json_extract
      const rows = db.prepare(`
        SELECT json_extract(quality, '$.peerReview.score') AS score
        FROM tasks
        WHERE assigned_agent IN (${placeholders})
          AND quality IS NOT NULL
          AND json_extract(quality, '$.peerReview.score') IS NOT NULL
      `).all(...agentIds)
      if (rows.length === 0) return 0
      const total = rows.reduce((sum, r) => sum + (r.score || 0), 0)
      return Math.round(total / rows.length)
    }
    case 'completion_rate': {
      const row = db.prepare(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
        FROM tasks
        WHERE assigned_agent IN (${placeholders})
      `).get(...agentIds)
      return row?.total > 0 ? Math.round((row.completed / row.total) * 100) : 0
    }
    default:
      return 0
  }
}

/**
 * 保存 KPI 快照到 DB
 */
function saveKPISnapshot(deptId, kpis) {
  try {
    insertKpiSnapshot(deptId, kpis)
  } catch (err) {
    logger.debug('kpi', 'failed to save KPI snapshot', { deptId, error: err.message })
  }
}

/**
 * 读取 KPI 历史（从 DB）
 */
function readKPIHistory(deptId, limit = 100) {
  try {
    return readKpiHistoryFromDb(deptId, limit)
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
