'use strict'
/**
 * TaskRepository — 任务 CRUD（DB 为主 + .project-meta.json 兼容写入）
 *
 * 数据源：SQLite tasks 表（唯一读取源）
 * 兼容写入：projects/{projectId}/.project-meta.json（Gateway/Agent 读取项目元数据）
 *
 * 架构说明：
 * - 读操作全部走 DB（索引查询，支持过滤和分页）
 * - 写操作写 DB + 同步更新 .project-meta.json 中的 tasks 数组（保持 autopilot 兼容）
 * - 独立任务（无 projectId）只写 DB，不再写 config/tasks.json
 */
const { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } = require('fs')
const { join, resolve, dirname } = require('path')
const { BaseRepository } = require('./base.cjs')
const { PROJECT_ROOT, PROJECTS_DIR } = require('../common/paths.cjs')
const logger = require('../common/logger.cjs')
const {
  upsertTask, upsertTasksBatch, findAllTasksFromDb, findTaskByIdFromDb,
  deleteTaskFromDb, deleteProjectTasksNotIn, replaceStandaloneTasks,
} = require('../db/queries/task-queries.cjs')

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
  /** Normalize legacy task fields (e.g. 'running' -> 'in_progress') */
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

  /** Read standalone tasks from DB (tasks without projectId) */
  readStandaloneTasks() {
    return findAllTasksFromDb().filter(t => !t.projectId)
  }

  /** Write standalone tasks to DB */
  writeStandaloneTasks(tasks) {
    const normalized = tasks.map(t => this.normalizeTask(t))
    replaceStandaloneTasks(normalized)
  }

  /** Read project meta from file (non-task fields still in file) */
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

  /** Write project meta to file + sync tasks to DB */
  writeProjectMeta(projectId, meta) {
    const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
    atomicWrite(metaPath, JSON.stringify(meta, null, 2) + '\n')

    // 同步 tasks 到 DB
    if (Array.isArray(meta.tasks)) {
      const normalized = meta.tasks.map(t => this.normalizeTask(t, projectId))
      upsertTasksBatch(normalized)
      deleteProjectTasksNotIn(projectId, normalized.map(t => t.id))
    }
  }

  /**
   * Read all project tasks (with normalization).
   * Returns raw project objects with tasks array (for autopilot compatibility).
   * Tasks are read from DB but merged with project meta from file.
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
            // Tasks from DB (single source of truth, dual-write ensures consistency)
            meta.tasks = findAllTasksFromDb({ projectId: dir.name })
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
                // Tasks from DB (single source of truth, dual-write ensures consistency)
                meta.tasks = findAllTasksFromDb({ projectId: subId })
                results.push({ id: subId, ...meta })
              } catch (err) {
                logger.warn('task-repo', 'failed to parse sub-project meta', { error: err.message })
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

  /** Read all project tasks as flat array from DB */
  readProjectTasks() {
    return findAllTasksFromDb().filter(t => t.projectId)
  }

  /** Find all tasks (standalone + project) from DB */
  findAllTasks(opts) {
    return findAllTasksFromDb(opts)
  }

  /** Find a task by ID from DB, returns task and its source */
  findTaskById(taskId) {
    const task = findTaskByIdFromDb(taskId)
    if (!task) return null
    const source = task.projectId || 'standalone'
    return { task, source }
  }

  /** Update a task in a project (file + DB) */
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
    // writeProjectMeta handles both file + DB sync
    this.writeProjectMeta(projectId, meta)
    return true
  }

  /** Delete a task from a project (file + DB) */
  deleteProjectTask(projectId, taskId) {
    const meta = this.readProjectMeta(projectId)
    if (!meta) return false
    const tasks = meta.tasks || []
    const idx = tasks.findIndex(t => t.id === taskId)
    if (idx === -1) return false
    tasks.splice(idx, 1)
    meta.tasks = tasks
    // writeProjectMeta handles both file + DB sync
    this.writeProjectMeta(projectId, meta)
    deleteTaskFromDb(taskId)
    return true
  }

  /**
   * Read the content of a task's output file(s).
   *
   * task.output can be:
   *   - a single file path: "projects/foo/docs/report.md"
   *   - comma/newline-separated paths: "a.md, b.md, c.md"
   *   - an array of paths: ["a.md", "b.md"]
   *   - inline content (legacy): a string that isn't a path
   *
   * Returns concatenated content from all existing files (each prefixed with
   * a "# <path>" header), or null if no paths resolve to readable files.
   * For inline-content task.output (no path-like tokens), returns it as-is.
   *
   * @param {object} task
   * @returns {string|null}
   */
  readTaskOutput(task) {
    if (!task || !task.output) return null

    const raw = task.output
    const tokens = Array.isArray(raw)
      ? raw
      : String(raw).split(/[\n,]+/).map(s => s.trim()).filter(Boolean)

    if (tokens.length === 0) return null

    const contents = []
    let sawPathLike = false
    for (const token of tokens) {
      // Skip tokens that don't look like file paths (no slash, no .ext) —
      // those are likely inline text, not a path.
      if (!/[\\/]/.test(token) && !/\.[a-z0-9]{1,8}$/i.test(token)) continue
      sawPathLike = true
      const abs = resolve(PROJECT_ROOT, token)
      try {
        if (!existsSync(abs)) continue
        const body = readFileSync(abs, 'utf-8')
        contents.push(tokens.length > 1 ? `# ${token}\n\n${body}` : body)
      } catch (err) {
        logger.debug('task-repo', 'failed to read task output path', { path: abs, error: err.message })
      }
    }

    if (contents.length > 0) return contents.join('\n\n---\n\n')
    // No path-like tokens at all → treat original as inline content (legacy).
    if (!sawPathLike && typeof raw === 'string') return raw
    return null
  }

  /** Update a task in-place via DB + sync to file if project task */
  updateTaskInPlace(taskId, updates) {
    const found = this.findTaskById(taskId)
    if (!found) return null

    const { task, source } = found
    const merged = { ...task, ...updates, updatedAt: new Date().toISOString() }
    if (updates.assignees) merged.assignedAgent = updates.assignees[0] || undefined

    // Update DB
    upsertTask(merged)

    // If project task, also update .project-meta.json
    if (source !== 'standalone' && merged.projectId) {
      const meta = this.readProjectMeta(merged.projectId)
      if (meta && Array.isArray(meta.tasks)) {
        const idx = meta.tasks.findIndex(t => t.id === taskId)
        if (idx !== -1) {
          meta.tasks[idx] = merged
        } else {
          meta.tasks.push(merged)
        }
        const metaPath = join(PROJECTS_DIR, merged.projectId, '.project-meta.json')
        atomicWrite(metaPath, JSON.stringify(meta, null, 2) + '\n')
      }
    }

    return merged
  }
}

const taskRepo = new TaskRepository()

module.exports = { TaskRepository, taskRepo }
