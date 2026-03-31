'use strict'
/**
 * project-queries.cjs — 项目元数据 DB 查询
 *
 * 替代 projects/{dept}/{slug}/.project-meta.json 的两层目录扫描。
 * 不含 tasks（tasks 在独立的 tasks 表中）。
 */
const { getDb } = require('../connection.cjs')

function projectToRow(project) {
  return {
    id: project.id,
    name: project.name || project.id,
    description: project.description || null,
    status: project.status || 'planning',
    current_phase: project.currentPhase || 1,
    total_phases: project.totalPhases || 1,
    phases: project.phases ? JSON.stringify(project.phases) : null,
    department: project.department || null,
    assigned_agents: JSON.stringify(project.assignedAgents || []),
    created_at: project.createdAt || new Date().toISOString(),
    updated_at: project.updatedAt || new Date().toISOString(),
  }
}

function rowToProject(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    status: row.status,
    currentPhase: row.current_phase,
    totalPhases: row.total_phases,
    phases: safeParseJson(row.phases, undefined),
    department: row.department || undefined,
    assignedAgents: safeParseJson(row.assigned_agents, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function safeParseJson(str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

function upsertProject(project) {
  const db = getDb()
  const row = projectToRow(project)
  db.prepare(`
    INSERT OR REPLACE INTO projects (id, name, description, status, current_phase, total_phases, phases, department, assigned_agents, created_at, updated_at)
    VALUES (@id, @name, @description, @status, @current_phase, @total_phases, @phases, @department, @assigned_agents, @created_at, @updated_at)
  `).run(row)
}

function findProjectById(id) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  return row ? rowToProject(row) : null
}

function findAllProjects(opts = {}) {
  const db = getDb()
  const conditions = []
  const params = []
  if (opts.department) { conditions.push('department = ?'); params.push(opts.department) }
  if (opts.status) { conditions.push('status = ?'); params.push(opts.status) }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM projects ${where} ORDER BY created_at DESC`).all(...params).map(rowToProject)
}

function findProjectsByDepartment(deptId) {
  const db = getDb()
  return db.prepare('SELECT * FROM projects WHERE department = ? ORDER BY created_at DESC').all(deptId).map(rowToProject)
}

function listProjectIds() {
  const db = getDb()
  return db.prepare('SELECT id FROM projects ORDER BY id').all().map(r => r.id)
}

function deleteProjectFromDb(id) {
  const db = getDb()
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

module.exports = {
  upsertProject, findProjectById, findAllProjects, findProjectsByDepartment,
  listProjectIds, deleteProjectFromDb,
  projectToRow, rowToProject,
}
