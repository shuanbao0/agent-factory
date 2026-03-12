#!/usr/bin/env node
/**
 * Department Loop — autonomous cycle engine for a single department
 *
 * Usage:
 *   node scripts/autopilot/department-loop.cjs --dept novel
 *   node scripts/autopilot/department-loop.cjs --dept novel --loop
 *   node scripts/autopilot/department-loop.cjs --dept novel --loop --interval 600
 */
const { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } = require('fs')
const { join } = require('path')
const {
  DEPARTMENTS_DIR, DEFAULT_DEPT_INTERVAL_SEC, MAX_HISTORY_ENTRIES,
  COMPACT_TOKEN_RATIO, DEFAULT_CONTEXT_TOKENS, HEALTH_CHECK_INTERVAL,
  SESSIONS_DIR, SESSION_RESET_INPUT_TOKENS, SESSION_FORCE_COMPACT_TOKENS,
  MIN_EFFECTIVE_RESPONSE_LENGTH, MAX_CONSECUTIVE_FAILURES,
  IDLE_COMPLETE_MINS, STALE_TASK_MINS,
} = require('./constants.cjs')
const { loadDeptConfig, loadDeptState, saveDeptState, getSessionTokenInfo, readAgentActivity, readProjectTasks, readStandaloneTasks } = require('./readers.cjs')
const { sendToAgent, compactSession, killSession } = require('./gateway.cjs')
const { buildDepartmentDirective } = require('./dept-directive.cjs')
const { compressMemoryByRole } = require('./memory.cjs')
const { checkBudget, trackTokenUsage } = require('./budget.cjs')
const { createCycleTask, completeCycleTask, createWorkTask, updateTaskStatus } = require('./task-bridge.cjs')
const logger = require('./logger.cjs')

// Cooldown: skip session health check if recently reset
const sessionResetCooldowns = new Map()  // sessionKey → timestamp
const RESET_COOLDOWN_MS = 120_000

/**
 * Parse task assignments from the chief's structured response.
 * Extracts [任务分配] section and returns agent-task pairs.
 *
 * @param {string} text - Chief's response text
 * @returns {Array<{agentId: string, summary: string}>}
 */
function parseTaskAssignments(text) {
  if (!text) return []
  const match = text.match(/\[任务分配\]\s*\n([\s\S]*?)(?=\n\[|$)/)
  if (!match) return []

  const lines = match[1].split('\n')
  const assignments = []
  for (const line of lines) {
    // Match: - agent-id: 任务摘要 (peer-send 已发送)
    // Or:    - agent-id：任务摘要
    const m = line.match(/^[-*]\s*(\S+?)[:\uff1a]\s*(.+?)(?:\s*[\(\uff08].*[\)\uff09])?\s*$/)
    if (!m) continue
    const [, agentId, summary] = m
    // Skip "无需分配" and similar
    if (/无需分配|不需要|跳过/.test(summary)) continue
    // Skip lines that already contain a task ID (chief created it)
    if (/task-[a-z0-9]/.test(line)) continue
    assignments.push({ agentId, summary: summary.trim() })
  }
  return assignments
}

/**
 * Parse task completions from the chief's structured response.
 * Extracts [任务完成] section (priority) and [进展汇报] section,
 * looking for task IDs with completion keywords.
 *
 * @param {string} text - Chief's response text
 * @returns {string[]} - Deduplicated list of completed task IDs
 */
function parseTaskCompletions(text) {
  if (!text) return []

  const completedIds = new Set()
  const completionKeywords = /完成|已完成|已交付|done|finished|completed|100%/i

  // Parse [任务完成] section (priority)
  const completionMatch = text.match(/\[任务完成\]\s*\n([\s\S]*?)(?=\n\[|$)/)
  if (completionMatch) {
    const lines = completionMatch[1].split('\n')
    for (const line of lines) {
      const m = line.match(/(task-[a-z0-9-]+)/i)
      if (m && !/无/.test(line.trim())) {
        completedIds.add(m[1])
      }
    }
  }

  // Parse [进展汇报] section for completion keywords
  const progressMatch = text.match(/\[进展汇报\]\s*\n([\s\S]*?)(?=\n\[|$)/)
  if (progressMatch) {
    const lines = progressMatch[1].split('\n')
    for (const line of lines) {
      const m = line.match(/(task-[a-z0-9-]+)/i)
      if (m && completionKeywords.test(line)) {
        completedIds.add(m[1])
      }
    }
  }

  return [...completedIds]
}

/**
 * Auto-transition tasks based on agent activity and chief reports.
 *
 * Rules:
 * - Chief reports task completed → completed
 * - in_progress/rework + agent idle >= IDLE_COMPLETE_MINS → completed
 * - in_progress/rework + agent idle >= STALE_TASK_MINS + progress < 50 → failed
 * - assigned + agent active (idle < 5) → in_progress
 * - assigned + agent idle >= STALE_TASK_MINS → failed (never picked up)
 * - review + idle >= IDLE_COMPLETE_MINS → completed (auto-approve)
 *
 * @param {string} deptId
 * @param {object} config - Department config
 * @param {string} chiefResponseText - Chief's response text
 */
async function autoTransitionTasks(deptId, config, chiefResponseText) {
  const agentActivity = readAgentActivity()
  const agents = config.agents || []

  // Collect all tasks assigned to department agents
  const projects = readProjectTasks()
  const allTasks = []
  for (const proj of projects) {
    for (const t of (proj.tasks || [])) {
      const assignees = [t.assignedAgent, ...(t.assignees || [])]
      if (assignees.some(a => agents.includes(a))) {
        allTasks.push(t)
      }
    }
  }
  const standalone = readStandaloneTasks()
  for (const t of standalone) {
    const assignees = [t.assignedAgent, ...(t.assignees || [])]
    if (assignees.some(a => agents.includes(a))) {
      allTasks.push(t)
    }
  }

  if (allTasks.length === 0) return

  // 1. Chief-reported completions
  const chiefCompletions = parseTaskCompletions(chiefResponseText)
  for (const taskId of chiefCompletions) {
    const task = allTasks.find(t => t.id === taskId)
    if (task && (task.status === 'in_progress' || task.status === 'rework')) {
      const assignee = task.assignedAgent || (task.assignees && task.assignees[0])
      if (assignee) updateTaskStatus(assignee, taskId, 'completed')
      logger.info('dept-loop', `Chief reported task ${taskId} completed in ${deptId}`)
    }
  }

  // 2. Idle-based auto-complete / stale cleanup
  for (const task of allTasks) {
    if (!['in_progress', 'rework', 'assigned', 'review'].includes(task.status)) continue
    if (chiefCompletions.includes(task.id)) continue

    const assignee = task.assignedAgent || (task.assignees && task.assignees[0])
    if (!assignee) continue
    const activity = agentActivity[assignee]
    const idleMins = activity ? activity.idleMins : 9999

    if (task.status === 'assigned') {
      if (idleMins < 5) {
        // Agent active → promote to in_progress
        updateTaskStatus(assignee, task.id, 'in_progress')
        logger.debug('dept-loop', `Auto-promoted assigned task ${task.id} to in_progress`)
      } else if (idleMins >= STALE_TASK_MINS) {
        // Agent never picked it up → failed
        updateTaskStatus(assignee, task.id, 'failed')
        logger.warn('dept-loop', `Assigned task ${task.id} never started, marked failed (agent ${assignee} idle ${idleMins}m)`)
      }
    } else if (task.status === 'review') {
      if (idleMins >= IDLE_COMPLETE_MINS) {
        // No one reviewed → auto-approve
        updateTaskStatus(assignee, task.id, 'completed')
        logger.info('dept-loop', `Review task ${task.id} auto-approved (idle ${idleMins}m)`)
      }
    } else if (task.status === 'in_progress' || task.status === 'rework') {
      if (idleMins >= STALE_TASK_MINS && (task.progress || 0) < 50) {
        updateTaskStatus(assignee, task.id, 'failed')
        logger.warn('dept-loop', `Stale task ${task.id} marked failed (idle ${idleMins}m, progress ${task.progress || 0}%)`)
      } else if (idleMins >= IDLE_COMPLETE_MINS) {
        updateTaskStatus(assignee, task.id, 'completed')
        logger.info('dept-loop', `Auto-completed task ${task.id} (agent ${assignee} idle ${idleMins}m)`)
      }
    }
  }
}

/**
 * Run a single department cycle.
 *
 * @param {string} deptId - Department ID (e.g. 'novel')
 * @returns {Promise<{ok: boolean, text?: string, error?: string}>}
 */
async function runDepartmentCycle(deptId) {
  const config = loadDeptConfig(deptId)
  if (!config) {
    logger.error('dept-loop', `No config found for department ${deptId}`)
    return { ok: false, error: 'No config' }
  }

  const state = loadDeptState(deptId)

  // Check budget
  const budget = checkBudget(deptId)
  if (!budget.allowed) {
    logger.warn('dept-loop', `Department ${deptId} over budget, skipping cycle: ${budget.reason}`)
    return { ok: false, error: budget.reason }
  }
  if (budget.warning) {
    logger.warn('dept-loop', `Department ${deptId} approaching budget limit`)
  }

  // Concurrency guard
  if (state.status === 'cycling') {
    logger.warn('dept-loop', `Department ${deptId} already cycling, skipping`)
    return { ok: false, error: 'Already cycling' }
  }

  state.cycleCount = (state.cycleCount || 0) + 1
  state.status = 'cycling'
  state.lastCycleAt = new Date().toISOString()
  saveDeptState(deptId, state)

  const startTime = Date.now()
  logger.info('dept-loop', `Department ${deptId} cycle #${state.cycleCount} started`)

  const taskId = await createCycleTask(config.head, `dept-${deptId}-cycle`, state.cycleCount)

  try {
    const sessionKey = `agent:${config.head}:dept-autopilot`

    // ── Step 1: Session health check before sending ──
    await ensureSessionHealth(config.head, sessionKey, deptId)

    // ── Step 1.5: Auto-transition stale tasks BEFORE sending ──
    // Workers have been idle ~10min since last cycle; checking now ensures
    // idle-based completion fires before sendToAgent resets idle timers.
    await autoTransitionTasks(deptId, config, '').catch(e =>
      logger.debug('dept-loop', `Pre-send auto-transition error for ${deptId}`, e)
    )

    // Snapshot idle workers BEFORE sending to chief
    const workers = (config.agents || []).filter(id => id !== config.head)
    const activityBefore = readAgentActivity()
    const idleWorkersBefore = workers.filter(id => {
      const a = activityBefore[id]
      return !a || a.idleMins >= 5
    })

    // Build directive for department head
    const directive = buildDepartmentDirective(deptId, config, state)

    // Send to department head
    const result = await sendToAgent(config.head, sessionKey, directive)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.ok) {
      logger.info('dept-loop', `Department ${deptId} cycle #${state.cycleCount} completed in ${elapsed}s`)

      // ── Auto-create tasks from chief's response ──
      const assignments = parseTaskAssignments(result.text)
      if (assignments.length > 0) {
        const taskPromises = assignments.map(({ agentId, summary }) =>
          createWorkTask(agentId, summary, deptId, { type: 'dept-work' })
            .then(taskId => ({ agentId, taskId }))
        )
        Promise.allSettled(taskPromises).then(results => {
          const created = results.filter(r => r.status === 'fulfilled' && r.value?.taskId)
          if (created.length > 0) {
            logger.info('dept-loop', `Auto-created ${created.length} tasks from chief response in dept ${deptId}`)
            for (const r of created) {
              updateTaskStatus(r.value.agentId, r.value.taskId, 'in_progress')
            }
          }
        })
      }

      // ── Auto-transition stale tasks ──
      autoTransitionTasks(deptId, config, result.text).catch(e =>
        logger.debug('dept-loop', `Auto-transition error for ${deptId}`, e)
      )

      // ── Response validation: token check ──
      const responseLength = (result.text || '').trim().length
      const isEffective = responseLength >= MIN_EFFECTIVE_RESPONSE_LENGTH
      if (!isEffective) {
        state.consecutiveFailures = (state.consecutiveFailures || 0) + 1
        logger.warn('dept-loop', `Department ${deptId} chief ineffective response: ${responseLength} chars (cycle #${state.cycleCount}, consecutive failures: ${state.consecutiveFailures})`)
      } else {
        state.consecutiveFailures = 0
      }

      // ── Dispatch verification: did chief actually send work to idle agents? ──
      let dispatchNeeded = false
      if (isEffective && idleWorkersBefore.length > 0) {
        // Wait a moment for session files to be updated by gateway
        await new Promise(r => setTimeout(r, 2000))
        const activityAfter = readAgentActivity()
        const stillIdle = idleWorkersBefore.filter(id => {
          const a = activityAfter[id]
          return !a || a.idleMins >= 3  // slight grace: 3min vs 5min
        })
        if (stillIdle.length === idleWorkersBefore.length) {
          // Chief produced tokens but none of the idle agents received work
          state.dispatchMisses = (state.dispatchMisses || 0) + 1
          logger.warn('dept-loop', `Department ${deptId}: chief responded but ${stillIdle.length} idle agents still idle (miss #${state.dispatchMisses})`)
          if (state.dispatchMisses >= MAX_CONSECUTIVE_FAILURES) {
            dispatchNeeded = true
            state.dispatchMisses = 0
          }
        } else {
          state.dispatchMisses = 0
          logger.debug('dept-loop', `Department ${deptId}: dispatch verified, ${idleWorkersBefore.length - stillIdle.length} agents activated`)
        }
      }

      // Generate department report
      generateDepartmentReport(deptId, result.text)

      // Track token usage
      if (result.usage) {
        trackTokenUsage(deptId, result.usage)
      }

      // Compress memory for department head (role-aware)
      try {
        compressMemoryByRole(config.head, result.text, 'leader')
      } catch (e) {
        logger.debug('dept-loop', `Memory compression failed for ${config.head}`, e)
      }

      // ── Fallback dispatch: triggered by token failure OR dispatch miss ──
      if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES || dispatchNeeded) {
        const reason = dispatchNeeded
          ? `idle agents not receiving work for ${MAX_CONSECUTIVE_FAILURES} cycles`
          : `chief produced < ${MIN_EFFECTIVE_RESPONSE_LENGTH} chars for ${state.consecutiveFailures} cycles`
        logger.warn('dept-loop', `Department ${deptId} fallback dispatch triggered: ${reason}`)
        await fallbackDispatch(deptId, config)
        // Reset session to clear bloated context that caused the failure
        try {
          await killSession(sessionKey)
          sessionResetCooldowns.set(sessionKey, Date.now())
          logger.info('dept-loop', `Reset chief session ${sessionKey} after fallback dispatch`)
        } catch (e) {
          logger.debug('dept-loop', `Failed to reset chief session after fallback`, e)
        }
        state.consecutiveFailures = 0
      }

      // Periodic health check: compact oversized sessions + save member memories
      if (state.cycleCount % HEALTH_CHECK_INTERVAL === 0) {
        await runHealthCheck(deptId, config, result.text)
      }

      // Update state
      state.status = 'idle'
      state.lastCycleResult = result.text.slice(0, 500)
      state.history = state.history || []
      state.history.push({
        cycle: state.cycleCount,
        startedAt: state.lastCycleAt,
        completedAt: new Date().toISOString(),
        elapsedSec: parseFloat(elapsed),
        result: result.text.slice(0, 300),
        responseLength,
        effective: isEffective,
        idleWorkers: idleWorkersBefore.length,
      })
      if (state.history.length > MAX_HISTORY_ENTRIES) {
        state.history = state.history.slice(-MAX_HISTORY_ENTRIES)
      }
      saveDeptState(deptId, state)

      await completeCycleTask(config.head, taskId, result)
      return { ok: true, text: result.text }
    } else {
      logger.error('dept-loop', `Department ${deptId} cycle failed: ${result.error}`)
      // Still run idle-based auto-transition even when chief fails
      autoTransitionTasks(deptId, config, '').catch(e =>
        logger.debug('dept-loop', `Auto-transition error for ${deptId} (on failure path)`, e)
      )
      state.consecutiveFailures = (state.consecutiveFailures || 0) + 1
      state.status = 'error'
      state.lastCycleResult = `Error: ${result.error}`
      saveDeptState(deptId, state)
      await completeCycleTask(config.head, taskId, result)
      return { ok: false, error: result.error }
    }
  } catch (err) {
    logger.error('dept-loop', `Department ${deptId} cycle error`, err)
    // Still run idle-based auto-transition even on exception
    autoTransitionTasks(deptId, config, '').catch(() => {})
    state.consecutiveFailures = (state.consecutiveFailures || 0) + 1
    state.status = 'error'
    state.lastCycleResult = `Error: ${err.message}`
    saveDeptState(deptId, state)
    await completeCycleTask(config.head, taskId, { ok: false, error: err.message })
    return { ok: false, error: err.message }
  }
}

/**
 * Ensure department head session is healthy before sending a directive.
 * Resets session if inputTokens exceed threshold, compacts if moderately bloated.
 */
async function ensureSessionHealth(headAgent, sessionKey, deptId) {
  // Cooldown: skip check if recently reset
  const lastReset = sessionResetCooldowns.get(sessionKey)
  if (lastReset && Date.now() - lastReset < RESET_COOLDOWN_MS) {
    logger.debug('dept-loop', `Session ${sessionKey} recently reset, skipping health check`)
    return
  }

  const sessInfo = getSessionTokenInfo(headAgent, sessionKey)
  if (!sessInfo) return

  const inputTokens = sessInfo.totalTokens || 0

  if (inputTokens > SESSION_RESET_INPUT_TOKENS) {
    logger.warn('dept-loop', `Session ${sessionKey} bloated (${inputTokens} tokens > ${SESSION_RESET_INPUT_TOKENS}), resetting`)
    try {
      await killSession(sessionKey)
      sessionResetCooldowns.set(sessionKey, Date.now())
      logger.info('dept-loop', `Reset session ${sessionKey} for ${deptId}`)
    } catch (e) {
      logger.error('dept-loop', `Failed to reset bloated session ${sessionKey}`, e)
    }
  } else if (inputTokens > SESSION_FORCE_COMPACT_TOKENS) {
    logger.info('dept-loop', `Session ${sessionKey} moderately bloated (${inputTokens} tokens > ${SESSION_FORCE_COMPACT_TOKENS}), compacting`)
    try {
      await compactSession(sessionKey)
      logger.info('dept-loop', `Compacted session ${sessionKey} for ${deptId}`)
    } catch (e) {
      logger.debug('dept-loop', `Failed to compact session ${sessionKey}`, e)
    }
  }
}

/**
 * Fallback dispatch: when the department head fails to produce effective responses
 * for MAX_CONSECUTIVE_FAILURES cycles, directly send tasks to idle workers.
 */
async function fallbackDispatch(deptId, config) {
  const { readProjectTasks, readAgentMeta } = require('./readers.cjs')
  const { execFile } = require('child_process')
  const { promisify } = require('util')
  const execFileAsync = promisify(execFile)
  const { PROJECT_ROOT } = require('./constants.cjs')

  const agentActivity = readAgentActivity()
  const agents = config.agents || []
  const head = config.head

  // Find idle workers (not the head)
  const idleAgents = agents.filter(id => {
    if (id === head) return false
    const a = agentActivity[id]
    if (!a) return true  // No activity record = idle
    return a.idleMins >= 5  // 5+ minutes idle
  })

  if (idleAgents.length === 0) {
    logger.info('dept-loop', `Fallback dispatch for ${deptId}: no idle agents found`)
    return
  }

  // Find pending tasks for this department
  const projects = readProjectTasks()
  const pendingTasks = []
  for (const proj of projects) {
    for (const t of (proj.tasks || [])) {
      if (t.status === 'pending' || t.status === 'assigned') {
        const assignees = [t.assignedAgent, ...(t.assignees || [])]
        if (assignees.some(a => agents.includes(a))) {
          pendingTasks.push({ ...t, projectName: proj.name })
        }
      }
    }
  }

  // Build generic task message for idle agents without specific tasks
  const peerSendScript = join(PROJECT_ROOT, 'skills', 'peer-status', 'scripts', 'peer-send.mjs')

  let dispatched = 0
  for (const agentId of idleAgents) {
    // Find a task specifically assigned to this agent, or use a generic prompt
    const agentTask = pendingTasks.find(t =>
      t.assignedAgent === agentId || (t.assignees || []).includes(agentId)
    )

    let message
    if (agentTask) {
      // Existing task — reference its ID in the message, mark as in_progress
      updateTaskStatus(agentId, agentTask.id, 'in_progress')
      message = `[Fallback Dispatch from department-loop]\n\n[Task: ${agentTask.id}] 你有一个待办任务需要继续：\n- 项目: ${agentTask.projectName}\n- 任务: [${agentTask.id}] ${agentTask.name}\n${agentTask.description ? `- 描述: ${agentTask.description}` : ''}\n\n请立即开始工作。`
    } else {
      // No existing task — create one before dispatching
      const meta = readAgentMeta(agentId)
      const roleDesc = meta && meta.description ? meta.description : agentId
      const taskId = await createWorkTask(agentId, `[${deptId}] ${agentId} 空闲派发`, deptId, {
        type: 'fallback-dispatch',
      })
      if (taskId) {
        updateTaskStatus(agentId, taskId, 'in_progress')
      }
      const taskRef = taskId ? `[Task: ${taskId}] ` : ''
      message = `[Fallback Dispatch from department-loop]\n\n${taskRef}你当前处于空闲状态。你的职责是：${roleDesc}。请严格在你的职责范围内行动。\n请检查你的工作空间和任务列表，继续推进你职责范围内未完成的工作。\n\n⚠️ 重要：不要创建或接手超出你职责范围的任务。如果发现需要其他角色完成的工作，请通过 peer-send 通知部门主管 ${head}，由主管负责分配。`
    }

    try {
      await execFileAsync('node', [peerSendScript, '--from', head, '--to', agentId, '--message', message, '--no-wait'], {
        cwd: PROJECT_ROOT,
        timeout: 30000,
      })
      dispatched++
      logger.info('dept-loop', `Fallback dispatch: sent task to ${agentId} in dept ${deptId}`)
    } catch (e) {
      logger.error('dept-loop', `Fallback dispatch failed for ${agentId}: ${e.message}`)
    }
  }

  if (dispatched > 0) {
    logger.info('dept-loop', `Fallback dispatch for ${deptId}: dispatched to ${dispatched}/${idleAgents.length} idle agents`)

    // Record in department report
    const reportNote = `\n\n---\n⚠️ **Fallback Dispatch** (${new Date().toISOString()})\nChief 连续 ${MAX_CONSECUTIVE_FAILURES} 轮无有效产出，department-loop 直接派发任务给 ${dispatched} 个空闲 agent。\n`
    try {
      const reportPath = join(DEPARTMENTS_DIR, deptId, 'report.md')
      if (existsSync(reportPath)) {
        const existing = readFileSync(reportPath, 'utf-8')
        writeFileSync(reportPath, existing + reportNote)
      }
    } catch (e) {
      logger.debug('dept-loop', `Failed to append fallback note to report`, e)
    }
  }
}

/**
 * Generate a department report from the head's response.
 */
function generateDepartmentReport(deptId, responseText) {
  const deptDir = join(DEPARTMENTS_DIR, deptId)
  if (!existsSync(deptDir)) mkdirSync(deptDir, { recursive: true })
  const reportPath = join(deptDir, 'report.md')
  const timestamp = new Date().toISOString()

  const report = `# ${deptId} Department Report\n\nGenerated: ${timestamp}\n\n${responseText.slice(0, 3000)}\n`

  try {
    writeFileSync(reportPath, report)
    logger.debug('dept-loop', `Report generated for ${deptId}`)
  } catch (err) {
    logger.error('dept-loop', `Failed to write report for ${deptId}`, err)
  }
}

/**
 * Periodic health check: compact oversized sessions + save team member memories.
 *
 * @param {string} deptId
 * @param {object} config - Department config
 * @param {string} headResponse - Latest head response (for context)
 */
async function runHealthCheck(deptId, config, headResponse) {
  const agents = config.agents || []
  const compactThreshold = DEFAULT_CONTEXT_TOKENS * COMPACT_TOKEN_RATIO

  logger.info('dept-loop', `Running health check for ${deptId} (${agents.length} agents)`)

  for (const agentId of agents) {
    // Save member memories (not the head — head is handled above)
    if (agentId !== config.head) {
      try {
        // Read last response from the agent's session (we use the head's response as context
        // since we don't have direct access to the member's last response from here)
        compressMemoryByRole(agentId, null, 'member')
      } catch (e) {
        logger.debug('dept-loop', `Member memory save skipped for ${agentId} (no response)`, e)
      }
    }

    // Check main session
    const mainKey = `agent:${agentId}:main`
    const mainInfo = getSessionTokenInfo(agentId, mainKey)
    if (mainInfo && mainInfo.totalTokens > compactThreshold) {
      try {
        const res = await compactSession(mainKey)
        if (res.ok) {
          logger.info('dept-loop', `Compacted ${mainKey} (was ${mainInfo.totalTokens} tokens)`)
        } else {
          logger.warn('dept-loop', `Compact failed for ${mainKey}: ${res.error}`)
        }
      } catch (e) {
        logger.debug('dept-loop', `Compact error for ${mainKey}`, e)
      }
    }

    // Check dept-autopilot session for the head
    if (agentId === config.head) {
      const headKey = `agent:${agentId}:dept-autopilot`
      const headInfo = getSessionTokenInfo(agentId, headKey)
      if (headInfo && headInfo.totalTokens > compactThreshold) {
        try {
          const res = await compactSession(headKey)
          if (res.ok) {
            logger.info('dept-loop', `Compacted ${headKey} (was ${headInfo.totalTokens} tokens)`)
          } else {
            logger.warn('dept-loop', `Compact failed for ${headKey}: ${res.error}`)
          }
        } catch (e) {
          logger.debug('dept-loop', `Compact error for ${headKey}`, e)
        }
      }
    }
  }

  // Clean up stale sessions (inactive > 14 days, non-:main)
  await cleanStaleSessions(14)
}

/**
 * Kill sessions that have been inactive for more than maxDays days.
 * Skips :main sessions (primary agent sessions).
 */
async function cleanStaleSessions(maxDays = 14) {
  const cutoff = Date.now() - maxDays * 86400_000
  let cleaned = 0

  try {
    if (!existsSync(SESSIONS_DIR)) return
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
            try {
              await killSession(key)
              cleaned++
              logger.debug('dept-loop', `Cleaned stale session ${key} (inactive ${Math.round((Date.now() - updatedAt) / 86400_000)}d)`)
            } catch (e) {
              logger.debug('dept-loop', `Failed to kill stale session ${key}`, e)
            }
          }
        }
      } catch { /* skip */ }
    }
  } catch (e) {
    logger.debug('dept-loop', 'Stale session cleanup error', e)
  }

  if (cleaned > 0) {
    logger.info('dept-loop', `Cleaned ${cleaned} stale sessions`)
  }
}

// ── CLI mode ────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2)
  const deptIdx = args.indexOf('--dept')
  const deptId = deptIdx >= 0 ? args[deptIdx + 1] : null
  const isLoop = args.includes('--loop')
  const intervalIdx = args.indexOf('--interval')
  const intervalSec = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1]) || DEFAULT_DEPT_INTERVAL_SEC : DEFAULT_DEPT_INTERVAL_SEC

  if (!deptId) {
    console.error('Usage: node department-loop.cjs --dept <deptId> [--loop] [--interval <seconds>]')
    process.exit(1)
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log(`\n🛑 Department ${deptId} loop shutting down...`)
    const state = loadDeptState(deptId)
    state.status = 'stopped'
    state.pid = null
    saveDeptState(deptId, state)
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  async function run() {
    // Store PID
    const state = loadDeptState(deptId)
    state.pid = process.pid
    state.status = isLoop ? 'running' : 'idle'
    saveDeptState(deptId, state)

    console.log(`🏭 Department ${deptId} ${isLoop ? 'loop' : 'single cycle'} mode (PID: ${process.pid})`)

    await runDepartmentCycle(deptId)

    if (isLoop) {
      // Restore running status after cycle (runDepartmentCycle sets idle/error)
      const restoreRunning = () => {
        const s = loadDeptState(deptId)
        if (s.status !== 'stopped') {
          s.status = 'running'
          saveDeptState(deptId, s)
        }
      }
      restoreRunning()
      console.log(`\n⏳ Next cycle in ${intervalSec}s...\n`)
      const loop = async () => {
        await runDepartmentCycle(deptId)
        restoreRunning()
        console.log(`\n⏳ Next cycle in ${intervalSec}s...\n`)
        setTimeout(loop, intervalSec * 1000)
      }
      setTimeout(loop, intervalSec * 1000)
    } else {
      const s = loadDeptState(deptId)
      s.status = 'stopped'
      s.pid = null
      saveDeptState(deptId, s)
    }
  }

  run().catch(err => {
    logger.error('dept-loop', 'Fatal error', err)
    process.exit(1)
  })
}

module.exports = { runDepartmentCycle, generateDepartmentReport, ensureSessionHealth, fallbackDispatch, parseTaskAssignments, parseTaskCompletions, autoTransitionTasks }
