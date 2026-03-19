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
const { existsSync, statSync } = require('fs')
const { resolve } = require('path')
const { getStrategy } = require('./strategy.cjs')

const PROJECT_ROOT = resolve(__dirname, '..', '..')

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
  constructor({ sendFn, readAgentActivity, loadDeptConfig, readTaskOutput, logger }) {
    this._sendFn = sendFn
    this._readAgentActivity = readAgentActivity || (() => ({}))
    this._loadDeptConfig = loadDeptConfig || (() => null)
    this._readTaskOutput = readTaskOutput || ((task) => getTaskRepo().readTaskOutput(task))
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

    // Clear stale quality data
    task.quality = {}

    // 1. Self-check
    try {
      const selfCheck = await this._requestSelfCheck(task.assignedAgent || task.assignees?.[0], task)
      task.quality.selfCheck = selfCheck
      if (!selfCheck.passed) {
        this._log.info('quality-orchestrator', `Self-check failed for task ${task.id}`)
        return { passed: false, reason: `Self-check failed: score ${selfCheck.score}/100` }
      }
    } catch (err) {
      this._log.warn('quality-orchestrator', `Self-check error for task ${task.id}`, err)
      return { passed: false, reason: `Self-check exception: ${err.message}` }
    }

    // 2. Peer review
    const reviewer = this.selectReviewer(deptId, task, config)
    if (reviewer) {
      try {
        const peerReview = await this._requestPeerReview(reviewer, task)
        task.quality.peerReview = peerReview
        if (!peerReview.passed) {
          this._log.info('quality-orchestrator', `Peer review failed for task ${task.id} by ${reviewer}`)
          return { passed: false, reason: peerReview.comments || 'Peer review rejected' }
        }
      } catch (err) {
        this._log.warn('quality-orchestrator', `Peer review error for task ${task.id}`, err)
        return { passed: false, reason: `Peer review exception: ${err.message}` }
      }
    }

    // 3. Head approval
    try {
      const headApproval = await this._requestHeadApproval(config.head, task)
      task.quality.headApproval = headApproval
      if (!headApproval.passed) {
        this._log.info('quality-orchestrator', `Head rejected task ${task.id}`)
        return { passed: false, reason: 'Head rejected' }
      }
    } catch (err) {
      this._log.warn('quality-orchestrator', `Head approval error for task ${task.id}`, err)
      return { passed: false, reason: `Head approval exception: ${err.message}` }
    }

    this._log.info('quality-orchestrator', `Task ${task.id} passed all quality gates`)
    return { passed: true }
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
  async _requestSelfCheck(agentId, task) {
    if (!agentId) return { passed: false, score: 0, checklist: ['无执行者'], at: new Date().toISOString() }

    // Hard validation: check output file exists
    if (task.output) {
      const outputPath = resolve(PROJECT_ROOT, task.output)
      if (!existsSync(outputPath)) {
        return { passed: false, score: 0, checklist: ['产出文件不存在: ' + task.output], at: new Date().toISOString() }
      }
      try {
        const stat = statSync(outputPath)
        if (stat.size < 500) {
          return { passed: false, score: 0, checklist: [`文件仅 ${stat.size}B，最低要求 500B`], at: new Date().toISOString() }
        }
        const content = (this._readTaskOutput(task) || '').slice(0, 5000)
        if (/\$\{[^}]+\}/.test(content)) {
          return { passed: false, score: 0, checklist: ['含未渲染模板变量 ${...}'], at: new Date().toISOString() }
        }
      } catch { /* skip */ }
    }

    let outputContent = ''
    if (task.output) {
      const raw = this._readTaskOutput(task)
      outputContent = raw ? raw.slice(0, 5000) : `(无法读取: ${task.output})`
    }

    const prompt = `请检查你的任务产出质量：\n\n任务: ${task.name}\n${task.description ? `描述: ${task.description}` : ''}\n${outputContent ? `产出内容:\n${outputContent}` : '(无产出文件)'}\n\n请按以下清单自检，给出 0-100 的质量评分：\n1. 是否完成了任务要求的所有内容？\n2. 是否有明显的错误或遗漏？\n3. 格式和表述是否规范？\n4. 是否可以交付给下一环节？\n\n回复格式：\nSCORE: <number>\nPASSED: <true/false>\nISSUES: <comma-separated list or "none">`

    try {
      const result = await this._sendFn(agentId, `agent:${agentId}:quality-check`, prompt, 60000)
      if (result.ok) {
        const score = parseInt(result.text.match(/SCORE:\s*(\d+)/)?.[1] || '50')
        const explicitPassed = result.text.match(/PASSED:\s*(true|false)/i)
        const passed = explicitPassed
          ? explicitPassed[1].toLowerCase() === 'true'
          : score >= 60
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
  async _requestPeerReview(reviewerId, task) {
    let peerOutputContent = ''
    if (task.output) {
      const raw = this._readTaskOutput(task)
      peerOutputContent = raw ? raw.slice(0, 5000) : `(无法读取: ${task.output})`
    }

    const prompt = `请 review 以下任务的产出：\n\n任务: ${task.name}\n${task.description ? `描述: ${task.description}` : ''}\n执行者: ${task.assignedAgent || task.assignees?.[0] || '未知'}\n${peerOutputContent ? `产出内容:\n${peerOutputContent}` : '(产出未附带)'}\n\n评审标准：\n1. 完成度 — 是否满足任务要求？\n2. 质量 — 是否有错误或可改进之处？\n3. 一致性 — 是否与项目整体风格一致？\n\n回复格式：\nSCORE: <0-100>\nPASSED: <true/false>\nCOMMENTS: <your review comments>`

    try {
      const result = await this._sendFn(reviewerId, `agent:${reviewerId}:peer-review`, prompt, 60000)
      if (result.ok) {
        const score = parseInt(result.text.match(/SCORE:\s*(\d+)/)?.[1] || '50')
        const explicitPassed = result.text.match(/PASSED:\s*(true|false)/i)
        const passed = explicitPassed
          ? explicitPassed[1].toLowerCase() === 'true'
          : score >= 60
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

    const prompt = `作为部门主管，请审批以下任务：\n\n任务: ${task.name}\n执行者: ${task.assignedAgent || task.assignees?.[0] || '未知'}\n自检评分: ${selfScore}\n同行评审评分: ${peerScore}\n评审意见: ${peerComments}\n\n是否批准完成？回复 APPROVED 或 REJECTED + 原因`

    try {
      const result = await this._sendFn(headId, `agent:${headId}:approval`, prompt, 60000)
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
