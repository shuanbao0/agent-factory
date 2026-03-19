'use strict'
/**
 * MissionRepository — 公司/部门任务、报告、升级信息读取
 *
 * 数据源：
 * - config/mission.md, config/base-mission.md
 * - config/departments/{deptId}/report.md
 * - config/departments/{deptId}/escalations.json
 * - config/departments/{deptId}/mission.md
 * - agents/{agentId}/memory/SUMMARY.md
 */
const { readFileSync, writeFileSync, renameSync, existsSync, readdirSync, mkdirSync } = require('fs')
const { join, resolve } = require('path')
const { BaseRepository } = require('./base.cjs')

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const CONFIG_DIR = join(PROJECT_ROOT, 'config')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const DEPARTMENTS_DIR = join(CONFIG_DIR, 'departments')
const MISSION_FILE = join(CONFIG_DIR, 'mission.md')
const BASE_MISSION_FILE = join(CONFIG_DIR, 'base-mission.md')

class MissionRepository extends BaseRepository {
  /** Read company mission (config/mission.md) */
  readMission() {
    try {
      return readFileSync(MISSION_FILE, 'utf-8')
    } catch {
      return '(mission.md not found)'
    }
  }

  /** Read base mission (config/base-mission.md) */
  readBaseMission() {
    try {
      if (existsSync(BASE_MISSION_FILE)) {
        return readFileSync(BASE_MISSION_FILE, 'utf-8')
      }
    } catch { /* skip */ }
    return ''
  }

  /** Read a department's mission file */
  readDeptMission(deptId) {
    const missionPath = join(DEPARTMENTS_DIR, deptId, 'mission.md')
    try {
      if (existsSync(missionPath)) {
        return readFileSync(missionPath, 'utf-8')
      }
    } catch { /* skip */ }
    return ''
  }

  /** Read all department reports (for CEO coordination) */
  readAllDepartmentReports() {
    const reports = {}
    try {
      if (!existsSync(DEPARTMENTS_DIR)) return reports
      const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const dir of dirs) {
        const reportPath = join(DEPARTMENTS_DIR, dir.name, 'report.md')
        if (existsSync(reportPath)) {
          try {
            reports[dir.name] = readFileSync(reportPath, 'utf-8')
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
    return reports
  }

  /** Read escalations from all departments */
  readEscalations() {
    const escalations = []
    try {
      if (!existsSync(DEPARTMENTS_DIR)) return escalations
      const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const dir of dirs) {
        const escPath = join(DEPARTMENTS_DIR, dir.name, 'escalations.json')
        if (existsSync(escPath)) {
          try {
            const data = JSON.parse(readFileSync(escPath, 'utf-8'))
            for (const item of (data.items || [])) {
              escalations.push({ deptId: dir.name, ...item })
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
    return escalations
  }

  /** Read a file from an agent's workspace directory */
  readWorkspaceFile(agentDir, filename) {
    try {
      const p = join(agentDir, filename)
      if (existsSync(p)) return readFileSync(p, 'utf-8')
    } catch { /* skip */ }
    return null
  }

  /** Read a file from the CEO workspace */
  readCeoWorkspaceFile(filename) {
    return this.readWorkspaceFile(join(AGENTS_DIR, 'ceo'), filename)
  }

  /** Atomic write company mission (config/mission.md) */
  writeMission(content) {
    const tmp = MISSION_FILE + '.tmp.' + process.pid
    writeFileSync(tmp, content)
    renameSync(tmp, MISSION_FILE)
  }

  /** Atomic write base mission (config/base-mission.md) */
  writeBaseMission(content) {
    const tmp = BASE_MISSION_FILE + '.tmp.' + process.pid
    writeFileSync(tmp, content)
    renameSync(tmp, BASE_MISSION_FILE)
  }

  /** Atomic write department mission */
  writeDeptMission(deptId, content) {
    const dir = join(DEPARTMENTS_DIR, deptId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'mission.md')
    const tmp = filePath + '.tmp.' + process.pid
    writeFileSync(tmp, content)
    renameSync(tmp, filePath)
  }

  /** Read an agent's memory SUMMARY.md (first 2000 chars) */
  readMemorySummary(agentId) {
    const summaryPath = join(AGENTS_DIR, agentId, 'memory', 'SUMMARY.md')
    try {
      if (existsSync(summaryPath)) {
        return readFileSync(summaryPath, 'utf-8').slice(0, 2000)
      }
    } catch { /* skip */ }
    return null
  }

  /** Read a department's report.md */
  readDeptReport(deptId) {
    const reportPath = join(DEPARTMENTS_DIR, deptId, 'report.md')
    try {
      if (existsSync(reportPath)) {
        return readFileSync(reportPath, 'utf-8').slice(0, 2000)
      }
    } catch { /* skip */ }
    return ''
  }

  /** Read a department's ceo-directives.json */
  readDeptDirectives(deptId) {
    const directivesPath = join(DEPARTMENTS_DIR, deptId, 'ceo-directives.json')
    try {
      if (existsSync(directivesPath)) {
        const data = JSON.parse(readFileSync(directivesPath, 'utf-8'))
        return data.directives || []
      }
    } catch { /* skip */ }
    return []
  }

  /** Atomic write department directives */
  writeDeptDirectives(deptId, directives) {
    const dir = join(DEPARTMENTS_DIR, deptId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'ceo-directives.json')
    const data = {
      directives: Array.isArray(directives) ? directives : [directives],
      updatedAt: new Date().toISOString(),
    }
    const tmp = filePath + '.tmp.' + process.pid
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, filePath)
  }

  /** Atomic write department report */
  writeDeptReport(deptId, content) {
    const dir = join(DEPARTMENTS_DIR, deptId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'report.md')
    const tmp = filePath + '.tmp.' + process.pid
    writeFileSync(tmp, content)
    renameSync(tmp, filePath)
  }
}

const missionRepo = new MissionRepository()

module.exports = { MissionRepository, missionRepo }
