/**
 * Readers — data reading functions for mission, projects, agent activity, etc.
 */
const { readFileSync, existsSync, readdirSync, statSync } = require('fs')
const { join } = require('path')
const {
  MISSION_FILE, BASE_MISSION_FILE, TASKS_FILE, PROJECTS_DIR, SESSIONS_DIR,
  CEO_WORKSPACE, AGENTS_DIR, DEPARTMENTS_DIR,
} = require('./constants.cjs')
const logger = require('./logger.cjs')

function readMission() {
  try {
    return readFileSync(MISSION_FILE, 'utf-8')
  } catch (err) {
    logger.warn('readers', 'Mission file not found', err)
    return '(mission.md not found)'
  }
}

function readBaseMission() {
  try {
    if (existsSync(BASE_MISSION_FILE)) {
      return readFileSync(BASE_MISSION_FILE, 'utf-8')
    }
  } catch (err) {
    logger.debug('readers', 'Base mission file not found or unreadable', err)
  }
  return ''
}

function readWorkspaceFile(agentDir, filename) {
  try {
    const p = join(agentDir, filename)
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  } catch (err) {
    logger.debug('readers', `Failed to read ${filename} from ${agentDir}`, err)
  }
  return null
}

function readCeoWorkspaceFile(filename) {
  return readWorkspaceFile(CEO_WORKSPACE, filename)
}

function readProjectTasks() {
  const results = []
  try {
    if (!existsSync(PROJECTS_DIR)) return results
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const dir of dirs) {
      const metaPath = join(PROJECTS_DIR, dir.name, '.project-meta.json')
      if (!existsSync(metaPath)) continue
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        results.push({ id: dir.name, ...meta })
      } catch (err) {
        logger.warn('readers', `Failed to parse project meta: ${dir.name}`, err)
      }
    }
  } catch (err) {
    logger.error('readers', 'Failed to read projects directory', err)
  }
  return results
}

function readStandaloneTasks() {
  try {
    if (!existsSync(TASKS_FILE)) return []
    const data = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'))
    return data.tasks || []
  } catch (err) {
    logger.warn('readers', 'Failed to read standalone tasks', err)
    return []
  }
}

function readAgentActivity() {
  const activity = {}
  try {
    if (!existsSync(SESSIONS_DIR)) return activity
    const dirs = readdirSync(SESSIONS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const dir of dirs) {
      const sessFile = join(SESSIONS_DIR, dir.name, 'sessions', 'sessions.json')
      if (!existsSync(sessFile)) continue
      try {
        const stat = statSync(sessFile)
        const sessions = JSON.parse(readFileSync(sessFile, 'utf-8'))
        let totalTokens = 0
        let latestUpdate = 0
        for (const [, sess] of Object.entries(sessions)) {
          if (sess && typeof sess === 'object') {
            totalTokens += sess.totalTokens || 0
            if (sess.updatedAt && sess.updatedAt > latestUpdate) latestUpdate = sess.updatedAt
          }
        }
        activity[dir.name] = {
          totalTokens,
          lastActive: latestUpdate || stat.mtimeMs,
          idleMins: Math.round((Date.now() - (latestUpdate || stat.mtimeMs)) / 60000),
        }
      } catch (err) {
        logger.debug('readers', `Failed to read sessions for ${dir.name}`, err)
      }
    }
  } catch (err) {
    logger.error('readers', 'Failed to read agent activity', err)
  }
  return activity
}

/**
 * Fetch real token usage from gateway session files
 */
function fetchSessionTokens() {
  const totals = { all: 0, byAgent: {} }
  try {
    if (!existsSync(SESSIONS_DIR)) return totals
    const agentDirs = readdirSync(SESSIONS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const dir of agentDirs) {
      const sessFile = join(SESSIONS_DIR, dir.name, 'sessions', 'sessions.json')
      if (!existsSync(sessFile)) continue
      try {
        const sessions = JSON.parse(readFileSync(sessFile, 'utf-8'))
        let agentTotal = 0
        for (const [, sess] of Object.entries(sessions)) {
          agentTotal += (sess && typeof sess === 'object' ? sess.totalTokens : 0) || 0
        }
        totals.byAgent[dir.name] = agentTotal
        totals.all += agentTotal
      } catch (err) {
        logger.debug('readers', `Failed to parse sessions for ${dir.name}`, err)
      }
    }
  } catch (err) {
    logger.error('readers', 'Failed to fetch session tokens', err)
  }
  return totals
}

/**
 * Read all department reports (for CEO coordination cycles)
 */
function readAllDepartmentReports() {
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
        } catch (err) {
          logger.debug('readers', `Failed to read report for dept ${dir.name}`, err)
        }
      }
    }
  } catch (err) {
    logger.warn('readers', 'Failed to read department reports', err)
  }
  return reports
}

/**
 * Read escalations (items departments elevated to CEO)
 */
function readEscalations() {
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
        } catch (err) {
          logger.debug('readers', `Failed to read escalations for dept ${dir.name}`, err)
        }
      }
    }
  } catch (err) {
    logger.warn('readers', 'Failed to read escalations', err)
  }
  return escalations
}

/**
 * Load a department config
 */
function loadDeptConfig(deptId) {
  const configPath = join(DEPARTMENTS_DIR, deptId, 'config.json')
  try {
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    }
  } catch (err) {
    logger.error('readers', `Failed to load dept config for ${deptId}`, err)
  }
  return null
}

/**
 * Load a department state
 */
function loadDeptState(deptId) {
  const statePath = join(DEPARTMENTS_DIR, deptId, 'state.json')
  try {
    if (existsSync(statePath)) {
      return JSON.parse(readFileSync(statePath, 'utf-8'))
    }
  } catch (err) {
    logger.error('readers', `Failed to load dept state for ${deptId}`, err)
  }
  return {
    status: 'stopped',
    pid: null,
    cycleCount: 0,
    lastCycleAt: null,
    lastCycleResult: null,
    history: [],
    tokensUsedToday: 0,
    budgetResetAt: null,
  }
}

/**
 * Save a department state atomically
 */
function saveDeptState(deptId, state) {
  const { writeFileSync, renameSync, mkdirSync } = require('fs')
  const deptDir = join(DEPARTMENTS_DIR, deptId)
  if (!existsSync(deptDir)) mkdirSync(deptDir, { recursive: true })
  const statePath = join(deptDir, 'state.json')
  const tmpPath = statePath + '.tmp'
  try {
    writeFileSync(tmpPath, JSON.stringify(state, null, 2))
    renameSync(tmpPath, statePath)
  } catch (err) {
    logger.error('readers', `Failed to save dept state for ${deptId}`, err)
    try { writeFileSync(statePath, JSON.stringify(state, null, 2)) } catch {}
  }
}

/**
 * Read a department's mission file
 */
function readDeptMission(deptId) {
  const missionPath = join(DEPARTMENTS_DIR, deptId, 'mission.md')
  try {
    if (existsSync(missionPath)) {
      return readFileSync(missionPath, 'utf-8')
    }
  } catch (err) {
    logger.debug('readers', `Failed to read mission for dept ${deptId}`, err)
  }
  return ''
}

/**
 * Read token and compaction info for a specific session.
 *
 * @param {string} agentId - Agent ID (e.g. 'novel-chief')
 * @param {string} sessionKey - Session key (e.g. 'agent:novel-chief:main')
 * @returns {{ totalTokens: number, compactionCount: number, contextTokens: number } | null}
 */
function getSessionTokenInfo(agentId, sessionKey) {
  const sessFile = join(SESSIONS_DIR, agentId, 'sessions', 'sessions.json')
  try {
    if (!existsSync(sessFile)) return null
    const sessions = JSON.parse(readFileSync(sessFile, 'utf-8'))
    const sess = sessions[sessionKey]
    if (!sess || typeof sess !== 'object') return null
    return {
      totalTokens: sess.totalTokens || 0,
      compactionCount: sess.compactionCount || 0,
      contextTokens: sess.contextTokens || 200000,
    }
  } catch (err) {
    logger.debug('readers', `Failed to read session info for ${agentId}:${sessionKey}`, err)
    return null
  }
}

/**
 * Read an agent's memory SUMMARY.md
 *
 * @param {string} agentId
 * @returns {string | null}
 */
function readMemorySummary(agentId) {
  const summaryPath = join(AGENTS_DIR, agentId, 'memory', 'SUMMARY.md')
  try {
    if (existsSync(summaryPath)) {
      return readFileSync(summaryPath, 'utf-8').slice(0, 2000)
    }
  } catch (err) {
    logger.debug('readers', `Failed to read SUMMARY.md for ${agentId}`, err)
  }
  return null
}

module.exports = {
  readMission,
  readBaseMission,
  readWorkspaceFile,
  readCeoWorkspaceFile,
  readProjectTasks,
  readStandaloneTasks,
  readAgentActivity,
  fetchSessionTokens,
  readAllDepartmentReports,
  readEscalations,
  loadDeptConfig,
  loadDeptState,
  saveDeptState,
  readDeptMission,
  getSessionTokenInfo,
  readMemorySummary,
}
