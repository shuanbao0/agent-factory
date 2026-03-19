'use strict'
const { readFileSync, writeFileSync, truncateSync, statSync, existsSync, rmSync } = require('fs')
const { join } = require('path')
const { ROOT } = require('./env-loader.cjs')

const COSTS_FILE = join(ROOT, 'config', 'autopilot-costs.jsonl')
const EVENTS_FILE = join(ROOT, 'config', 'autopilot-events.jsonl')
const TASKS_FILE = join(ROOT, 'config', 'tasks.json')

/**
 * Snapshot a JSONL file's current size for later restore.
 * @param {string} filePath
 * @returns {number} byte size
 */
function snapshotJsonl(filePath) {
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}

/**
 * Restore a JSONL file to a previously captured size (truncate appended content).
 * @param {string} filePath
 * @param {number} size
 */
function restoreJsonl(filePath, size) {
  try {
    if (existsSync(filePath)) {
      truncateSync(filePath, size)
    }
  } catch { /* ignore */ }
}

/**
 * Remove test tasks (IDs starting with zzz-test-) from tasks.json.
 * @param {string[]} taskIds
 */
function cleanupTestTasks(taskIds) {
  if (!taskIds || taskIds.length === 0) return
  try {
    const raw = readFileSync(TASKS_FILE, 'utf8')
    const tasks = JSON.parse(raw)
    if (!Array.isArray(tasks)) return
    const filtered = tasks.filter(t => !taskIds.includes(t.id))
    if (filtered.length !== tasks.length) {
      writeFileSync(TASKS_FILE, JSON.stringify(filtered, null, 2) + '\n')
    }
  } catch { /* tasks.json may not exist */ }
}

/**
 * Remove test project directories (projects/zzz-test-*).
 * @param {string[]} projectIds
 */
function cleanupTestProjects(projectIds) {
  if (!projectIds || projectIds.length === 0) return
  for (const id of projectIds) {
    const dir = join(ROOT, 'projects', id)
    try {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
      }
    } catch { /* ignore */ }
  }
}

module.exports = {
  snapshotJsonl,
  restoreJsonl,
  cleanupTestTasks,
  cleanupTestProjects,
  COSTS_FILE,
  EVENTS_FILE,
  TASKS_FILE,
}
