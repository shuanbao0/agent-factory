'use strict'
/**
 * dept-config-queries.cjs — 部门配置 DB 查询
 *
 * 替代 departments/{id}/config.json 的目录扫描。
 * budget, kpis, workflow 存为 JSON TEXT。
 */
const { getDb } = require('../connection.cjs')

function deptConfigToRow(config) {
  return {
    id: config.id,
    name: config.name || config.id,
    head: config.head || null,
    interval_s: config.interval || 600,
    enabled: config.enabled ? 1 : 0,
    agents: JSON.stringify(config.agents || []),
    budget: config.budget ? JSON.stringify(config.budget) : null,
    kpis: config.kpis ? JSON.stringify(config.kpis) : null,
    workflow: config.workflow ? JSON.stringify(config.workflow) : null,
    updated_at: new Date().toISOString(),
  }
}

function rowToDeptConfig(row) {
  return {
    id: row.id,
    name: row.name,
    head: row.head || undefined,
    interval: row.interval_s,
    enabled: !!row.enabled,
    agents: safeParseJson(row.agents, []),
    budget: safeParseJson(row.budget, undefined),
    kpis: safeParseJson(row.kpis, undefined),
    workflow: safeParseJson(row.workflow, undefined),
  }
}

function safeParseJson(str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

function upsertDeptConfig(config) {
  const db = getDb()
  const row = deptConfigToRow(config)
  db.prepare(`
    INSERT OR REPLACE INTO dept_config (id, name, head, interval_s, enabled, agents, budget, kpis, workflow, updated_at)
    VALUES (@id, @name, @head, @interval_s, @enabled, @agents, @budget, @kpis, @workflow, @updated_at)
  `).run(row)
}

function findDeptConfigById(id) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM dept_config WHERE id = ?').get(id)
  return row ? rowToDeptConfig(row) : null
}

function findAllDeptConfigs() {
  const db = getDb()
  return db.prepare('SELECT * FROM dept_config ORDER BY name').all().map(rowToDeptConfig)
}

function listDeptIdsFromDb() {
  const db = getDb()
  return db.prepare('SELECT id FROM dept_config ORDER BY id').all().map(r => r.id)
}

function deleteDeptConfigFromDb(id) {
  const db = getDb()
  db.prepare('DELETE FROM dept_config WHERE id = ?').run(id)
}

module.exports = {
  upsertDeptConfig, findDeptConfigById, findAllDeptConfigs,
  listDeptIdsFromDb, deleteDeptConfigFromDb,
  deptConfigToRow, rowToDeptConfig,
}
