'use strict'
/**
 * TaskRepository — 任务 CRUD（统一 project tasks + standalone tasks）
 *
 * 数据源：
 * - config/tasks.json — 独立任务
 * - projects/{projectId}/.project-meta.json — 项目任务
 *
 * 架构说明：TaskRepository 管理双数据源（config/tasks.json + projects/{id}/.project-meta.json），
 * 每个源有不同的 JSON 结构和字段标准化逻辑。这种复杂性使继承 BaseRepository 的 read/write
 * 不可行，因此直接使用 readFileSync/writeFileSync。这是经过审查的架构例外。
 */
const { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } = require('fs')
const { join, resolve, dirname } = require('path')
const { BaseRepository } = require('./base.cjs')
const { PROJECT_ROOT, PROJECTS_DIR, TASKS_FILE } = require('../common/paths.cjs')
const logger = require('../common/logger.cjs')

/** Atomic write: tmp + rename to avoid partial writes */
function atomicWrite(filePath, content) {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = filePath + '.tmp'
  try {
    writeFileSync(tmp, content)
    renameSync(tmp, filePath)
  } catch (err) {
    logger.debug('task-repo', 'atomic rename failed, falling back to direct write', { filePath, error: err.message })
    writeFileSync(filePath, content)
  }
}

class TaskRepository extends BaseRepository {
  /** Normalize legacy task fields (e.g. 'running' → 'in_progress') */
  normalizeTask(raw, projectId) {
    const assignees = Array.isArray(raw.assignees)
      ? raw.assignees
      : typeof raw.assignedAgent === 'string' && raw.assignedAgent
        ? [raw.assignedAgent]
        : []

    let status = raw.status || 'pending'
    if (status === 'running') status = 'in_progress'

    return {
      id: raw.id,
      name: raw.name,
      description: raw.description || undefined,
      projectId: projectId ?? raw.projectId ?? null,
      phase: raw.phase || undefined,
      status,
      priority: raw.priority || 'P1',
      assignees,
      assignedAgent: assignees[0] || undefined,
      creator: raw.creator || 'user',
      progress: raw.progress || 0,
      dependencies: raw.dependencies || [],
      output: raw.output || undefined,
      tags: raw.tags || undefined,
      type: raw.type || undefined,
      parentTaskId: raw.parentTaskId || undefined,
      quality: raw.quality,
      reworkCount: raw.reworkCount || undefined,
      reworkFromId: raw.reworkFromId || undefined,
      validationErrors: raw.validationErrors || undefined,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
      completedAt: raw.completedAt || undefined,
    }
  }

  /** Read standalone tasks from config/tasks.json */
  readStandaloneTasks() {
    try {
      if (!existsSync(TASKS_FILE)) return []
      const data = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'))
      return (data.tasks || []).map(t => this.normalizeTask(t))
    } catch (err) {
      logger.warn('task-repo', 'failed to parse standalone tasks', { file: TASKS_FILE, error: err.message })
      return []
    }
  }

  /** Write standalone tasks to config/tasks.json */
  writeStandaloneTasks(tasks) {
    atomicWrite(TASKS_FILE, JSON.stringify({ tasks, lastUpdated: new Date().toISOString() }, null, 2) + '\n')
  }

  /** Read project meta */
  readProjectMeta(projectId) {
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    if (!existsSync(metaPath)) return null
    try {
      return JSON.parse(readFileSync(metaPath, 'utf-8'))
    } catch (err) {
      logger.debug('task-repo', 'failed to read project meta', { projectId, error: err.message })
      return null
    }
  }

  /** Write project meta */
  writeProjectMeta(projectId, meta) {
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    atomicWrite(metaPath, JSON.stringify(meta, null, 2) + '\n')
  }

  /**
   * Read all project tasks (with normalization).
   * Returns raw project objects with tasks array (for autopilot compatibility).
   * @returns {Array<{id: string, tasks: Array, ...meta}>}
   */
  readProjectsWithTasks() {
    const results = []
    try {
      if (!existsSync(PROJECTS_DIR)) return results
      const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const dir of dirs) {
        const metaPath = join(PROJECTS_DIR, dir.name, '.project-meta.json')
        if (existsSync(metaPath)) {
          try {
            const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
            // Normalize task statuses in-place
            if (Array.isArray(meta.tasks)) {
              for (const t of meta.tasks) {
                if (t.status === 'running') t.status = 'in_progress'
              }
            }
            results.push({ id: dir.name, ...meta })
          } catch (err) {
            logger.warn('task-repo', 'failed to parse project meta', { project: dir.name, error: err.message })
          }
        }
        // Nested sub-projects
        try {
          const subDirs = readdirSync(join(PROJECTS_DIR, dir.name), { withFileTypes: true })
            .filter(sd => sd.isDirectory() && !sd.name.startsWith('.'))
          for (const sd of subDirs) {
            const subMetaPath = join(PROJECTS_DIR, dir.name, sd.name, '.project-meta.json')
            if (existsSync(subMetaPath)) {
              try {
                const subId = `${dir.name}/${sd.name}`
                const meta = JSON.parse(readFileSync(subMetaPath, 'utf-8'))
                if (Array.isArray(meta.tasks)) {
                  for (const t of meta.tasks) {
                    if (t.status === 'running') t.status = 'in_progress'
                  }
                }
                results.push({ id: subId, ...meta })
              } catch (err) {
                logger.warn('task-repo', 'failed to parse sub-project meta', { project: subId, error: err.message })
              }
            }
          }
        } catch (err) {
          logger.debug('task-repo', 'failed to read sub-projects', { dir: dir.name, error: err.message })
        }
      }
    } catch (err) {
      logger.debug('task-repo', 'failed to read projects directory', { error: err.message })
    }
    return results
  }

  /** Read all project tasks as flat array */
  readProjectTasks() {
    const tasks = []
    const projects = this.readProjectsWithTasks()
    for (const proj of projects) {
      for (const t of (proj.tasks || [])) {
        tasks.push(this.normalizeTask(t, proj.id))
      }
    }
    return tasks
  }

  /** Find all tasks (standalone + project) */
  findAllTasks() {
    return [...this.readProjectTasks(), ...this.readStandaloneTasks()]
  }

  /** Find a task by ID, returns task and its source */
  findTaskById(taskId) {
    const standalone = this.readStandaloneTasks()
    const st = standalone.find(t => t.id === taskId)
    if (st) return { task: st, source: 'standalone' }
    const projectTasks = this.readProjectTasks()
    const pt = projectTasks.find(t => t.id === taskId)
    if (pt && pt.projectId) return { task: pt, source: pt.projectId }
    return null
  }

  /** Update a task in a project */
  updateProjectTask(projectId, taskId, updates) {
    const meta = this.readProjectMeta(projectId)
    if (!meta) return false
    const tasks = meta.tasks || []
    const idx = tasks.findIndex(t => t.id === taskId)
    if (idx === -1) return false
    const merged = { ...tasks[idx], ...updates, updatedAt: new Date().toISOString() }
    if (updates.assignees && updates.assignees.length > 0) {
      merged.assignedAgent = updates.assignees[0]
    }
    tasks[idx] = merged
    meta.tasks = tasks
    this.writeProjectMeta(projectId, meta)
    return true
  }

  /** Delete a task from a project */
  deleteProjectTask(projectId, taskId) {
    const meta = this.readProjectMeta(projectId)
    if (!meta) return false
    const tasks = meta.tasks || []
    const idx = tasks.findIndex(t => t.id === taskId)
    if (idx === -1) return false
    tasks.splice(idx, 1)
    meta.tasks = tasks
    this.writeProjectMeta(projectId, meta)
    return true
  }

  /**
   * Read the content of a task's output file
   * @param {object} task - Task with optional output path
   * @returns {string|null} file content or null if not available
   */
  readTaskOutput(task) {
    if (!task || !task.output) return null
    const outputPath = resolve(PROJECT_ROOT, task.output)
    try {
      if (!existsSync(outputPath)) return null
      return readFileSync(outputPath, 'utf-8')
    } catch (err) {
      logger.debug('task-repo', 'failed to read task output', { outputPath, error: err.message })
      return null
    }
  }

  /** Update a task in-place (finds it wherever it is) */
  updateTaskInPlace(taskId, updates) {
    const standalone = this.readStandaloneTasks()
    const sIdx = standalone.findIndex(t => t.id === taskId)
    if (sIdx !== -1) {
      const merged = { ...standalone[sIdx], ...updates, updatedAt: new Date().toISOString() }
      if (updates.assignees) merged.assignedAgent = updates.assignees[0] || undefined
      standalone[sIdx] = merged
      this.writeStandaloneTasks(standalone)
      return merged
    }
    const projectTasks = this.readProjectTasks()
    const pt = projectTasks.find(t => t.id === taskId)
    if (pt && pt.projectId) {
      const success = this.updateProjectTask(pt.projectId, taskId, updates)
      if (success) return { ...pt, ...updates, updatedAt: new Date().toISOString() }
    }
    return null
  }
}

const taskRepo = new TaskRepository()

module.exports = { TaskRepository, taskRepo }
