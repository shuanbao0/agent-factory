/**
 * Quality Gate — async review pipeline for task outputs
 *
 * Flow: self-check → peer review → head approval
 * Each stage runs ONE sendToAgent() call per cycle (non-blocking).
 * Previous behavior: all 3 stages ran sequentially in a single cycle (up to 3min block).
 * New behavior: each cycle advances one stage, results stored on task.qualityGate.
 */
const { existsSync, statSync, readFileSync } = require('fs')
const { resolve } = require('path')
const { sendToAgent } = require('./gateway.cjs')
const { sendWithTools } = require('../../shared/anthropic-client.cjs')
const { SELF_CHECK_TOOLS, PEER_REVIEW_TOOLS, HEAD_APPROVAL_TOOLS, parseReviewToolCall } = require('../../shared/review-tools.cjs')
const { trackCost } = require('../../shared/cost-tracker.cjs')
const { loadDeptConfig } = require('./readers.cjs')
const { readAgentActivity } = require('./readers.cjs')
const { PROJECT_ROOT } = require('./constants.cjs')
const { getStrategy } = require('../../shared/task-strategy.cjs')
const { getGateState, initGate, advanceGate, nextAction, isGateDone } = require('../../shared/quality-gate-machine.cjs')
const logger = require('./logger.cjs')

/**
 * Process one quality gate step for a task in review status.
 * Non-blocking: advances at most one stage per call.
 *
 * @param {string} deptId - Department ID
 * @param {object} task - Task object (will be mutated with qualityGate fields)
 * @returns {Promise<{done: boolean, passed?: boolean, reason?: string, stage: string}>}
 */
async function processQualityGate(deptId, task) {
  const config = loadDeptConfig(deptId)
  if (!config) {
    logger.warn('quality-gate', `No config for department ${deptId}`)
    return { done: true, passed: true, stage: 'done' }
  }

  const strategy = getStrategy(task.type, config)
  task._minPassingScore = strategy.minPassingScore

  // Initialize gate if not started
  const gate = getGateState(task)
  if (gate.stage === 'pending') {
    initGate(task)
  }

  const action = nextAction(task)
  if (!action) {
    // Already terminal
    return { done: true, passed: gate.stage === 'done', stage: gate.stage }
  }

  try {
    switch (action) {
      case 'self_checking': {
        // Advance to self_checking first
        if (gate.stage === 'pending') {
          advanceGate(task, 'self_checking')
        }
        const selfCheck = await requestSelfCheck(task.assignedAgent || task.assignees?.[0], task)
        if (selfCheck.passed) {
          advanceGate(task, 'peer_reviewing', selfCheck)
          logger.info('quality-gate', `Task ${task.id} self-check passed (score: ${selfCheck.score})`)
          return { done: false, stage: 'peer_reviewing' }
        } else {
          advanceGate(task, 'failed', selfCheck)
          logger.info('quality-gate', `Task ${task.id} self-check failed (score: ${selfCheck.score})`)
          return { done: true, passed: false, reason: `Self-check failed: score ${selfCheck.score}/100`, stage: 'failed' }
        }
      }

      case 'peer_reviewing': {
        const reviewer = selectReviewer(deptId, task, config)
        if (!reviewer) {
          // No reviewer available — skip to head approval
          advanceGate(task, 'head_approving', { passed: true, score: 0, comments: 'No peer reviewer available', skipped: true })
          logger.info('quality-gate', `Task ${task.id} peer review skipped (no reviewer)`)
          return { done: false, stage: 'head_approving' }
        }
        const peerReview = await requestPeerReview(reviewer, task)
        if (peerReview.passed) {
          advanceGate(task, 'head_approving', peerReview)
          logger.info('quality-gate', `Task ${task.id} peer review passed by ${reviewer} (score: ${peerReview.score})`)
          return { done: false, stage: 'head_approving' }
        } else {
          advanceGate(task, 'failed', peerReview)
          logger.info('quality-gate', `Task ${task.id} peer review failed by ${reviewer}`)
          return { done: true, passed: false, reason: peerReview.comments || 'Peer review rejected', stage: 'failed' }
        }
      }

      case 'head_approving': {
        const headApproval = await requestHeadApproval(config.head, task)
        if (headApproval.passed) {
          advanceGate(task, 'done', headApproval)
          logger.info('quality-gate', `Task ${task.id} passed all quality gates`)
          return { done: true, passed: true, stage: 'done' }
        } else {
          advanceGate(task, 'failed', headApproval)
          logger.info('quality-gate', `Task ${task.id} head rejected`)
          return { done: true, passed: false, reason: 'Head rejected', stage: 'failed' }
        }
      }

      default:
        return { done: true, passed: false, reason: `Unknown gate stage: ${action}`, stage: 'failed' }
    }
  } catch (err) {
    logger.warn('quality-gate', `Quality gate error for task ${task.id} at stage ${action}`, err)
    // Don't advance to failed on error — let it retry next cycle
    return { done: false, reason: `Exception at ${action}: ${err.message}`, stage: action }
  }
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
      const content = readFileSync(outputPath, 'utf8').slice(0, 5000)
      if (/\$\{[^}]+\}/.test(content)) {
        return { passed: false, score: 0, checklist: ['含未渲染模板变量 ${...}'], at: new Date().toISOString() }
      }
    } catch (err) {
      logger.debug('quality-gate', `File validation error for ${outputPath}`, err)
    }
  }

  const selfCheckPrompt = `请检查你的任务产出质量：

任务: ${task.name}
${task.description ? `描述: ${task.description}` : ''}
${task.output ? `产出: ${task.output.slice(0, 1000)}` : ''}

请按以下清单自检，给出 0-100 的质量评分：
1. 是否完成了任务要求的所有内容？
2. 是否有明显的错误或遗漏？
3. 格式和表述是否规范？
4. 是否可以交付给下一环节？

使用 submit_self_check 工具提交评审结果。`

  // Primary: Tool-Use via Anthropic API
  try {
    const result = await sendWithTools({
      system: '你是一个质量检查员，使用工具提交自检结果。',
      user: selfCheckPrompt,
      tools: SELF_CHECK_TOOLS,
    })
    if (result.ok) {
      if (result.usage) {
        trackCost({ model: result.model || 'claude-sonnet-4-6', usage: result.usage, source: `qg:self-check`, agentId })
      }
      const parsed = parseReviewToolCall(result.toolCalls, 'submit_self_check')
      if (parsed) {
        logger.info('quality-gate', `Self-check via tool-use: score=${parsed.score} passed=${parsed.passed}`)
        return {
          passed: parsed.passed,
          score: parsed.score,
          checklist: parsed.issues || [],
          at: new Date().toISOString(),
        }
      }
    }
  } catch (err) {
    logger.debug('quality-gate', `Self-check tool-use failed for ${agentId}, falling back to Gateway`, err)
  }

  // Fallback: Gateway + regex parsing
  const fallbackPrompt = selfCheckPrompt.replace(
    '使用 submit_self_check 工具提交评审结果。',
    '回复格式：\nSCORE: <number>\nPASSED: <true/false>\nISSUES: <comma-separated list or "none">'
  )
  try {
    const result = await sendToAgent(agentId, `agent:${agentId}:quality-check`, fallbackPrompt, 60000)
    if (result.ok) {
      const score = parseInt(result.text.match(/SCORE:\s*(\d+)/)?.[1] || '50')
      const explicitPassed = result.text.match(/PASSED:\s*(true|false)/i)
      const passed = explicitPassed
        ? explicitPassed[1].toLowerCase() === 'true'
        : score >= (task._minPassingScore || 60)
      return {
        passed,
        score,
        checklist: result.text.match(/ISSUES:\s*(.+)/)?.[1]?.split(',').map(s => s.trim()) || [],
        at: new Date().toISOString(),
      }
    }
  } catch (err) {
    logger.debug('quality-gate', `Self-check fallback failed for ${agentId}`, err)
  }

  return { passed: false, score: 0, checklist: ['self-check 超时或失败'], at: new Date().toISOString() }
}

/**
 * Select a peer reviewer from the department.
 */
function selectReviewer(deptId, task, config) {
  const agents = config.agents || []
  const assignedAgent = task.assignedAgent || task.assignees?.[0]

  const strategy = getStrategy(task.type, config)
  const preferredReviewers = strategy.preferredReviewers || []

  const candidates = agents.filter(a => a !== assignedAgent && a !== config.head)
  if (candidates.length === 0) return null

  const preferred = candidates.filter(a => preferredReviewers.includes(a))
  const pool = preferred.length > 0 ? preferred : candidates

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
  const peerReviewPrompt = `请 review 以下任务的产出：

任务: ${task.name}
${task.description ? `描述: ${task.description}` : ''}
执行者: ${task.assignedAgent || task.assignees?.[0] || '未知'}
${task.output ? `产出:\n${task.output.slice(0, 2000)}` : '(产出未附带)'}

评审标准：
1. 完成度 — 是否满足任务要求？
2. 质量 — 是否有错误或可改进之处？
3. 一致性 — 是否与项目整体风格一致？

使用 submit_peer_review 工具提交评审结果。`

  // Primary: Tool-Use via Anthropic API
  try {
    const result = await sendWithTools({
      system: '你是一个同行评审员，使用工具提交评审结果。',
      user: peerReviewPrompt,
      tools: PEER_REVIEW_TOOLS,
    })
    if (result.ok) {
      if (result.usage) {
        trackCost({ model: result.model || 'claude-sonnet-4-6', usage: result.usage, source: `qg:peer-review`, agentId: reviewerId })
      }
      const parsed = parseReviewToolCall(result.toolCalls, 'submit_peer_review')
      if (parsed) {
        logger.info('quality-gate', `Peer review via tool-use: score=${parsed.score} passed=${parsed.passed}`)
        return {
          reviewer: reviewerId,
          passed: parsed.passed,
          score: parsed.score,
          comments: parsed.comments || '',
          at: new Date().toISOString(),
        }
      }
    }
  } catch (err) {
    logger.debug('quality-gate', `Peer review tool-use failed for ${reviewerId}, falling back to Gateway`, err)
  }

  // Fallback: Gateway + regex parsing
  const fallbackPrompt = peerReviewPrompt.replace(
    '使用 submit_peer_review 工具提交评审结果。',
    '回复格式：\nSCORE: <0-100>\nPASSED: <true/false>\nCOMMENTS: <your review comments>'
  )
  try {
    const result = await sendToAgent(reviewerId, `agent:${reviewerId}:peer-review`, fallbackPrompt, 60000)
    if (result.ok) {
      const score = parseInt(result.text.match(/SCORE:\s*(\d+)/)?.[1] || '50')
      const explicitPassed = result.text.match(/PASSED:\s*(true|false)/i)
      const passed = explicitPassed
        ? explicitPassed[1].toLowerCase() === 'true'
        : score >= (task._minPassingScore || 60)
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
    logger.debug('quality-gate', `Peer review fallback failed for ${reviewerId}`, err)
  }

  return { reviewer: reviewerId, passed: false, score: 0, comments: 'peer review 超时或失败', at: new Date().toISOString() }
}

/**
 * Request head approval.
 */
async function requestHeadApproval(headId, task) {
  const selfScore = task.qualityGate?.selfCheck?.score ?? task.quality?.selfCheck?.score ?? 'N/A'
  const peerScore = task.qualityGate?.peerReview?.score ?? task.quality?.peerReview?.score ?? 'N/A'
  const peerComments = task.qualityGate?.peerReview?.comments ?? task.quality?.peerReview?.comments ?? '(无)'

  const approvalPrompt = `作为部门主管，请审批以下任务：

任务: ${task.name}
执行者: ${task.assignedAgent || task.assignees?.[0] || '未知'}
自检评分: ${selfScore}
同行评审评分: ${peerScore}
评审意见: ${peerComments}

使用 submit_approval 工具提交审批结果。`

  // Primary: Tool-Use via Anthropic API
  try {
    const result = await sendWithTools({
      system: '你是部门主管，使用工具提交审批结果。',
      user: approvalPrompt,
      tools: HEAD_APPROVAL_TOOLS,
    })
    if (result.ok) {
      if (result.usage) {
        trackCost({ model: result.model || 'claude-sonnet-4-6', usage: result.usage, source: `qg:head-approval`, agentId: headId })
      }
      const parsed = parseReviewToolCall(result.toolCalls, 'submit_approval')
      if (parsed) {
        logger.info('quality-gate', `Head approval via tool-use: approved=${parsed.approved}`)
        return { approver: headId, passed: parsed.approved, reason: parsed.reason, at: new Date().toISOString() }
      }
    }
  } catch (err) {
    logger.debug('quality-gate', `Head approval tool-use failed for ${headId}, falling back to Gateway`, err)
  }

  // Fallback: Gateway + regex parsing
  const fallbackPrompt = approvalPrompt.replace(
    '使用 submit_approval 工具提交审批结果。',
    '是否批准完成？回复 APPROVED 或 REJECTED + 原因'
  )
  try {
    const result = await sendToAgent(headId, `agent:${headId}:approval`, fallbackPrompt, 60000)
    if (result.ok) {
      const passed = result.text.includes('APPROVED')
      return { approver: headId, passed, at: new Date().toISOString() }
    }
  } catch (err) {
    logger.debug('quality-gate', `Head approval fallback failed for ${headId}`, err)
  }

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
