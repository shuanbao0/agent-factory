'use strict'
/**
 * task-queries.cjs — 任务 DB 查询
 *
 * 统一 tasks.json + projects/.project-meta.json 双源，
 * 提供索引查询和分页能力。
 *
 * JSON 数组字段（assignees, dependencies, tags）存为 JSON 文本，
 * quality 存为 JSON blob。读取时自动反序列化。
 */
const { getDb } = require('../connection.cjs')

/** JSON 数组字段列表 */
const JSON_FIELDS = ['assignees', 'dependencies', 'tags', 'quality']

/**
 * 将 task 对象序列化为 DB 行
 * @param {Object} task
 * @returns {Object} DB 行
 */
function taskToRow(task) {
  return {
    id: task.id,
    name: task.name,
    description: task.description || null,
    project_id: task.projectId || null,
    phase: task.phase || null,
    status: task.status || 'pending',
    priority: task.priority || 'P1',
    assignees: JSON.stringify(task.assignees || []),
    assigned_agent: task.assignedAgent || null,
    creator: task.creator || 'user',
    progress: task.progress || 0,
    dependencies: JSON.stringify(task.dependencies || []),
    output: task.output || null,
    tags: task.tags ? JSON.stringify(task.tags) : null,
    type: task.type || null,
    parent_task_id: task.parentTaskId || null,
    quality: task.quality ? JSON.stringify(task.quality) : null,
    rework_count: task.reworkCount || 0,
    rework_from_id: task.reworkFromId || null,
    failure_reason: task.failureReason || null,
    created_at: task.createdAt || new Date().toISOString(),
    updated_at: task.updatedAt || new Date().toISOString(),
    completed_at: task.completedAt || null,
  }
}

/**
 * 将 DB 行反序列化为 task 对象
 * @param {Object} row
 * @returns {Object} task
 */
function rowToTask(row) {
  const task = {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    projectId: row.project_id || null,
    phase: row.phase || undefined,
    status: row.status,
    priority: row.priority,
    assignees: [],
    assignedAgent: row.assigned_agent || undefined,
    creator: row.creator,
    progress: row.progress,
    dependencies: [],
    output: row.output || undefined,
    tags: undefined,
    type: row.type || undefined,
    parentTaskId: row.parent_task_id || undefined,
    quality: undefined,
    reworkCount: row.rework_count || undefined,
    reworkFromId: row.rework_from_id || undefined,
    failureReason: row.failure_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || undefined,
  }

  // 反序列化 JSON 字段
  try { task.assignees = JSON.parse(row.assignees || '[]') } catch { task.assignees = [] }
  try { task.dependencies = JSON.parse(row.dependencies || '[]') } catch { task.dependencies = [] }
  if (row.tags) try { task.tags = JSON.parse(row.tags) } catch { /* skip */ }
  if (row.quality) try { task.quality = JSON.parse(row.quality) } catch { /* skip */ }

  return task
}

/**
 * Upsert 单条任务
 * @param {Object} task - 标准化后的 task 对象
 */
function upsertTask(task) {
  const db = getDb()
  const row = taskToRow(task)
  db.prepare(`
    INSERT OR REPLACE INTO tasks (
      id, name, description, project_id, phase, status, priority,
      assignees, assigned_agent, creator, progress, dependencies,
      output, tags, type, parent_task_id, quality, rework_count,
      rework_from_id, failure_reason, created_at, updated_at, completed_at
    ) VALUES (
      @id, @name, @description, @project_id, @phase, @status, @priority,
      @assignees, @assigned_agent, @creator, @progress, @dependencies,
      @output, @tags, @type, @parent_task_id, @quality, @rework_count,
      @rework_from_id, @failure_reason, @created_at, @updated_at, @completed_at
    )
  `).run(row)
}

/**
 * 批量 upsert 任务（事务包裹）
 * @param {Array<Object>} tasks
 */
function upsertTasksBatch(tasks) {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tasks (
      id, name, description, project_id, phase, status, priority,
      assignees, assigned_agent, creator, progress, dependencies,
      output, tags, type, parent_task_id, quality, rework_count,
      rework_from_id, failure_reason, created_at, updated_at, completed_at
    ) VALUES (
      @id, @name, @description, @project_id, @phase, @status, @priority,
      @assignees, @assigned_agent, @creator, @progress, @dependencies,
      @output, @tags, @type, @parent_task_id, @quality, @rework_count,
      @rework_from_id, @failure_reason, @created_at, @updated_at, @completed_at
    )
  `)
  db.transaction(() => {
    for (const task of tasks) {
      stmt.run(taskToRow(task))
    }
  })()
}

/**
 * 查询所有任务（支持过滤 + 分页）
 *
 * @param {Object} [opts]
 * @param {string} [opts.status] - 状态过滤
 * @param {string} [opts.projectId] - 项目 ID 过滤
 * @param {string} [opts.assignee] - 负责人过滤
 * @param {string} [opts.type] - 任务类型过滤
 * @param {number} [opts.limit] - 分页大小
 * @param {number} [opts.offset] - 分页偏移
 * @returns {Array<Object>} task 对象数组
 */
function findAllTasksFromDb(opts = {}) {
  const db = getDb()
  const conditions = []
  const params = []

  if (opts.status) {
    conditions.push('status = ?')
    params.push(opts.status)
  }
  if (opts.projectId) {
    conditions.push('project_id = ?')
    params.push(opts.projectId)
  }
  if (opts.assignee) {
    conditions.push('assigned_agent = ?')
    params.push(opts.assignee)
  }
  if (opts.type) {
    conditions.push('type = ?')
    params.push(opts.type)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  let sql = `SELECT * FROM tasks ${where} ORDER BY updated_at DESC`

  if (opts.limit) {
    sql += ` LIMIT ?`
    params.push(opts.limit)
    if (opts.offset) {
      sql += ` OFFSET ?`
      params.push(opts.offset)
    }
  }

  return db.prepare(sql).all(...params).map(rowToTask)
}

/**
 * 按 ID 查找任务
 * @param {string} taskId
 * @returns {Object|null} task 对象或 null
 */
function findTaskByIdFromDb(taskId) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
  return row ? rowToTask(row) : null
}

/**
 * 删除任务
 * @param {string} taskId
 * @returns {boolean} 是否成功删除
 */
function deleteTaskFromDb(taskId) {
  const db = getDb()
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
  return result.changes > 0
}

/**
 * 删除项目下所有不在给定 ID 列表中的任务
 * 用于 writeProjectMeta 时同步 DB
 * @param {string} projectId
 * @param {string[]} keepIds - 保留的任务 ID 列表
 */
function deleteProjectTasksNotIn(projectId, keepIds) {
  const db = getDb()
  if (keepIds.length === 0) {
    db.prepare('DELETE FROM tasks WHERE project_id = ?').run(projectId)
    return
  }
  const placeholders = keepIds.map(() => '?').join(',')
  db.prepare(`DELETE FROM tasks WHERE project_id = ? AND id NOT IN (${placeholders})`).run(projectId, ...keepIds)
}

/**
 * 删除所有独立任务（project_id IS NULL），然后批量插入
 * 用于 writeStandaloneTasks 同步
 * @param {Array<Object>} tasks
 */
function replaceStandaloneTasks(tasks) {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM tasks WHERE project_id IS NULL').run()
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO tasks (
        id, name, description, project_id, phase, status, priority,
        assignees, assigned_agent, creator, progress, dependencies,
        output, tags, type, parent_task_id, quality, rework_count,
        rework_from_id, failure_reason, created_at, updated_at, completed_at
      ) VALUES (
        @id, @name, @description, @project_id, @phase, @status, @priority,
        @assignees, @assigned_agent, @creator, @progress, @dependencies,
        @output, @tags, @type, @parent_task_id, @quality, @rework_count,
        @rework_from_id, @failure_reason, @created_at, @updated_at, @completed_at
      )
    `)
    for (const task of tasks) {
      stmt.run(taskToRow(task))
    }
  })()
}

/**
 * 插入一条状态转换记录
 * @param {{ taskId: string, from: string, to: string, actor: string, reason: string, at: string }} transition
 */
function insertTransition(transition) {
  const db = getDb()
  db.prepare(`
    INSERT INTO task_transitions (task_id, from_st, to_st, actor, reason, at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    transition.taskId, transition.from, transition.to,
    transition.actor || 'system', transition.reason || null,
    transition.at
  )
}

/**
 * 查询任务的状态转换历史
 * @param {string} taskId
 * @returns {Array<{ from: string, to: string, actor: string, reason: string, at: string }>}
 */
function getTaskTransitions(taskId) {
  const db = getDb()
  return db.prepare(`
    SELECT from_st AS "from", to_st AS "to", actor, reason, at
    FROM task_transitions WHERE task_id = ? ORDER BY at ASC
  `).all(taskId)
}

module.exports = {
  upsertTask, upsertTasksBatch, findAllTasksFromDb, findTaskByIdFromDb,
  deleteTaskFromDb, deleteProjectTasksNotIn, replaceStandaloneTasks,
  insertTransition, getTaskTransitions,
  taskToRow, rowToTask,
}
