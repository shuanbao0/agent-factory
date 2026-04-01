#!/usr/bin/env node
/**
 * prepare-prompt.mjs — 为 Codex 执行生成 PROMPT.md
 *
 * 从任务系统读取任务信息，加载任务标准、部门标准、项目标准，
 * 生成标准化的 PROMPT.md 供 Codex 使用。
 *
 * Usage:
 *   node skills/task-api/scripts/prepare-prompt.mjs --task <taskId> --workdir <path>
 *   node skills/task-api/scripts/prepare-prompt.mjs --goal "描述" --workdir <path>
 *   node skills/task-api/scripts/prepare-prompt.mjs --goal "描述" --dept apple-dev --workdir <path>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { createRequire } from 'module'

// ── Resolve project root ─────────────────────────────────────────

function findProjectRoot() {
  // Walk up from script location to find project root
  let dir = resolve(new URL('.', import.meta.url).pathname)
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'core', 'index.cjs'))) return dir
    if (existsSync(join(dir, 'config', 'base-rules.md'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  const cwd = process.cwd()
  if (existsSync(join(cwd, 'core', 'index.cjs'))) return cwd
  throw new Error('Cannot find Agent Factory project root')
}

const PROJECT_ROOT = findProjectRoot()
const require = createRequire(join(PROJECT_ROOT, 'package.json'))

// ── Load core modules ─────────────────────────────────────────────

let taskStandards, deptStandards, projectStandards, taskRepo

try {
  taskStandards = require('./core/common/task-standards.cjs')
  deptStandards = require('./core/common/dept-standards.cjs')
  projectStandards = require('./core/common/project-standards.cjs')
  taskRepo = require('./core/repo/task.cjs').taskRepo
} catch (err) {
  // Graceful degradation — can still generate basic prompt without core
  console.error('[prepare-prompt] Warning: Could not load core modules:', err.message)
}

// ── Parse arguments ───────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { task: null, goal: null, dept: null, workdir: null, taskType: null }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--task': opts.task = args[++i]; break
      case '--goal': opts.goal = args[++i]; break
      case '--dept': opts.dept = args[++i]; break
      case '--workdir': opts.workdir = args[++i]; break
      case '--type': opts.taskType = args[++i]; break
      case '--help':
        console.log(`Usage:
  --task <taskId>    Load task from Agent Factory task system
  --goal <text>      Task goal description (if no --task)
  --dept <deptId>    Department ID (for loading dept standards)
  --workdir <path>   Output directory for PROMPT.md (required)
  --type <taskType>  Task type (coding, testing, etc.)
  --help             Show this help`)
        process.exit(0)
    }
  }

  if (!opts.workdir) {
    console.error('Error: --workdir is required')
    process.exit(1)
  }
  if (!opts.task && !opts.goal) {
    console.error('Error: --task or --goal is required')
    process.exit(1)
  }

  return opts
}

// ── Load task info from task system ────────────────────────────────

function loadTaskInfo(taskId) {
  if (!taskRepo) return null
  try {
    const allTasks = taskRepo.readAllTasks()
    return allTasks.find(t => t.id === taskId) || null
  } catch {
    return null
  }
}

// ── Build prompt content ──────────────────────────────────────────

function buildPrompt(opts) {
  const parts = []
  let taskName = opts.goal || 'Coding task'
  let taskDescription = ''
  let taskType = opts.taskType || 'coding'
  let projectId = null
  let deptId = opts.dept || null

  // Load task info if taskId provided
  if (opts.task) {
    const task = loadTaskInfo(opts.task)
    if (task) {
      taskName = task.name || taskName
      taskDescription = task.description || ''
      taskType = task.type || taskType
      projectId = task.projectId || null
      if (projectId && !deptId) {
        // Extract dept from projectId (format: dept/slug)
        const slashIdx = projectId.indexOf('/')
        if (slashIdx > 0) deptId = projectId.slice(0, slashIdx)
      }
    }
  }

  // Header
  parts.push(`# 任务: ${taskName}`)
  parts.push('')

  if (taskDescription) {
    parts.push(`## 任务描述`)
    parts.push(taskDescription)
    parts.push('')
  }

  if (opts.goal && opts.task) {
    parts.push(`## 补充说明`)
    parts.push(opts.goal)
    parts.push('')
  }

  // Task standards
  if (taskStandards) {
    try {
      const standards = taskStandards.getStandardsForType(taskType)
      if (standards.typeStandards) {
        parts.push(`## 任务类型标准 (${taskType})`)
        parts.push(standards.typeStandards)
        parts.push('')
      }
      if (standards.generalStandards && !standards.typeStandards) {
        parts.push(`## 通用任务标准`)
        parts.push(standards.generalStandards)
        parts.push('')
      }
    } catch { /* skip */ }
  }

  // Department standards
  if (deptStandards && deptId) {
    try {
      const { generalStandards, typeStandards, customStandards } = deptStandards.getStandardsForDept(deptId)
      const deptParts = []
      if (typeStandards) deptParts.push(typeStandards)
      if (customStandards) deptParts.push(customStandards)
      if (deptParts.length === 0 && generalStandards) deptParts.push(generalStandards)
      if (deptParts.length > 0) {
        parts.push(`## 部门执行标准 (${deptId})`)
        parts.push(deptParts.join('\n\n'))
        parts.push('')
      }
    } catch { /* skip */ }
  }

  // Project standards
  if (projectStandards && projectId) {
    try {
      const projStd = projectStandards.loadProjectStandards()
      if (projStd?.boundaries) {
        parts.push(`## 项目边界规则`)
        parts.push(projStd.boundaries)
        parts.push('')
      }
    } catch { /* skip */ }
  }

  // Output guidelines
  parts.push(`## 产出要求`)
  parts.push(`- 所有产出写入当前工作目录`)
  parts.push(`- 代码必须可编译/运行`)
  parts.push(`- 如有测试，必须通过`)
  parts.push(`- 完成后确保文件已保存`)
  parts.push('')

  return parts.join('\n')
}

// ── Main ──────────────────────────────────────────────────────────

const opts = parseArgs()
const content = buildPrompt(opts)

// Ensure workdir exists
if (!existsSync(opts.workdir)) {
  mkdirSync(opts.workdir, { recursive: true })
}

const outputPath = join(opts.workdir, 'PROMPT.md')
writeFileSync(outputPath, content)

// Output the path for the agent to use
console.log(outputPath)
