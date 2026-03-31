'use strict'
/**
 * ProjectMetaRepository — 项目元数据的数据访问层
 *
 * 设计模式：Repository（DB 读 + 文件双写）
 *
 * 职责：
 * - 元数据读取走 DB projects 表
 * - 写入双写到 DB + .project-meta.json（Gateway 兼容）
 * - 不含 tasks（tasks 在独立的 tasks 表中）
 */
const { join, resolve } = require('path')
const { existsSync, readdirSync, rmSync, mkdirSync, writeFileSync } = require('fs')
const { BaseRepository } = require('./base.cjs')
const { PROJECTS_DIR } = require('../common/paths.cjs')
const logger = require('../common/logger.cjs')

// Lazy DB requires
let _upsertProject, _findProjectById, _findAllProjects, _listProjectIds, _deleteProjectFromDb
function db() {
  if (!_upsertProject) {
    const q = require('../db/queries/project-queries.cjs')
    _upsertProject = q.upsertProject
    _findProjectById = q.findProjectById
    _findAllProjects = q.findAllProjects
    _listProjectIds = q.listProjectIds
    _deleteProjectFromDb = q.deleteProjectFromDb
  }
}

class ProjectMetaRepository extends BaseRepository {
  /** 读取项目元数据（DB 读，不含 tasks） */
  readMeta(projectId) {
    try {
      db()
      const project = _findProjectById(projectId)
      if (project) return project
    } catch (err) {
      logger.debug('project-meta-repo', 'DB read failed, falling back to file', { projectId, error: err.message })
    }
    // Fallback to file
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    return this.read(metaPath)
  }

  /** 写入项目元数据（DB + 文件双写） */
  writeMeta(projectId, meta) {
    // DB 写入（不含 tasks，tasks 由 task.cjs 管理）
    try {
      db()
      const dbMeta = { ...meta, id: projectId }
      delete dbMeta.tasks // tasks 在独立表中
      _upsertProject(dbMeta)
    } catch (err) {
      logger.debug('project-meta-repo', 'DB write failed', { projectId, error: err.message })
    }
    // 文件写入（含 tasks，Gateway/Agent 兼容）
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    this.write(metaPath, meta)
  }

  /** 原子更新项目元数据 */
  updateMeta(projectId, mutator) {
    // 从文件读（含 tasks），应用 mutator，双写
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    const current = this.read(metaPath) || {}
    const updated = mutator(current)
    this.writeMeta(projectId, updated)
    return updated
  }

  /** 删除项目 */
  deleteProject(projectId) {
    if (!projectId || projectId.includes('..')) throw new Error('invalid project id')
    const projectDir = resolve(PROJECTS_DIR, projectId)
    if (!projectDir.startsWith(PROJECTS_DIR + '/')) throw new Error('invalid project id')
    // DB 删除
    try { db(); _deleteProjectFromDb(projectId) } catch { /* ok */ }
    // 文件删除
    if (!existsSync(projectDir)) throw new Error(`Project not found: ${projectId}`)
    rmSync(projectDir, { recursive: true })
  }

  /** 读取所有项目元数据（DB 查询替代目录扫描） */
  readAll() {
    try {
      db()
      const projects = _findAllProjects()
      if (projects.length > 0) {
        return projects.map(p => ({ projectId: p.id, meta: p }))
      }
    } catch (err) {
      logger.debug('project-meta-repo', 'DB readAll failed, falling back to dir scan', { error: err.message })
    }
    // Fallback: 目录扫描
    const results = []
    if (!existsSync(PROJECTS_DIR)) return results
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      const meta = this.read(join(PROJECTS_DIR, dir.name, '.project-meta.json'))
      if (meta) results.push({ projectId: dir.name, meta })
      try {
        const subDirs = readdirSync(join(PROJECTS_DIR, dir.name), { withFileTypes: true })
          .filter(sd => sd.isDirectory() && !sd.name.startsWith('.'))
        for (const sd of subDirs) {
          const subId = `${dir.name}/${sd.name}`
          const subMeta = this.read(join(PROJECTS_DIR, subId, '.project-meta.json'))
          if (subMeta) results.push({ projectId: subId, meta: subMeta })
        }
      } catch { /* skip */ }
    }
    return results
  }

  ensureProjectDirs(projectId, subdirs) {
    for (const sub of subdirs) {
      const dir = join(PROJECTS_DIR, projectId, sub)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    }
  }

  writeProjectFile(projectId, filename, content) {
    const filePath = join(PROJECTS_DIR, projectId, filename)
    const dir = join(filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, content)
  }

  /** 列出所有项目 ID（DB 查询） */
  listProjectIds() {
    try {
      db()
      const ids = _listProjectIds()
      if (ids.length > 0) return ids
    } catch { /* fallback */ }
    if (!existsSync(PROJECTS_DIR)) return []
    return readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  }
}

const projectMetaRepo = new ProjectMetaRepository()
module.exports = { ProjectMetaRepository, projectMetaRepo }
