'use strict'
/**
 * db-backfill.cjs — 历史文件数据导入到 SQLite
 *
 * 从 JSONL/JSON 文件导入历史数据到 DB。幂等，可重复运行。
 *
 * 用法：
 *   node scripts/db-backfill.cjs           # 导入所有数据
 *   node scripts/db-backfill.cjs --dry-run # 预览不执行
 */
const { readFileSync, existsSync, readdirSync } = require('fs')
const { join } = require('path')
const { COSTS_FILE, EVENTS_FILE, TASKS_FILE, PROJECTS_DIR, DEPARTMENTS_DIR } = require('../core/common/paths.cjs')
const { getDb, closeDb } = require('../core/db/connection.cjs')

const dryRun = process.argv.includes('--dry-run')

function log(msg) { console.log(`[backfill] ${msg}`) }

// ── 成本数据 ──────────────────────────────────────────────────────

function backfillCosts() {
  if (!existsSync(COSTS_FILE)) { log('No costs file found, skipping'); return 0 }

  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM cost_entries').get().cnt
  if (existing > 0) { log(`cost_entries already has ${existing} rows, skipping`); return 0 }

  const lines = readFileSync(COSTS_FILE, 'utf-8').split('\n').filter(Boolean)
  log(`Importing ${lines.length} cost entries from JSONL...`)
  if (dryRun) return lines.length

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO cost_entries (ts, date, model, input_tokens, output_tokens, cost, source, agent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let imported = 0
  const BATCH = 1000
  for (let i = 0; i < lines.length; i += BATCH) {
    const batch = lines.slice(i, i + BATCH)
    db.transaction(() => {
      for (const line of batch) {
        try {
          const e = JSON.parse(line)
          stmt.run(e.ts, e.date, e.model || 'unknown', e.inputTokens || 0, e.outputTokens || 0, e.cost || 0, e.source || 'unknown', e.agentId || null)
          imported++
        } catch { /* skip malformed */ }
      }
    })()
  }
  log(`Imported ${imported} cost entries`)
  return imported
}

// ── 事件数据 ──────────────────────────────────────────────────────

function backfillEvents() {
  if (!existsSync(EVENTS_FILE)) { log('No events file found, skipping'); return 0 }

  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM events').get().cnt
  if (existing > 0) { log(`events already has ${existing} rows, skipping`); return 0 }

  const lines = readFileSync(EVENTS_FILE, 'utf-8').split('\n').filter(Boolean)
  log(`Importing ${lines.length} events from JSONL...`)
  if (dryRun) return lines.length

  const stmt = db.prepare('INSERT INTO events (type, ts, payload) VALUES (?, ?, ?)')

  let imported = 0
  const BATCH = 1000
  for (let i = 0; i < lines.length; i += BATCH) {
    const batch = lines.slice(i, i + BATCH)
    db.transaction(() => {
      for (const line of batch) {
        try {
          const e = JSON.parse(line)
          const { type, ts, ...rest } = e
          if (type && ts) {
            stmt.run(type, ts, JSON.stringify(rest))
            imported++
          }
        } catch { /* skip */ }
      }
    })()
  }
  log(`Imported ${imported} events`)
  return imported
}

// ── 任务数据 ──────────────────────────────────────────────────────

function backfillTasks() {
  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM tasks').get().cnt
  if (existing > 0) { log(`tasks already has ${existing} rows, skipping`); return 0 }

  const { taskToRow } = require('../core/db/queries/task-queries.cjs')
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tasks (
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

  const transStmt = db.prepare(`
    INSERT OR IGNORE INTO task_transitions (task_id, from_st, to_st, actor, reason, at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  let taskCount = 0
  let transCount = 0

  function normalizeAndInsert(raw, projectId) {
    let status = raw.status || 'pending'
    if (status === 'running') status = 'in_progress'
    const assignees = Array.isArray(raw.assignees) ? raw.assignees
      : typeof raw.assignedAgent === 'string' && raw.assignedAgent ? [raw.assignedAgent] : []

    const task = {
      id: raw.id, name: raw.name || 'untitled', description: raw.description,
      projectId: projectId || null, phase: raw.phase, status, priority: raw.priority || 'P1',
      assignees, assignedAgent: assignees[0], creator: raw.creator || 'user',
      progress: raw.progress || 0, dependencies: raw.dependencies || [],
      output: raw.output, tags: raw.tags, type: raw.type,
      parentTaskId: raw.parentTaskId, quality: raw.quality,
      reworkCount: raw.reworkCount || 0, reworkFromId: raw.reworkFromId,
      failureReason: raw.failureReason,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
      completedAt: raw.completedAt,
    }

    stmt.run(taskToRow(task))
    taskCount++

    // Import transition history
    if (Array.isArray(raw._transitions)) {
      for (const t of raw._transitions) {
        transStmt.run(raw.id, t.from, t.to, t.actor || 'system', t.reason || null, t.at)
        transCount++
      }
    }
  }

  // Standalone tasks
  if (existsSync(TASKS_FILE)) {
    try {
      const data = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'))
      const tasks = data.tasks || []
      log(`Importing ${tasks.length} standalone tasks...`)
      if (!dryRun) {
        db.transaction(() => {
          for (const t of tasks) normalizeAndInsert(t, null)
        })()
      }
    } catch (err) { log(`Failed to parse tasks.json: ${err.message}`) }
  }

  // Project tasks
  if (existsSync(PROJECTS_DIR)) {
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      const metaPath = join(PROJECTS_DIR, dir.name, '.project-meta.json')
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
          const tasks = meta.tasks || []
          if (tasks.length > 0) {
            log(`Importing ${tasks.length} tasks from project ${dir.name}...`)
            if (!dryRun) {
              db.transaction(() => {
                for (const t of tasks) normalizeAndInsert(t, dir.name)
              })()
            }
          }
        } catch { /* skip */ }
      }
      // Sub-projects
      try {
        const subDirs = readdirSync(join(PROJECTS_DIR, dir.name), { withFileTypes: true })
          .filter(sd => sd.isDirectory() && !sd.name.startsWith('.'))
        for (const sd of subDirs) {
          const subMetaPath = join(PROJECTS_DIR, dir.name, sd.name, '.project-meta.json')
          if (existsSync(subMetaPath)) {
            try {
              const meta = JSON.parse(readFileSync(subMetaPath, 'utf-8'))
              const tasks = meta.tasks || []
              const subId = `${dir.name}/${sd.name}`
              if (tasks.length > 0) {
                log(`Importing ${tasks.length} tasks from project ${subId}...`)
                if (!dryRun) {
                  db.transaction(() => {
                    for (const t of tasks) normalizeAndInsert(t, subId)
                  })()
                }
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    }
  }

  log(`Imported ${taskCount} tasks, ${transCount} transitions`)
  return taskCount
}

// ── KPI 快照 ──────────────────────────────────────────────────────

function backfillKpiSnapshots() {
  if (!existsSync(DEPARTMENTS_DIR)) return 0

  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM kpi_snapshots').get().cnt
  if (existing > 0) { log(`kpi_snapshots already has ${existing} rows, skipping`); return 0 }

  const stmt = db.prepare('INSERT INTO kpi_snapshots (dept_id, ts, kpis) VALUES (?, ?, ?)')
  let total = 0

  const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
  for (const dir of dirs) {
    const kpiFile = join(DEPARTMENTS_DIR, dir.name, 'kpi-history.jsonl')
    if (!existsSync(kpiFile)) continue
    try {
      const lines = readFileSync(kpiFile, 'utf-8').split('\n').filter(Boolean)
      log(`Importing ${lines.length} KPI snapshots for ${dir.name}...`)
      if (!dryRun) {
        db.transaction(() => {
          for (const line of lines) {
            try {
              const e = JSON.parse(line)
              stmt.run(dir.name, e.timestamp, JSON.stringify(e.kpis))
              total++
            } catch { /* skip */ }
          }
        })()
      }
    } catch { /* skip */ }
  }

  log(`Imported ${total} KPI snapshots`)
  return total
}

// ── 部门循环历史 ──────────────────────────────────────────────────

function backfillDeptCycles() {
  if (!existsSync(DEPARTMENTS_DIR)) return 0

  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM dept_cycles').get().cnt
  if (existing > 0) { log(`dept_cycles already has ${existing} rows, skipping`); return 0 }

  const stmt = db.prepare(`
    INSERT INTO dept_cycles (dept_id, cycle_num, started_at, completed_at, elapsed_sec, result, tokens_used)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  let total = 0

  const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
  for (const dir of dirs) {
    const stateFile = join(DEPARTMENTS_DIR, dir.name, 'state.json')
    if (!existsSync(stateFile)) continue
    try {
      const state = JSON.parse(readFileSync(stateFile, 'utf-8'))
      const history = state.history || []
      if (history.length > 0) {
        log(`Importing ${history.length} cycle records for ${dir.name}...`)
        if (!dryRun) {
          db.transaction(() => {
            for (const h of history) {
              stmt.run(dir.name, h.cycle || 0, h.startedAt || '', h.completedAt || null, h.elapsedSec || null, h.result || null, 0)
              total++
            }
          })()
        }
      }
    } catch { /* skip */ }
  }

  log(`Imported ${total} department cycle records`)
  return total
}

// ── Agent 元数据 ─────────────────────────────────────────────────

function backfillAgents() {
  const AGENTS_DIR = join(require('../core/common/paths.cjs').DATA_DIR, 'agents')
  if (!existsSync(AGENTS_DIR)) { log('No agents dir, skipping'); return 0 }

  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM agents').get().cnt
  if (existing > 0) { log(`agents already has ${existing} rows, skipping`); return 0 }

  const { agentToRow } = require('../core/db/queries/agent-queries.cjs')
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO agents (id, template_id, name, role, description, model, skills, peers, department, created_at, updated_at)
    VALUES (@id, @template_id, @name, @role, @description, @model, @skills, @peers, @department, @created_at, @updated_at)
  `)

  let total = 0
  const dirs = readdirSync(AGENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
  log(`Importing ${dirs.length} agents...`)
  if (!dryRun) {
    db.transaction(() => {
      for (const dir of dirs) {
        const metaFile = join(AGENTS_DIR, dir.name, 'agent.json')
        if (!existsSync(metaFile)) continue
        try {
          const meta = JSON.parse(readFileSync(metaFile, 'utf-8'))
          stmt.run(agentToRow({ ...meta, id: meta.id || dir.name }))
          total++
        } catch { /* skip */ }
      }
    })()
  } else { total = dirs.length }

  log(`Imported ${total} agents`)
  return total
}

// ── 项目元数据 ───────────────────────────────────────────────────

function backfillProjects() {
  if (!existsSync(PROJECTS_DIR)) { log('No projects dir, skipping'); return 0 }

  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM projects').get().cnt
  if (existing > 0) { log(`projects already has ${existing} rows, skipping`); return 0 }

  const { projectToRow } = require('../core/db/queries/project-queries.cjs')
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO projects (id, name, description, status, current_phase, total_phases, phases, department, assigned_agents, created_at, updated_at)
    VALUES (@id, @name, @description, @status, @current_phase, @total_phases, @phases, @department, @assigned_agents, @created_at, @updated_at)
  `)

  let total = 0

  function importProject(projectId) {
    const metaFile = join(PROJECTS_DIR, projectId, '.project-meta.json')
    if (!existsSync(metaFile)) return
    try {
      const meta = JSON.parse(readFileSync(metaFile, 'utf-8'))
      const row = projectToRow({ ...meta, id: projectId })
      stmt.run(row)
      total++
    } catch { /* skip */ }
  }

  const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
  log(`Scanning ${dirs.length} project directories...`)
  if (!dryRun) {
    db.transaction(() => {
      for (const dir of dirs) {
        importProject(dir.name)
        try {
          const subDirs = readdirSync(join(PROJECTS_DIR, dir.name), { withFileTypes: true })
            .filter(sd => sd.isDirectory() && !sd.name.startsWith('.'))
          for (const sd of subDirs) importProject(`${dir.name}/${sd.name}`)
        } catch { /* skip */ }
      }
    })()
  }

  log(`Imported ${total} projects`)
  return total
}

// ── 部门配置 ─────────────────────────────────────────────────────

function backfillDeptConfigs() {
  if (!existsSync(DEPARTMENTS_DIR)) { log('No departments dir, skipping'); return 0 }

  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM dept_config').get().cnt
  if (existing > 0) { log(`dept_config already has ${existing} rows, skipping`); return 0 }

  const { deptConfigToRow } = require('../core/db/queries/dept-config-queries.cjs')
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO dept_config (id, name, head, interval_s, enabled, agents, budget, kpis, workflow, updated_at)
    VALUES (@id, @name, @head, @interval_s, @enabled, @agents, @budget, @kpis, @workflow, @updated_at)
  `)

  let total = 0
  const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
  log(`Importing ${dirs.length} department configs...`)
  if (!dryRun) {
    db.transaction(() => {
      for (const dir of dirs) {
        const configFile = join(DEPARTMENTS_DIR, dir.name, 'config.json')
        if (!existsSync(configFile)) continue
        try {
          const config = JSON.parse(readFileSync(configFile, 'utf-8'))
          stmt.run(deptConfigToRow({ ...config, id: config.id || dir.name }))
          total++
        } catch { /* skip */ }
      }
    })()
  } else { total = dirs.length }

  log(`Imported ${total} department configs`)
  return total
}

// ── 主流程 ──────────────────────────────────────────────────────

function main() {
  log(dryRun ? 'DRY RUN MODE — no data will be written' : 'Starting backfill...')

  const results = {
    costs: backfillCosts(),
    events: backfillEvents(),
    tasks: backfillTasks(),
    kpiSnapshots: backfillKpiSnapshots(),
    deptCycles: backfillDeptCycles(),
    agents: backfillAgents(),
    projects: backfillProjects(),
    deptConfigs: backfillDeptConfigs(),
  }

  log('Backfill complete:')
  for (const [key, count] of Object.entries(results)) {
    log(`  ${key}: ${count}`)
  }

  if (!dryRun) closeDb()
}

main()
