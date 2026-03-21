#!/usr/bin/env node
/**
 * migrate-multi-project.mjs — Migrate 1:1 dept=project to 1:N multi-project
 *
 * Idempotent: safe to run multiple times.
 *
 * Logic:
 * 1. Scan projects/ for top-level directories with .project-meta.json
 * 2. If directory name matches a known department ID, move contents to {dept}/default/
 * 3. Update tasks.json: projectId "dept" → "dept/default"
 */
import { existsSync, readdirSync, mkdirSync, renameSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import paths from '../../core/common/paths.mjs'

const { PROJECTS_DIR, DEPARTMENTS_DIR, TASKS_FILE } = paths

const dryRun = process.argv.includes('--dry-run')
const log = (msg) => console.log(`${dryRun ? '[DRY-RUN] ' : ''}${msg}`)

function getKnownDepartments() {
  if (!existsSync(DEPARTMENTS_DIR)) return new Set()
  return new Set(
    readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  )
}

function migrateProjects() {
  if (!existsSync(PROJECTS_DIR)) {
    log('No projects/ directory, nothing to migrate.')
    return []
  }

  const knownDepts = getKnownDepartments()
  const migratedDepts = []

  const topDirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())

  for (const dir of topDirs) {
    const deptId = dir.name
    const deptDir = join(PROJECTS_DIR, deptId)
    const metaPath = join(deptDir, '.project-meta.json')

    // Only migrate if: has .project-meta.json AND is a known department
    if (!existsSync(metaPath)) continue
    if (!knownDepts.has(deptId)) continue

    // Check if already migrated (default/ sub-directory exists with its own meta)
    const defaultDir = join(deptDir, 'default')
    const defaultMeta = join(defaultDir, '.project-meta.json')
    if (existsSync(defaultMeta)) {
      log(`${deptId}: already migrated (default/ exists), skipping.`)
      continue
    }

    log(`${deptId}: migrating to ${deptId}/default/`)

    if (!dryRun) {
      // Create default/ directory
      mkdirSync(defaultDir, { recursive: true })

      // Move all files and directories (except default/ itself) into default/
      const entries = readdirSync(deptDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === 'default') continue
        const src = join(deptDir, entry.name)
        const dest = join(defaultDir, entry.name)
        renameSync(src, dest)
      }

      // Update .project-meta.json department field
      try {
        const meta = JSON.parse(readFileSync(join(defaultDir, '.project-meta.json'), 'utf-8'))
        meta.department = deptId
        writeFileSync(join(defaultDir, '.project-meta.json'), JSON.stringify(meta, null, 2))
      } catch { /* skip meta update errors */ }
    }

    migratedDepts.push(deptId)
  }

  return migratedDepts
}

function migrateTasks(migratedDepts) {
  if (migratedDepts.length === 0) return
  if (!existsSync(TASKS_FILE)) {
    log('No tasks.json, skipping task migration.')
    return
  }

  try {
    const raw = readFileSync(TASKS_FILE, 'utf-8')
    const tasks = JSON.parse(raw)
    if (!Array.isArray(tasks)) return

    const deptSet = new Set(migratedDepts)
    let changed = false

    for (const task of tasks) {
      if (task.projectId && deptSet.has(task.projectId)) {
        log(`Task ${task.id}: projectId "${task.projectId}" → "${task.projectId}/default"`)
        if (!dryRun) {
          task.projectId = `${task.projectId}/default`
        }
        changed = true
      }
    }

    if (changed && !dryRun) {
      writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2))
      log(`Updated ${TASKS_FILE}`)
    }
  } catch (e) {
    log(`Warning: failed to migrate tasks: ${e.message}`)
  }
}

// Main
log('=== Multi-Project Migration ===')
const migratedDepts = migrateProjects()
migrateTasks(migratedDepts)

if (migratedDepts.length > 0) {
  log(`\nMigrated ${migratedDepts.length} department(s): ${migratedDepts.join(', ')}`)
} else {
  log('\nNo departments needed migration.')
}
