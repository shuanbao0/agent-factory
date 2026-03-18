'use strict'
/**
 * ProjectMetaRepository — 项目元数据的数据访问层
 *
 * 设计模式：Repository + Scanner
 *
 * 职责：
 * - 管理 projects/{projectId}/.project-meta.json
 * - 单项目的读写更新
 * - readAll() 扫描所有项目和子项目的元数据（供项目列表 API 使用）
 *
 * 无缓存实例（API 路由场景，需要实时数据）
 */
const { join, resolve } = require('path')
const { existsSync, readdirSync, rmSync } = require('fs')
const { BaseRepository } = require('./base.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

class ProjectMetaRepository extends BaseRepository {
  /**
   * 读取项目元数据
   * @param {string} projectId - 项目 ID（可含子路径，如 "novel/chapter1"）
   * @returns {object|null} 元数据对象，不存在返回 null
   */
  readMeta(projectId) {
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    return this.read(metaPath)
  }

  /**
   * 写入项目元数据（原子写入，自动创建目录）
   * @param {string} projectId - 项目 ID
   * @param {object} meta - 元数据对象
   */
  writeMeta(projectId, meta) {
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    this.write(metaPath, meta)
  }

  /**
   * 原子更新项目元数据
   * @param {string} projectId - 项目 ID
   * @param {function} mutator - (currentMeta) => newMeta
   * @returns {object} 更新后的元数据
   */
  updateMeta(projectId, mutator) {
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    return this.update(metaPath, mutator)
  }

  /**
   * 扫描所有项目（含子项目）的元数据
   *
   * 遍历 projects/ 下所有一级目录及其子目录，收集存在 .project-meta.json 的项目
   *
   * @returns {Array<{projectId: string, meta: object}>} 项目列表
   */
  /**
   * 删除项目目录（含路径安全校验）
   * @param {string} projectId - 项目 ID
   */
  deleteProject(projectId) {
    if (!projectId || projectId.includes('..')) {
      throw new Error('invalid project id')
    }
    const projectDir = resolve(PROJECTS_DIR, projectId)
    if (!projectDir.startsWith(PROJECTS_DIR + '/')) {
      throw new Error('invalid project id')
    }
    if (!existsSync(projectDir)) {
      throw new Error(`Project not found: ${projectId}`)
    }
    rmSync(projectDir, { recursive: true })
  }

  readAll() {
    const results = []
    if (!existsSync(PROJECTS_DIR)) return results

    // 扫描一级目录
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      const meta = this.readMeta(dir.name)
      if (meta) results.push({ projectId: dir.name, meta })

      // 扫描子项目（二级目录）
      try {
        const subDirs = readdirSync(join(PROJECTS_DIR, dir.name), { withFileTypes: true })
          .filter(sd => sd.isDirectory() && !sd.name.startsWith('.'))
        for (const sd of subDirs) {
          const subId = `${dir.name}/${sd.name}`
          const subMeta = this.readMeta(subId)
          if (subMeta) results.push({ projectId: subId, meta: subMeta })
        }
      } catch { /* 目录读取失败，跳过 */ }
    }
    return results
  }
}

/** 无缓存实例，供 API 路由使用 */
const projectMetaRepo = new ProjectMetaRepository()
module.exports = { ProjectMetaRepository, projectMetaRepo }
