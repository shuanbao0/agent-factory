'use strict'
/**
 * worker-tracker.cjs — Worker 子会话 token 追踪
 *
 * 扫描 openclaw-state sessions.json 中的 subagent session，
 * 发现新的或 token 有变化的 session 时记录到 messages + cost_entries。
 *
 * 设计：每轮部门循环末尾调用 trackWorkerSessions(deptId, agentIds)，
 * 增量记录，不重复不遗漏。
 */
const { existsSync, readFileSync } = require('fs')
const { join } = require('path')
const { SESSIONS_DIR } = require('../common/paths.cjs')
const logger = require('../common/logger.cjs')

// Lazy requires
let _insertMessage, _insertCostEntry, _calculateCost, _getTracked
function getInsertMessage() {
  if (!_insertMessage) _insertMessage = require('../db/queries/message-queries.cjs').insertMessage
  return _insertMessage
}
function getInsertCostEntry() {
  if (!_insertCostEntry) _insertCostEntry = require('../db/queries/cost-queries.cjs').insertCostEntry
  return _insertCostEntry
}
function getCalculateCost() {
  if (!_calculateCost) _calculateCost = require('./cost-tracker.cjs').calculateCost
  return _calculateCost
}
function getTrackedSessions() {
  if (!_getTracked) _getTracked = require('../db/queries/message-queries.cjs').getTrackedWorkerSessions
  return _getTracked
}

/**
 * 扫描指定 agent 列表的 subagent sessions，记录新增到 DB
 *
 * @param {string} deptId - 部门 ID（用于 source 标签）
 * @param {string[]} agentIds - 要扫描的 agent ID 列表
 * @returns {number} 新记录的 session 数
 */
function trackWorkerSessions(deptId, agentIds) {
  let tracked = 0

  for (const agentId of agentIds) {
    const sessFile = join(SESSIONS_DIR, agentId, 'sessions', 'sessions.json')
    if (!existsSync(sessFile)) continue

    let sessions
    try {
      sessions = JSON.parse(readFileSync(sessFile, 'utf-8'))
    } catch { continue }

    // 获取已记录的 session keys
    let trackedKeys
    try {
      trackedKeys = getTrackedSessions()(agentId)
    } catch {
      trackedKeys = new Set()
    }

    for (const [key, sess] of Object.entries(sessions)) {
      // 只处理 subagent sessions
      if (!key.includes(':subagent:')) continue
      if (!sess || typeof sess !== 'object') continue
      // 跳过已记录的
      if (trackedKeys.has(key)) continue
      // 跳过没有 token 数据的
      if (!sess.totalTokens || sess.totalTokens === 0) continue

      try {
        const model = sess.model || 'unknown'
        const inputTokens = sess.inputTokens || 0
        const outputTokens = sess.outputTokens || 0
        const totalTokens = sess.totalTokens || 0
        const cost = sess.estimatedCostUsd
          ? Math.round(sess.estimatedCostUsd * 1_000_000) / 1_000_000
          : getCalculateCost()(model, { inputTokens, outputTokens })
        const ts = sess.endedAt
          ? new Date(sess.endedAt).toISOString()
          : sess.updatedAt
            ? new Date(sess.updatedAt).toISOString()
            : new Date().toISOString()
        const startTs = sess.startedAt
          ? new Date(sess.startedAt).toISOString()
          : ts
        const pairId = sess.sessionId || key.split(':').pop()
        const source = `worker:${deptId}:${agentId}`
        const label = sess.label || ''

        // Request: worker 被 spawn 时
        getInsertMessage()({
          ts: startTs,
          agentId,
          sessionKey: key,
          messageType: 'worker-execution',
          direction: 'request',
          channel: 'worker',
          content: label ? `Worker: ${label}` : `Worker session spawned`,
          fromAgent: agentId,
          pairId,
        })

        // Response: worker 执行结果
        getInsertMessage()({
          ts,
          agentId,
          sessionKey: key,
          messageType: 'worker-execution',
          direction: 'response',
          channel: 'worker',
          content: `status=${sess.status || 'unknown'}, runtime=${sess.runtimeMs ? (sess.runtimeMs / 1000).toFixed(1) + 's' : 'unknown'}`,
          ok: sess.status === 'completed' ? 1 : (sess.status === 'timeout' ? 0 : 1),
          model,
          inputTokens,
          outputTokens,
          totalTokens,
          cost,
          source,
          fromAgent: agentId,
          pairId,
        })

        // Cost entry
        if (totalTokens > 0) {
          getInsertCostEntry()({
            ts,
            date: ts.slice(0, 10),
            model,
            inputTokens,
            outputTokens,
            cost,
            source,
            agentId,
          })
        }

        tracked++
        logger.debug('worker-tracker', 'Worker session tracked', {
          agentId, sessionKey: key, totalTokens, cost, label: label || undefined,
        })
      } catch (err) {
        logger.debug('worker-tracker', 'Failed to track worker session', {
          agentId, sessionKey: key, error: err.message,
        })
      }
    }
  }

  if (tracked > 0) {
    logger.info('worker-tracker', `Tracked ${tracked} worker sessions`, { deptId })
  }

  return tracked
}

module.exports = { trackWorkerSessions }
