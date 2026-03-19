'use strict'
/**
 * TaskCleanup — 批量删除和清理任务
 */
const { taskRepo } = require('../repo/task.cjs')

// Lazy require to avoid circular
let _isTerminal
function isTerminal(status) {
  if (!_isTerminal) _isTerminal = require('../../entity/task/index.cjs').isTerminal
  return _isTerminal(status)
}

/**
 * 批量删除匹配条件的任务
 * @param {string[]} statuses - 要删除的状态列表
 * @param {number} [olderThanDays] - 仅删除更新时间超过 N 天的
 * @returns {{ deleted: number }}
 */
function deleteBatch(statuses, olderThanDays) {
  const statusSet = new Set(statuses)
  const cutoff = olderThanDays != null
    ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    : null

  const shouldRemove = (task) => {
    if (!statusSet.has(task.status)) return false
    if (cutoff != null) {
      const updatedAt = new Date(task.updatedAt).getTime()
      if (updatedAt > cutoff) return false
    }
    return true
  }

  let deleted = 0

  // Standalone tasks
  const standalone = taskRepo.readStandaloneTasks()
  const kept = standalone.filter(t => !shouldRemove(t))
  deleted += standalone.length - kept.length
  if (kept.length !== standalone.length) {
    taskRepo.writeStandaloneTasks(kept)
  }

  // Project tasks
  const projects = taskRepo.readProjectsWithTasks()
  for (const proj of projects) {
    const tasks = proj.tasks || []
    const keptTasks = tasks.filter(t => !shouldRemove(t))
    const removed = tasks.length - keptTasks.length
    if (removed > 0) {
      const meta = taskRepo.readProjectMeta(proj.id)
      if (meta) {
        meta.tasks = keptTasks
        taskRepo.writeProjectMeta(proj.id, meta)
      }
      deleted += removed
    }
  }

  return { deleted }
}

/**
 * 清理 rework 任务（去重 + 关闭孤儿）
 * @returns {{ deletedDuplicates: number, closedOrphans: number, total: number }}
 */
function cleanupReworks() {
  let deletedDuplicates = 0
  let closedOrphans = 0

  const allTasks = taskRepo.findAllTasks()

  // 1. Deduplicate: group by reworkFromId, keep newest
  const reworkGroups = new Map()
  for (const t of allTasks) {
    if (!t.reworkFromId) continue
    const group = reworkGroups.get(t.reworkFromId) || []
    group.push(t)
    reworkGroups.set(t.reworkFromId, group)
  }

  reworkGroups.forEach((group) => {
    if (group.length <= 1) return
    group.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    for (let i = 1; i < group.length; i++) {
      const task = group[i]
      if (!isTerminal(task.status)) {
        _deleteTask(task)
        deletedDuplicates++
      }
    }
  })

  // 2. Close orphan reworks: parent is terminal but rework is still active
  const freshTasks = taskRepo.findAllTasks()
  for (const t of freshTasks) {
    if (!t.reworkFromId) continue
    if (isTerminal(t.status)) continue

    const parent = freshTasks.find(p => p.id === t.reworkFromId)
    if (parent && isTerminal(parent.status)) {
      taskRepo.updateTaskInPlace(t.id, {
        status: 'failed',
        output: `Closed: parent task ${t.reworkFromId} already ${parent.status}`,
      })
      closedOrphans++
    }
  }

  return { deletedDuplicates, closedOrphans, total: deletedDuplicates + closedOrphans }
}

function _deleteTask(task) {
  if (task.projectId) {
    taskRepo.deleteProjectTask(task.projectId, task.id)
  } else {
    const standalone = taskRepo.readStandaloneTasks()
    const filtered = standalone.filter(t => t.id !== task.id)
    if (filtered.length !== standalone.length) {
      taskRepo.writeStandaloneTasks(filtered)
    }
  }
}

module.exports = { deleteBatch, cleanupReworks }
