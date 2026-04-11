'use strict'
/**
 * QualityOrchestrator — 质量门审查编排（DI sendToAgent）
 *
 * 设计模式：Orchestrator + Dependency Injection
 *
 * 职责：
 * - 协调 self-check → peer review → head approval 三阶段审查
 * - 通过注入的 sendFn 与 Agent 通信（不直接依赖 gateway）
 * - 审查者选择策略（专业匹配 → 标签匹配 → 最空闲）
 */
const { getStrategy } = require('./strategy.cjs')
const { getStandardsForType } = require('../common/task-standards.cjs')
const { loadProjectStandards, getPhaseStandards } = require('../common/project-standards.cjs')
const { getStandardsForDept } = require('../common/dept-standards.cjs')
const logger = require('../common/logger.cjs')

// Lazy require to avoid circular dependencies
let _taskRepo
function getTaskRepo() {
  if (!_taskRepo) _taskRepo = require('../repo/task.cjs').taskRepo
  return _taskRepo
}


class QualityOrchestrator {
  /**
   * @param {object} opts
   * @param {function} opts.sendFn - (agentId, sessionKey, message, timeoutMs) => Promise<{ok, text, error}>
   * @param {function} [opts.readAgentActivity] - () => {[agentId]: {totalTokens, lastActive, idleMins}}
   * @param {function} [opts.loadDeptConfig] - (deptId) => config object
   * @param {function} [opts.readTaskOutput] - (task) => string|null
   * @param {object} [opts.logger] - Logger with info/warn/debug/error methods
   */
  /**
   * @param {object} opts
   * @param {function} opts.sendFn - (agentId, sessionKey, message, timeoutMs) => Promise<{ok, text, error}>
   * @param {function} [opts.readAgentActivity] - () => {[agentId]: {totalTokens, lastActive, idleMins}}
   * @param {function} [opts.loadDeptConfig] - (deptId) => config object
   * @param {function} [opts.readTaskOutput] - (task) => string|null
   * @param {function} [opts.killSessionFn] - (sessionKey) => Promise — injected for cleanup; falls back to gateway-client
   * @param {object} [opts.logger] - Logger with info/warn/debug/error methods
   */
  constructor({ sendFn, readAgentActivity, loadDeptConfig, readTaskOutput, killSessionFn, logger }) {
    this._sendFn = sendFn
    this._readAgentActivity = readAgentActivity || (() => ({}))
    this._loadDeptConfig = loadDeptConfig || (() => null)
    this._readTaskOutput = readTaskOutput || ((task) => getTaskRepo().readTaskOutput(task))
    this._killSessionFn = killSessionFn || null
    this._log = logger || { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }
  }

  /**
   * Process quality gate for a task in review status.
   *
   * @param {string} deptId - Department ID
   * @param {object} task - Task object (will be mutated with quality fields)
   * @returns {Promise<{passed: boolean, reason?: string}>}
   */
  async process(deptId, task) {
    const config = this._loadDeptConfig(deptId)
    if (!config) {
      this._log.warn('quality-orchestrator', `No config for department ${deptId}`)
      return { passed: true }
    }

    // Track session keys for cleanup after gate completes
    const sessionKeys = []
    let result

    logger.info('quality-gate', 'Quality gate started', { taskId: task.id, stage: task.quality?.gate?.stage })

    try {
      // Clear stale quality data
      task.quality = {}

      // 1. Self-check
      try {
        const selfCheck = await this._requestSelfCheck(task.assignedAgent || task.assignees?.[0], task, deptId)
        sessionKeys.push(`agent:${task.assignedAgent || task.assignees?.[0]}:quality-check:${task.id}`)
        task.quality.selfCheck = selfCheck
        if (!selfCheck.passed) {
          this._log.info('quality-orchestrator', `Self-check failed for task ${task.id}`)
          logger.warn('quality-gate', 'Stage failed', { taskId: task.id, stage: 'self_check', score: selfCheck.score })
          result = { passed: false, reason: `Self-check failed: score ${selfCheck.score}/100` }
          return result
        }
      } catch (err) {
        this._log.warn('quality-orchestrator', `Self-check error for task ${task.id}`, err)
        logger.error('quality-gate', 'Quality gate error', { taskId: task.id, error: err.message })
        result = { passed: false, reason: `Self-check exception: ${err.message}` }
        return result
      }

      // 2. Peer review
      const reviewer = this.selectReviewer(deptId, task, config)
      if (reviewer) {
        try {
          const peerReview = await this._requestPeerReview(reviewer, task, deptId)
          sessionKeys.push(`agent:${reviewer}:peer-review:${task.id}`)
          task.quality.peerReview = peerReview
          if (!peerReview.passed) {
            this._log.info('quality-orchestrator', `Peer review failed for task ${task.id} by ${reviewer}`)
            logger.warn('quality-gate', 'Stage failed', { taskId: task.id, stage: 'peer_review', score: peerReview.score })
            result = { passed: false, reason: peerReview.comments || 'Peer review rejected' }
            return result
          }
        } catch (err) {
          this._log.warn('quality-orchestrator', `Peer review error for task ${task.id}`, err)
          logger.error('quality-gate', 'Quality gate error', { taskId: task.id, error: err.message })
          result = { passed: false, reason: `Peer review exception: ${err.message}` }
          return result
        }
      }

      // 3. Head approval
      try {
        const headApproval = await this._requestHeadApproval(config.head, task)
        sessionKeys.push(`agent:${config.head}:approval:${task.id}`)
        task.quality.headApproval = headApproval
        if (!headApproval.passed) {
          this._log.info('quality-orchestrator', `Head rejected task ${task.id}`)
          logger.warn('quality-gate', 'Stage failed', { taskId: task.id, stage: 'head_approval', score: 0 })
          result = { passed: false, reason: 'Head rejected' }
          return result
        }
      } catch (err) {
        this._log.warn('quality-orchestrator', `Head approval error for task ${task.id}`, err)
        logger.error('quality-gate', 'Quality gate error', { taskId: task.id, error: err.message })
        result = { passed: false, reason: `Head approval exception: ${err.message}` }
        return result
      }

      this._log.info('quality-orchestrator', `Task ${task.id} passed all quality gates`)
      logger.info('quality-gate', 'Quality gate passed', { taskId: task.id })
      result = { passed: true }
      return result
    } finally {
      // Fire-and-forget: clean up temporary quality gate sessions
      this._cleanupSessions(sessionKeys)
    }
  }

  /** @private — Build department standards context for quality gate prompts */
  _getDeptStandardsContext(deptId) {
    if (!deptId) return ''
    try {
      const { generalStandards, typeStandards, customStandards } = getStandardsForDept(deptId)
      const parts = []
      if (typeStandards) parts.push(typeStandards)
      if (customStandards) parts.push(customStandards)
      if (parts.length === 0 && generalStandards) parts.push(generalStandards)
      if (parts.length === 0) return ''
      return `\n部门执行标准:\n${parts.join('\n')}`
    } catch { return '' }
  }

  /** @private — Build project phase context string for quality gate prompts */
  _getProjectContext(task) {
    if (!task.projectId) return ''
    try {
      const { projectMetaRepo } = require('../repo/project-meta.cjs')
      const projMeta = projectMetaRepo.readMeta(task.projectId)
      if (!projMeta?.currentPhase || !projMeta?.phases) return ''
      const phase = projMeta.phases[projMeta.currentPhase - 1]
      if (!phase) return ''
      const phaseLabel = phase.labelZh || phase.labelEn || `Phase ${projMeta.currentPhase}`
      const projStandards = loadProjectStandards()
      if (!projStandards?.lifecycle) return `\n项目: ${task.projectId} | 阶段: ${phaseLabel}`
      const phaseKey = phase.labelEn?.toLowerCase()
      if (!phaseKey) return `\n项目: ${task.projectId} | 阶段: ${phaseLabel}`
      const phaseStd = getPhaseStandards(projStandards.lifecycle, phaseKey)
      if (!phaseStd) return `\n项目: ${task.projectId} | 阶段: ${phaseLabel}`
      const exitMatch = phaseStd.match(/\*\*出口条件[：:]\*\*\s*(.+)/)
      const exitCriteria = exitMatch ? ` | 出口条件: ${exitMatch[1]}` : ''
      return `\n项目: ${task.projectId} | 阶段: ${phaseLabel}${exitCriteria}`
    } catch { logger.debug('quality-gate', 'Project context load failed', { taskId: task?.projectId }); return '' }
  }

  /** @private */
  _cleanupSessions(sessionKeys) {
    if (sessionKeys.length === 0 || !this._killSessionFn) return
    logger.debug('quality-gate', 'Cleaning up sessions', { count: sessionKeys.length })
    for (const key of sessionKeys) {
      this._killSessionFn(key).catch(() => {})
    }
  }

  /**
   * @private
   * Given a task.output value (string or array), return the subset of
   * path-like tokens that do not resolve to an existing file. Used for
   * clearer self-check failure messages when multi-path outputs are in play.
   */
  _listMissingOutputPaths(output) {
    if (!output) return []
    const { existsSync } = require('fs')
    const { resolve } = require('path')
    const { PROJECT_ROOT } = require('../common/paths.cjs')
    const tokens = Array.isArray(output)
      ? output
      : String(output).split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    const missing = []
    for (const token of tokens) {
      if (!/[\\/]/.test(token) && !/\.[a-z0-9]{1,8}$/i.test(token)) continue
      if (!existsSync(resolve(PROJECT_ROOT, token))) missing.push(token)
    }
    return missing
  }

  /**
   * Select a peer reviewer from the department.
   */
  selectReviewer(deptId, task, config) {
    const agents = config.agents || []
    const assignedAgent = task.assignedAgent || task.assignees?.[0]

    const candidates = agents.filter(a => a !== assignedAgent && a !== config.head)
    if (candidates.length === 0) return null

    const strategy = getStrategy(task.type, config)
    const preferredReviewers = strategy.preferredReviewers || []
    const preferred = candidates.filter(a => preferredReviewers.includes(a))
    const taskTags = task.tags || []
    const tagMatching = taskTags.length > 0
      ? candidates.filter(a => !preferred.includes(a) && taskTags.some(tag => a.includes(tag)))
      : []
    const pool = preferred.length > 0
      ? preferred
      : tagMatching.length > 0
        ? tagMatching
        : candidates

    const activity = this._readAgentActivity()
    let bestCandidate = pool[0]
    let maxIdle = -1

    for (const candidate of pool) {
      const a = activity[candidate]
      const idle = a ? a.idleMins : 9999
      if (idle > maxIdle) {
        maxIdle = idle
        bestCandidate = candidate
      }
    }

    return bestCandidate
  }

  /**
   * Find tasks in 'review' status for a department.
   */
  findTasksInReview(deptId, projects) {
    const config = this._loadDeptConfig(deptId)
    if (!config) return []

    const agentIds = config.agents || []
    const tasksInReview = []

    for (const proj of (projects || [])) {
      for (const task of (proj.tasks || [])) {
        if (task.status !== 'review') continue
        const assigned = task.assignedAgent || task.assignees?.[0]
        if (agentIds.includes(assigned)) {
          tasksInReview.push(task)
        }
      }
    }

    return tasksInReview
  }

  /** @private */
  async _requestSelfCheck(agentId, task, deptId) {
    if (!agentId) return { passed: false, score: 0, checklist: ['无执行者'], at: new Date().toISOString() }

    // Hard validation: empty output is an automatic fail. A task that reaches
    // self-check without any output field means nothing was produced —
    // previously the `if (task.output)` guard would silently skip validation
    // and let the LLM grade a phantom task, which is how empty rework chains
    // kept scoring high without ever writing anything.
    if (!task.output) {
      return { passed: false, score: 0, checklist: ['产出为空：task.output 字段未设置'], at: new Date().toISOString() }
    }
    const content = this._readTaskOutput(task)
    if (!content) {
      const missing = this._listMissingOutputPaths(task.output)
      const detail = missing.length > 0 ? missing.join(', ') : String(task.output)
      return { passed: false, score: 0, checklist: ['产出文件不存在: ' + detail], at: new Date().toISOString() }
    }
    if (content.length < 500) {
      return { passed: false, score: 0, checklist: [`产出仅 ${content.length} 字符，最低要求 500`], at: new Date().toISOString() }
    }
    if (/\$\{[^}]+\}/.test(content.slice(0, 5000))) {
      return { passed: false, score: 0, checklist: ['含未渲染模板变量 ${...}'], at: new Date().toISOString() }
    }

    // `content` was already read during hard validation above
    const outputContent = content.slice(0, 5000)

    // Build checklist: prefer type-specific from task-standards.md, fallback to generic
    let checklistItems
    try {
      const standards = getStandardsForType(task.type)
      checklistItems = standards.checklist.length > 0 ? standards.checklist : null
    } catch { checklistItems = null }

    const checklist = checklistItems
      ? checklistItems.map((item, i) => `${i + 1}. ${item}`).join('\n')
      : '1. 是否完成了任务要求的所有内容？\n2. 是否有明显的错误或遗漏？\n3. 格式和表述是否规范？\n4. 是否可以交付给下一环节？'

    // Project phase context + department standards
    const projectCtx = this._getProjectContext(task)
    const deptCtx = this._getDeptStandardsContext(deptId)

    const prompt = `请检查你的任务产出质量：\n\n任务: ${task.name}\n${task.description ? `描述: ${task.description}` : ''}${projectCtx ? `\n${projectCtx}` : ''}${deptCtx ? `\n${deptCtx}` : ''}\n${outputContent ? `产出内容:\n${outputContent}` : '(无产出文件)'}\n\n请按以下清单自检，给出 0-100 的质量评分：\n${checklist}\n\n回复格式：\nSCORE: <number>\nPASSED: <true/false>\nISSUES: <comma-separated list or "none">`

    try {
      const result = await this._sendFn(agentId, `agent:${agentId}:quality-check:${task.id}`, prompt, 60000)
      if (result.ok) {
        const score = parseInt(result.text.match(/SCORE:\s*(\d+)/)?.[1] || '50')
        const threshold = getStrategy(task.type).minPassingScore
        const passed = score >= threshold
        return {
          passed,
          score,
          checklist: result.text.match(/ISSUES:\s*(.+)/)?.[1]?.split(',').map(s => s.trim()) || [],
          at: new Date().toISOString(),
        }
      }
    } catch (err) {
      this._log.debug('quality-orchestrator', `Self-check request failed for ${agentId}`, err)
    }

    return { passed: false, score: 0, checklist: ['self-check 超时或失败'], at: new Date().toISOString() }
  }

  /** @private */
  async _requestPeerReview(reviewerId, task, deptId) {
    let peerOutputContent = ''
    if (task.output) {
      const raw = this._readTaskOutput(task)
      peerOutputContent = raw ? raw.slice(0, 5000) : `(无法读取: ${task.output})`
    }

    // Task type standards for reviewer reference
    let reviewStandards = ''
    try {
      const standards = getStandardsForType(task.type)
      if (standards.typeStandards) reviewStandards = `\n任务类型标准 (${task.type}):\n${standards.typeStandards}\n`
    } catch { /* skip */ }
    const projectCtx = this._getProjectContext(task)
    const deptCtx = this._getDeptStandardsContext(deptId)

    const prompt = `请 review 以下任务的产出：\n\n任务: ${task.name}\n${task.description ? `描述: ${task.description}` : ''}\n执行者: ${task.assignedAgent || task.assignees?.[0] || '未知'}${projectCtx ? `\n${projectCtx}` : ''}${reviewStandards}${deptCtx ? `\n${deptCtx}` : ''}\n${peerOutputContent ? `产出内容:\n${peerOutputContent}` : '(产出未附带)'}\n\n评审标准：\n1. 完成度 — 是否满足任务要求？\n2. 质量 — 是否有错误或可改进之处？\n3. 一致性 — 是否与项目整体风格一致？\n\n回复格式：\nSCORE: <0-100>\nPASSED: <true/false>\nCOMMENTS: <your review comments>`

    try {
      const result = await this._sendFn(reviewerId, `agent:${reviewerId}:peer-review:${task.id}`, prompt, 60000)
      if (result.ok) {
        const score = parseInt(result.text.match(/SCORE:\s*(\d+)/)?.[1] || '50')
        const threshold = getStrategy(task.type).minPassingScore
        const passed = score >= threshold
        const comments = result.text.match(/COMMENTS:\s*([\s\S]*?)$/)?.[1]?.trim() || ''
        return {
          reviewer: reviewerId,
          passed,
          score,
          comments,
          at: new Date().toISOString(),
        }
      }
    } catch (err) {
      this._log.debug('quality-orchestrator', `Peer review request failed for ${reviewerId}`, err)
    }

    return { reviewer: reviewerId, passed: false, score: 0, comments: 'peer review 超时或失败', at: new Date().toISOString() }
  }

  /** @private */
  async _requestHeadApproval(headId, task) {
    const selfScore = task.quality?.selfCheck?.score || 'N/A'
    const peerScore = task.quality?.peerReview?.score || 'N/A'
    const peerComments = task.quality?.peerReview?.comments || '(无)'

    // Include completion definition for head to judge against
    let completionDef = ''
    try {
      const standards = getStandardsForType(task.type)
      if (standards.typeStandards) {
        const match = standards.typeStandards.match(/\*\*完成定义[：:]\*\*\s*(.+)/)
        if (match) completionDef = `\n完成定义: ${match[1]}`
      }
    } catch { /* skip */ }
    const projectCtx = this._getProjectContext(task)

    const prompt = `作为部门主管，请审批以下任务：\n\n任务: ${task.name}\n执行者: ${task.assignedAgent || task.assignees?.[0] || '未知'}${completionDef}${projectCtx ? `\n${projectCtx}` : ''}\n自检评分: ${selfScore}\n同行评审评分: ${peerScore}\n评审意见: ${peerComments}\n\n是否批准完成？回复 APPROVED 或 REJECTED + 原因`

    try {
      const result = await this._sendFn(headId, `agent:${headId}:approval:${task.id}`, prompt, 60000)
      if (result.ok) {
        const passed = result.text.includes('APPROVED')
        return { approver: headId, passed, at: new Date().toISOString() }
      }
    } catch (err) {
      this._log.debug('quality-orchestrator', `Head approval request failed for ${headId}`, err)
    }

    return { approver: headId, passed: false, at: new Date().toISOString() }
  }
}

module.exports = { QualityOrchestrator }
