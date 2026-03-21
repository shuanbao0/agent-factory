'use strict'
/**
 * DepartmentService — 部门生命周期管理
 *
 * 职责：创建、更新、删除部门（注册表 + autopilot config）
 */
const { join } = require('path')
const { deptRegistryRepo } = require('../repo/dept-registry.cjs')
const { DeptConfigRepository } = require('../repo/dept-config.cjs')
const { agentMetaRepo } = require('../repo/agent-meta.cjs')
const { missionRepo } = require('../repo/mission.cjs')

// Lazy require to avoid circular dependencies
let _deptStateRepo
function getDeptStateRepo() {
  if (!_deptStateRepo) _deptStateRepo = require('../repo/dept-state.cjs').deptStateRepo
  return _deptStateRepo
}

/**
 * 创建部门
 * @param {object} body - { id, name, nameEn, emoji, order, floorColor, furniture, templateId? }
 * @returns {{ ok: boolean, id?: string, error?: string, status?: number }}
 */
function createDepartment(body) {
  const { id, name, nameEn, emoji, order, floorColor, furniture, templateId } = body

  if (!id || !name || !nameEn) {
    return { ok: false, error: 'id, name, and nameEn are required', status: 400 }
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    return { ok: false, error: 'ID must be lowercase alphanumeric with hyphens', status: 400 }
  }

  const departments = deptRegistryRepo.readAll()
  if (departments.find(d => d.id === id)) {
    return { ok: false, error: `Department "${id}" already exists`, status: 409 }
  }

  // Load template defaults if templateId provided
  let tmplDefaults = {}
  let missionContent = `# ${name}\n\n（待定义部门使命）\n`
  if (templateId) {
    const { readDeptTemplate, getDeptTemplateDir, readDeptTemplateFile } = require('../repo/dept-template.cjs')
    const tmpl = readDeptTemplate(templateId)
    if (tmpl) {
      tmplDefaults = tmpl.defaults || {}
      const tmplDir = getDeptTemplateDir(templateId)
      if (tmplDir) {
        const m = readDeptTemplateFile(tmplDir, 'mission.md')
        if (m) missionContent = m
      }
    }
  }

  // Registry entry: user values > template defaults > hardcoded defaults
  departments.push({
    id,
    name,
    nameEn,
    emoji: emoji || tmplDefaults.emoji || '🏢',
    order: order ?? tmplDefaults.order ?? departments.length,
    floorColor: floorColor || tmplDefaults.floorColor || { h: 35, s: 30, b: 15, c: 0 },
    furniture: furniture || tmplDefaults.furniture || [],
  })

  departments.sort((a, b) => a.order - b.order)
  deptRegistryRepo.writeAll(departments)

  // Auto-create autopilot department config if not exists
  const deptConfigRepo = new DeptConfigRepository()
  const existing = deptConfigRepo.load(id)
  if (!existing) {
    deptConfigRepo.save(id, {
      id,
      name,
      head: tmplDefaults.head || '',
      interval: tmplDefaults.interval ?? 600,
      enabled: false,
      agents: [],
      budget: tmplDefaults.budget || { dailyTokenLimit: 500000, alertThreshold: 0.8 },
      kpis: tmplDefaults.kpis || {},
      workflow: tmplDefaults.workflow || undefined,
    })
    missionRepo.writeDeptMission(id, missionContent)
  }

  return { ok: true, id }
}

/**
 * 更新部门注册表条目
 * @param {string} id
 * @param {object} updates
 * @returns {{ ok: boolean, error?: string, status?: number }}
 */
function updateDepartment(id, updates) {
  if (!id) return { ok: false, error: 'id is required', status: 400 }

  const departments = deptRegistryRepo.readAll()
  const idx = departments.findIndex(d => d.id === id)
  if (idx === -1) return { ok: false, error: `Department "${id}" not found`, status: 404 }

  if (updates.name !== undefined) departments[idx].name = updates.name
  if (updates.nameEn !== undefined) departments[idx].nameEn = updates.nameEn
  if (updates.emoji !== undefined) departments[idx].emoji = updates.emoji
  if (updates.order !== undefined) departments[idx].order = updates.order
  if (updates.floorColor !== undefined) departments[idx].floorColor = updates.floorColor
  if (updates.furniture !== undefined) departments[idx].furniture = updates.furniture

  departments.sort((a, b) => a.order - b.order)
  deptRegistryRepo.writeAll(departments)

  return { ok: true }
}

/**
 * 删除部门（清除 agent 关联 + 禁用 config + kill 进程）
 * @param {string} id
 * @returns {{ ok: boolean, clearedAgents?: number, error?: string, status?: number }}
 */
function deleteDepartment(id) {
  if (!id) return { ok: false, error: 'id is required', status: 400 }

  const departments = deptRegistryRepo.readAll()
  const idx = departments.findIndex(d => d.id === id)
  if (idx === -1) return { ok: false, error: `Department "${id}" not found`, status: 404 }

  // Clear department from agents
  const clearedAgents = agentMetaRepo.clearDepartment(id)

  // Remove from registry
  departments.splice(idx, 1)
  deptRegistryRepo.writeAll(departments)

  // Disable autopilot config and kill running process
  const deptConfigRepo = new DeptConfigRepository()
  const config = deptConfigRepo.load(id)
  if (config) {
    const deptStateRepo = getDeptStateRepo()
    const state = deptStateRepo.load(id)
    if (state && state.pid) {
      try { process.kill(state.pid, 'SIGTERM') } catch { /* already dead */ }
    }
    config.enabled = false
    deptConfigRepo.save(id, config)
  }

  return { ok: true, clearedAgents }
}

module.exports = { createDepartment, updateDepartment, deleteDepartment }
