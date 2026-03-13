/**
 * Quality Gate — review pipeline for task outputs
 *
 * Flow: self-check → peer review → head approval
 * Triggered when a task enters 'review' status.
 */
const { existsSync, statSync, readFileSync } = require('fs')
const { resolve } = require('path')
const { sendToAgent } = require('./gateway.cjs')
const { loadDeptConfig } = require('./readers.cjs')
const { readAgentActivity } = require('./readers.cjs')
const { PROJECT_ROOT } = require('./constants.cjs')
const logger = require('./logger.cjs')

/**
 * Process quality gate for a task in review status.
 *
 * @param {string} deptId - Department ID
 * @param {object} task - Task object (will be mutated with quality fields)
 * @returns {Promise<{passed: boolean, reason?: string}>}
 */
async function processQualityGate(deptId, task) {
  const config = loadDeptConfig(deptId)
  if (!config) {
    logger.warn('quality-gate', `No config for department ${deptId}`)
    return { passed: true } // Pass through if no config
  }

  task.quality = task.quality || {}

  // 1. Self-check: ask the assigned agent to verify their own work
  try {
    const selfCheck = await requestSelfCheck(task.assignedAgent || task.assignees?.[0], task)
    task.quality.selfCheck = selfCheck
    if (!selfCheck.passed) {
      logger.info('quality-gate', `Self-check failed for task ${task.id}`)
      return { passed: false, reason: `Self-check failed: score ${selfCheck.score}/100` }
    }
  } catch (err) {
    logger.warn('quality-gate', `Self-check error for task ${task.id}`, err)
    return { passed: false, reason: `Self-check exception: ${err.message}` }
  }

  // 2. Peer review: select a reviewer from the department
  const reviewer = selectReviewer(deptId, task, config)
  if (reviewer) {
    try {
      const peerReview = await requestPeerReview(reviewer, task)
      task.quality.peerReview = peerReview
      if (!peerReview.passed) {
        logger.info('quality-gate', `Peer review failed for task ${task.id} by ${reviewer}`)
        return { passed: false, reason: peerReview.comments || 'Peer review rejected' }
      }
    } catch (err) {
      logger.warn('quality-gate', `Peer review error for task ${task.id}`, err)
      return { passed: false, reason: `Peer review exception: ${err.message}` }
    }
  }

  // 3. Head approval
  try {
    const headApproval = await requestHeadApproval(config.head, task)
    task.quality.headApproval = headApproval
    if (!headApproval.passed) {
      logger.info('quality-gate', `Head rejected task ${task.id}`)
      return { passed: false, reason: 'Head rejected' }
    }
  } catch (err) {
    logger.warn('quality-gate', `Head approval error for task ${task.id}`, err)
    return { passed: false, reason: `Head approval exception: ${err.message}` }
  }

  // All gates passed (caller handles status transition)
  logger.info('quality-gate', `Task ${task.id} passed all quality gates`)
  return { passed: true }
}

/**
 * Request self-check from the assigned agent.
 */
async function requestSelfCheck(agentId, task) {
  if (!agentId) return { passed: false, score: 0, checklist: ['无执行者'], at: new Date().toISOString() }

  // Hard validation: check output file exists and meets minimum requirements
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
      // Check for unrendered template variables
      const content = readFileSync(outputPath, 'utf8').slice(0, 5000)
      if (/\$\{[^}]+\}/.test(content)) {
        return { passed: false, score: 0, checklist: ['含未渲染模板变量 ${...}'], at: new Date().toISOString() }
      }
    } catch (err) {
      logger.debug('quality-gate', `File validation error for ${outputPath}`, err)
    }
  }

  const prompt = `请检查你的任务产出质量：

任务: ${task.name}
${task.description ? `描述: ${task.description}` : ''}
${task.output ? `产出: ${task.output.slice(0, 1000)}` : ''}

请按以下清单自检，给出 0-100 的质量评分：
1. 是否完成了任务要求的所有内容？
2. 是否有明显的错误或遗漏？
3. 格式和表述是否规范？
4. 是否可以交付给下一环节？

回复格式：
SCORE: <number>
PASSED: <true/false>
ISSUES: <comma-separated list or "none">`

  try {
    const result = await sendToAgent(agentId, `agent:${agentId}:quality-check`, prompt, 60000)
    if (result.ok) {
      const score = parseInt(result.text.match(/SCORE:\s*(\d+)/)?.[1] || '50')
      const passed = result.text.includes('PASSED: true') || score >= 60
      return {
        passed,
        score,
        checklist: result.text.match(/ISSUES:\s*(.+)/)?.[1]?.split(',').map(s => s.trim()) || [],
        at: new Date().toISOString(),
      }
    }
  } catch (err) {
    logger.debug('quality-gate', `Self-check request failed for ${agentId}`, err)
  }

  // Default: fail on timeout/error — do not silently approve
  return { passed: false, score: 0, checklist: ['self-check 超时或失败'], at: new Date().toISOString() }
}

/**
 * Select a peer reviewer from the department.
 *
 * Rules:
 * 1. Can't review own work
 * 2. Prefer experts for the task type (e.g. style-editor reviews novel chapters)
 * 3. Pick the most idle reviewer
 */
function selectReviewer(deptId, task, config) {
  const agents = config.agents || []
  const assignedAgent = task.assignedAgent || task.assignees?.[0]

  // Preferred reviewers by task type (specialized review agents first)
  const REVIEWER_MAP = {
    'writing':       ['reader-analyst', 'style-editor', 'continuity-mgr'],
    'editing':       ['reader-analyst', 'continuity-mgr'],
    'worldbuilding': ['worldbuilder', 'continuity-mgr'],
    'character':     ['character-designer', 'continuity-mgr'],
    'plotting':      ['plot-architect', 'pacing-designer'],
  }

  // Filter out the assigned agent and the head
  const candidates = agents.filter(a => a !== assignedAgent && a !== config.head)
  if (candidates.length === 0) return null

  // Prioritize specialized reviewers for the task type
  const preferredReviewers = REVIEWER_MAP[task.type] || []
  const preferred = candidates.filter(a => preferredReviewers.includes(a))
  const pool = preferred.length > 0 ? preferred : candidates

  // Pick the most idle candidate from the pool
  const activity = readAgentActivity()
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
 * Request peer review from a specific agent.
 */
async function requestPeerReview(reviewerId, task) {
  const prompt = `请 review 以下任务的产出：

任务: ${task.name}
${task.description ? `描述: ${task.description}` : ''}
执行者: ${task.assignedAgent || task.assignees?.[0] || '未知'}
${task.output ? `产出:\n${task.output.slice(0, 2000)}` : '(产出未附带)'}

评审标准：
1. 完成度 — 是否满足任务要求？
2. 质量 — 是否有错误或可改进之处？
3. 一致性 — 是否与项目整体风格一致？

回复格式：
SCORE: <0-100>
PASSED: <true/false>
COMMENTS: <your review comments>`

  try {
    const result = await sendToAgent(reviewerId, `agent:${reviewerId}:peer-review`, prompt, 60000)
    if (result.ok) {
      const score = parseInt(result.text.match(/SCORE:\s*(\d+)/)?.[1] || '50')
      const passed = result.text.includes('PASSED: true') || score >= 60
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
    logger.debug('quality-gate', `Peer review request failed for ${reviewerId}`, err)
  }

  // Default: fail on timeout/error — do not silently approve
  return { reviewer: reviewerId, passed: false, score: 0, comments: 'peer review 超时或失败', at: new Date().toISOString() }
}

/**
 * Request head approval.
 */
async function requestHeadApproval(headId, task) {
  const selfScore = task.quality?.selfCheck?.score || 'N/A'
  const peerScore = task.quality?.peerReview?.score || 'N/A'
  const peerComments = task.quality?.peerReview?.comments || '(无)'

  const prompt = `作为部门主管，请审批以下任务：

任务: ${task.name}
执行者: ${task.assignedAgent || task.assignees?.[0] || '未知'}
自检评分: ${selfScore}
同行评审评分: ${peerScore}
评审意见: ${peerComments}

是否批准完成？回复 APPROVED 或 REJECTED + 原因`

  try {
    const result = await sendToAgent(headId, `agent:${headId}:approval`, prompt, 60000)
    if (result.ok) {
      const passed = result.text.includes('APPROVED')
      return { approver: headId, passed, at: new Date().toISOString() }
    }
  } catch (err) {
    logger.debug('quality-gate', `Head approval request failed for ${headId}`, err)
  }

  // Default: fail on timeout/error — do not silently approve
  return { approver: headId, passed: false, at: new Date().toISOString() }
}

/**
 * Find tasks in 'review' status for a department.
 */
function findTasksInReview(deptId, projects) {
  const config = loadDeptConfig(deptId)
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

module.exports = { processQualityGate, selectReviewer, findTasksInReview }
