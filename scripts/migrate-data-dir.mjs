#!/usr/bin/env node
/**
 * migrate-data-dir.mjs — 迁移旧版目录结构到 data/ 统一目录
 *
 * 幂等：data/ 已存在且有内容则跳过。
 * 由 agent-factory update 自动调用。
 *
 * Usage:
 *   node scripts/migrate-data-dir.mjs              # 执行迁移
 *   node scripts/migrate-data-dir.mjs --dry-run    # 预览
 */

import { existsSync, readdirSync, renameSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import paths from '../core/common/paths.mjs'

const { PROJECT_ROOT, DATA_DIR } = paths
const DRY_RUN = process.argv.includes('--dry-run')

// 如果 DATA_DIR 就是 PROJECT_ROOT（未启用 data/ 分离），跳过
if (DATA_DIR === PROJECT_ROOT) {
  console.log('DATA_DIR === PROJECT_ROOT, migration not needed.')
  process.exit(0)
}

// 如果 data/agents/ 已经有内容，视为已迁移
const dataAgentsDir = join(DATA_DIR, 'agents')
if (existsSync(dataAgentsDir) && readdirSync(dataAgentsDir).length > 0) {
  console.log('data/agents/ already has content — migration already done.')
  process.exit(0)
}

console.log(`${DRY_RUN ? '[DRY-RUN] ' : ''}Migrating to data/ directory...\n`)

// ── 目录迁移 ─────────────────────────────────────────────────────
const dirMoves = [
  ['agents', 'data/agents'],
  ['workspaces', 'data/workspaces'],
  ['projects', 'data/projects'],
  ['.openclaw-state', 'data/openclaw-state'],
]

for (const [src, dest] of dirMoves) {
  const srcPath = join(PROJECT_ROOT, src)
  const destPath = join(PROJECT_ROOT, dest)
  if (!existsSync(srcPath)) {
    console.log(`  skip: ${src}/ (not found)`)
    continue
  }
  if (existsSync(destPath) && readdirSync(destPath).length > 0) {
    console.log(`  skip: ${dest}/ (already has content)`)
    continue
  }
  console.log(`  move: ${src}/ → ${dest}/`)
  if (!DRY_RUN) {
    mkdirSync(join(PROJECT_ROOT, 'data'), { recursive: true })
    renameSync(srcPath, destPath)
  }
}

// ── 运行时配置文件迁移 ───────────────────────────────────────────
const configDir = join(PROJECT_ROOT, 'data', 'config')
if (!DRY_RUN) mkdirSync(configDir, { recursive: true })

const configFiles = [
  'openclaw.json',
  'models.json',
  'autopilot-state.json',
  'autopilot-costs.jsonl',
  'autopilot-events.jsonl',
  'tasks.json',
  'budget.json',
  'departments.json',
  'mission.md',
]

for (const file of configFiles) {
  const srcPath = join(PROJECT_ROOT, 'config', file)
  const destPath = join(configDir, file)
  if (!existsSync(srcPath)) continue
  if (existsSync(destPath)) {
    console.log(`  skip: config/${file} → data/config/${file} (already exists)`)
    continue
  }
  console.log(`  copy: config/${file} → data/config/${file}`)
  if (!DRY_RUN) copyFileSync(srcPath, destPath)
}

// ── 部门运行时配置迁移 ───────────────────────────────────────────
const srcDeptDir = join(PROJECT_ROOT, 'config', 'departments')
const destDeptDir = join(PROJECT_ROOT, 'data', 'departments')
if (existsSync(srcDeptDir)) {
  if (!DRY_RUN) mkdirSync(destDeptDir, { recursive: true })
  for (const entry of readdirSync(srcDeptDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const deptSrc = join(srcDeptDir, entry.name)
    const deptDest = join(destDeptDir, entry.name)
    if (!DRY_RUN) mkdirSync(deptDest, { recursive: true })
    for (const file of readdirSync(deptSrc)) {
      const fileSrc = join(deptSrc, file)
      const fileDest = join(deptDest, file)
      if (!statSync(fileSrc).isFile()) continue
      if (existsSync(fileDest)) continue
      console.log(`  copy: config/departments/${entry.name}/${file} → data/departments/${entry.name}/${file}`)
      if (!DRY_RUN) copyFileSync(fileSrc, fileDest)
    }
  }
}

// ── 自定义模板迁移 ───────────────────────────────────────────────
const templateMoves = [
  ['templates/agents/custom', 'data/templates/agents/custom'],
  ['templates/departments/custom', 'data/templates/departments/custom'],
]
for (const [src, dest] of templateMoves) {
  const srcPath = join(PROJECT_ROOT, src)
  const destPath = join(PROJECT_ROOT, dest)
  if (!existsSync(srcPath)) continue
  const contents = readdirSync(srcPath).filter(f => f !== '.gitkeep')
  if (contents.length === 0) continue
  console.log(`  move: ${src}/ → ${dest}/`)
  if (!DRY_RUN) {
    mkdirSync(destPath, { recursive: true })
    for (const item of contents) {
      const s = join(srcPath, item)
      const d = join(destPath, item)
      if (!existsSync(d)) renameSync(s, d)
    }
  }
}

// ── 修复 openclaw.json 中的 workspace 绝对路径 ──────────────────
const ocConfigPath = join(configDir, 'openclaw.json')
if (existsSync(ocConfigPath)) {
  try {
    const raw = readFileSync(ocConfigPath, 'utf-8')
    const oldAgentsDir = join(PROJECT_ROOT, 'agents')
    const newAgentsDir = join(DATA_DIR, 'agents')
    if (raw.includes(oldAgentsDir)) {
      console.log(`  fix: openclaw.json workspace paths (${oldAgentsDir} → ${newAgentsDir})`)
      if (!DRY_RUN) {
        const updated = raw.replaceAll(oldAgentsDir, newAgentsDir)
        writeFileSync(ocConfigPath, updated)
      }
    }
  } catch (e) {
    console.log(`  warn: could not fix openclaw.json paths: ${e.message}`)
  }
}

// ── 日志文件迁移到 data/logs/ ────────────────────────────────────
const logsDir = join(PROJECT_ROOT, 'data', 'logs')
if (!DRY_RUN) mkdirSync(logsDir, { recursive: true })

const logFiles = ['autopilot-costs.jsonl', 'autopilot-events.jsonl', '.autopilot-signal']
for (const file of logFiles) {
  // 旧位置: config/ 或 data/config/
  for (const srcBase of [join(PROJECT_ROOT, 'config'), configDir]) {
    const srcPath = join(srcBase, file)
    const destPath = join(logsDir, file)
    if (!existsSync(srcPath) || existsSync(destPath)) continue
    console.log(`  move: ${srcPath.replace(PROJECT_ROOT + '/', '')} → data/logs/${file}`)
    if (!DRY_RUN) renameSync(srcPath, destPath)
    break
  }
}

// 旧版 autopilot-logs 目录
const srcLogs = join(PROJECT_ROOT, 'config', 'autopilot-logs')
if (existsSync(srcLogs)) {
  console.log('  move: config/autopilot-logs/ contents → data/logs/')
  if (!DRY_RUN) {
    for (const f of readdirSync(srcLogs)) {
      const s = join(srcLogs, f)
      const d = join(logsDir, f)
      if (!existsSync(d) && statSync(s).isFile()) renameSync(s, d)
    }
    try { readdirSync(srcLogs).length === 0 && rmSync(srcLogs, { recursive: true }) } catch { /* skip */ }
  }
}

console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}Migration complete.`)
