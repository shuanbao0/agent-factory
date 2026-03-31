'use strict'
/**
 * agent-queries.cjs — Agent 元数据 DB 查询
 *
 * 替代 agents/{id}/agent.json 的目录遍历读取。
 * JSON 数组字段（skills, peers）存为 TEXT。
 */
const { getDb } = require('../connection.cjs')

function agentToRow(agent) {
  return {
    id: agent.id,
    template_id: agent.templateId || null,
    name: agent.name || agent.id,
    role: agent.role || null,
    description: agent.description || null,
    model: agent.model || null,
    skills: JSON.stringify(agent.skills || []),
    peers: JSON.stringify(agent.peers || []),
    department: agent.department || null,
    created_at: agent.createdAt || new Date().toISOString(),
    updated_at: agent.updatedAt || new Date().toISOString(),
  }
}

function rowToAgent(row) {
  return {
    id: row.id,
    templateId: row.template_id || undefined,
    name: row.name,
    role: row.role || undefined,
    description: row.description || undefined,
    model: row.model || undefined,
    skills: safeParseJson(row.skills, []),
    peers: safeParseJson(row.peers, []),
    department: row.department || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function safeParseJson(str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

function upsertAgent(agent) {
  const db = getDb()
  const row = agentToRow(agent)
  db.prepare(`
    INSERT OR REPLACE INTO agents (id, template_id, name, role, description, model, skills, peers, department, created_at, updated_at)
    VALUES (@id, @template_id, @name, @role, @description, @model, @skills, @peers, @department, @created_at, @updated_at)
  `).run(row)
}

function findAgentById(id) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
  return row ? rowToAgent(row) : null
}

function findAllAgents(opts = {}) {
  const db = getDb()
  const conditions = []
  const params = []
  if (opts.department) { conditions.push('department = ?'); params.push(opts.department) }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM agents ${where} ORDER BY name`).all(...params).map(rowToAgent)
}

function findAgentsByDepartment(deptId) {
  const db = getDb()
  return db.prepare('SELECT * FROM agents WHERE department = ? ORDER BY name').all(deptId).map(rowToAgent)
}

function listAgentIds() {
  const db = getDb()
  return db.prepare('SELECT id FROM agents ORDER BY id').all().map(r => r.id)
}

function deleteAgentFromDb(id) {
  const db = getDb()
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)
}

function clearDepartmentInDb(deptId) {
  const db = getDb()
  db.prepare('UPDATE agents SET department = NULL, updated_at = ? WHERE department = ?')
    .run(new Date().toISOString(), deptId)
}

module.exports = {
  upsertAgent, findAgentById, findAllAgents, findAgentsByDepartment,
  listAgentIds, deleteAgentFromDb, clearDepartmentInDb,
  agentToRow, rowToAgent,
}
