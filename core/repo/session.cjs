'use strict'
/**
 * SessionRepository — 会话数据读取（token 用量、活跃度）
 *
 * 数据源：.openclaw-state/agents/{agentId}/sessions/sessions.json
 */
const { readFileSync, existsSync, readdirSync, statSync } = require('fs')
const { join } = require('path')
const { BaseRepository } = require('./base.cjs')
const { SESSIONS_DIR } = require('../common/paths.cjs')

class SessionRepository extends BaseRepository {
  /**
   * Read all agent activity (token usage + idle time)
   * @returns {Object<string, {totalTokens: number, lastActive: number, idleMins: number}>}
   */
  readAgentActivity() {
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
        } catch { /* skip unreadable sessions */ }
      }
    } catch { /* skip if directory unreadable */ }
    return activity
  }

  /**
   * Fetch total token usage across all sessions
   * @returns {{all: number, byAgent: Object<string, number>}}
   */
  fetchSessionTokens() {
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
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return totals
  }

  /**
   * Get token and compaction info for a specific session
   * @param {string} agentId
   * @param {string} sessionKey
   * @returns {{totalTokens: number, compactionCount: number, contextTokens: number} | null}
   */
  getSessionTokenInfo(agentId, sessionKey) {
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
    } catch {
      return null
    }
  }

  /**
   * List stale sessions (inactive > maxDays, non-:main)
   * @param {number} [maxDays=14]
   * @returns {Array<{agentId: string, sessionKey: string, updatedAt: number}>}
   */
  listStaleSessions(maxDays = 14) {
    const cutoff = Date.now() - maxDays * 86400_000
    const stale = []
    try {
      if (!existsSync(SESSIONS_DIR)) return stale
      const agentDirs = readdirSync(SESSIONS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
      for (const dir of agentDirs) {
        const sessFile = join(SESSIONS_DIR, dir.name, 'sessions', 'sessions.json')
        if (!existsSync(sessFile)) continue
        try {
          const sessions = JSON.parse(readFileSync(sessFile, 'utf-8'))
          for (const [key, sess] of Object.entries(sessions)) {
            if (!sess || typeof sess !== 'object') continue
            if (key.endsWith(':main')) continue
            const updatedAt = sess.updatedAt || 0
            if (updatedAt > 0 && updatedAt < cutoff) {
              stale.push({ agentId: dir.name, sessionKey: key, updatedAt })
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return stale
  }
}

const sessionRepo = new SessionRepository()

module.exports = { SessionRepository, sessionRepo }
