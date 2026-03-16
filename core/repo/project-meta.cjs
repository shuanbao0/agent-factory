'use strict'
const { join } = require('path')
const { existsSync, readdirSync } = require('fs')
const { BaseRepository } = require('./base.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

class ProjectMetaRepository extends BaseRepository {
  /** Read project metadata */
  readMeta(projectId) {
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    return this.read(metaPath)
  }

  /** Write project metadata (atomic) */
  writeMeta(projectId, meta) {
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    this.write(metaPath, meta)
  }

  /** Atomic update */
  updateMeta(projectId, mutator) {
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    return this.update(metaPath, mutator)
  }

  /** Scan all projects (including sub-projects) for metadata */
  readAll() {
    const results = []
    if (!existsSync(PROJECTS_DIR)) return results
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      const meta = this.readMeta(dir.name)
      if (meta) results.push({ projectId: dir.name, meta })
      // Sub-projects
      try {
        const subDirs = readdirSync(join(PROJECTS_DIR, dir.name), { withFileTypes: true })
          .filter(sd => sd.isDirectory() && !sd.name.startsWith('.'))
        for (const sd of subDirs) {
          const subId = `${dir.name}/${sd.name}`
          const subMeta = this.readMeta(subId)
          if (subMeta) results.push({ projectId: subId, meta: subMeta })
        }
      } catch { /* skip */ }
    }
    return results
  }
}

const projectMetaRepo = new ProjectMetaRepository() // No cache for API routes
module.exports = { ProjectMetaRepository, projectMetaRepo }
