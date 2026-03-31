'use strict'
/**
 * dept-queries.cjs — 部门循环 + KPI 快照 DB 查询
 */
const { getDb } = require('../connection.cjs')

// ── 部门循环 ──────────────────────────────────────────────────────

/**
 * 插入一条部门循环记录
 */
function insertDeptCycle({ deptId, cycleNum, startedAt, completedAt, elapsedSec, result, tokensUsed }) {
  const db = getDb()
  db.prepare(`
    INSERT INTO dept_cycles (dept_id, cycle_num, started_at, completed_at, elapsed_sec, result, tokens_used)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(deptId, cycleNum, startedAt, completedAt || null, elapsedSec || null, result || null, tokensUsed || 0)
}

/**
 * 查询部门循环历史
 * @param {string} deptId
 * @param {number} [limit=50]
 * @returns {Array}
 */
function queryDeptCycles(deptId, limit = 50) {
  const db = getDb()
  return db.prepare(`
    SELECT dept_id AS deptId, cycle_num AS cycle, started_at AS startedAt,
           completed_at AS completedAt, elapsed_sec AS elapsedSec, result, tokens_used AS tokensUsed
    FROM dept_cycles WHERE dept_id = ? ORDER BY started_at DESC LIMIT ?
  `).all(deptId, limit)
}

// ── KPI 快照 ──────────────────────────────────────────────────────

/**
 * 插入一条 KPI 快照
 * @param {string} deptId
 * @param {Object} kpis - KPI 数据对象
 */
function insertKpiSnapshot(deptId, kpis) {
  const db = getDb()
  db.prepare(`
    INSERT INTO kpi_snapshots (dept_id, ts, kpis) VALUES (?, ?, ?)
  `).run(deptId, new Date().toISOString(), JSON.stringify(kpis))
}

/**
 * 读取 KPI 历史
 * @param {string} deptId
 * @param {number} [limit=100]
 * @returns {Array<{ timestamp: string, kpis: Object }>}
 */
function readKpiHistoryFromDb(deptId, limit = 100) {
  const db = getDb()
  const rows = db.prepare(`
    SELECT ts AS timestamp, kpis FROM kpi_snapshots
    WHERE dept_id = ? ORDER BY ts DESC LIMIT ?
  `).all(deptId, limit)

  return rows.map(r => ({
    timestamp: r.timestamp,
    kpis: JSON.parse(r.kpis),
  })).reverse()
}

module.exports = {
  insertDeptCycle, queryDeptCycles,
  insertKpiSnapshot, readKpiHistoryFromDb,
}
