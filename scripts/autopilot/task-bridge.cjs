/**
 * Task Bridge — creates/updates tasks in Dashboard via HTTP API.
 *
 * All calls are fire-and-forget: if Dashboard is down, errors are silently logged.
 */
const http = require('http')
const logger = require('./logger.cjs')

const DASHBOARD_BASE = 'http://localhost:3100'
const INTERNAL_TOKEN = process.env.AGENT_FACTORY_TOKEN || 'agent-factory-internal-token-2026'

/**
 * Make a JSON HTTP request to the Dashboard API.
 * @param {string} method - HTTP method
 * @param {string} path - URL path
 * @param {object} [body] - JSON body
 * @returns {Promise<object|null>}
 */
function apiRequest(method, path, body) {
  return new Promise((resolve) => {
    const url = new URL(path, DASHBOARD_BASE)
    const postData = body ? JSON.stringify(body) : null

    const req = http.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTERNAL_TOKEN}`,
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
      timeout: 5000,
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { resolve(null) }
      })
    })

    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })

    if (postData) req.write(postData)
    req.end()
  })
}

/**
 * Create an autopilot cycle task.
 * @param {string} agentId - Agent running the cycle (e.g. 'ceo')
 * @param {string} type - Cycle type (e.g. 'coordination', 'dept-autopilot-cycle')
 * @param {number} cycleNum - Cycle number
 * @returns {Promise<string|null>} - Task ID or null
 */
async function createCycleTask(agentId, type, cycleNum) {
  try {
    const result = await apiRequest('POST', '/api/agent-tasks', {
      agent: agentId,
      name: `${type} cycle #${cycleNum}`,
      type: 'autopilot-cycle',
      priority: 'P2',
    })
    return result?.task?.id || null
  } catch (e) {
    logger.debug('task-bridge', `Failed to create task for ${agentId}`, e)
    return null
  }
}

/**
 * Complete an autopilot cycle task.
 * @param {string} agentId - Agent that owns the task
 * @param {string|null} taskId - Task ID from createCycleTask
 * @param {{ ok: boolean, text?: string, error?: string }} result - Cycle result
 */
async function completeCycleTask(agentId, taskId, result) {
  if (!taskId) return
  try {
    const status = result.ok ? 'completed' : 'failed'
    const output = result.ok
      ? (result.text || '').slice(0, 200)
      : `Error: ${result.error || 'unknown'}`
    await apiRequest('PUT', '/api/agent-tasks', {
      agent: agentId,
      taskId,
      status,
      output,
    })
  } catch (e) {
    logger.debug('task-bridge', `Failed to complete task ${taskId}`, e)
  }
}

/**
 * Create a work task for an agent (used by department-loop auto-dispatch).
 * Fire-and-forget: silently returns null if Dashboard is unavailable.
 *
 * @param {string} assignee - Agent ID to assign the task to
 * @param {string} taskName - Task name/summary
 * @param {string} [deptId] - Department/project ID
 * @param {object} [options] - Additional options (type, priority)
 * @returns {Promise<string|null>} - Task ID or null
 */
async function createWorkTask(assignee, taskName, deptId, options = {}) {
  try {
    const result = await apiRequest('POST', '/api/agent-tasks', {
      agent: assignee,
      name: taskName,
      projectId: deptId || undefined,
      type: options.type || 'dept-work',
      priority: options.priority || 'P1',
    })
    const taskId = result?.task?.id || null
    if (taskId) {
      logger.info('task-bridge', `Created work task ${taskId} for ${assignee}: ${taskName}`)
    }
    return taskId
  } catch (e) {
    logger.debug('task-bridge', `Failed to create work task for ${assignee}`, e)
    return null
  }
}

/**
 * Update a task's status (e.g. pending → in_progress).
 * Fire-and-forget: silently logs on failure.
 *
 * @param {string} agentId - Agent that owns the task
 * @param {string|null} taskId - Task ID to update
 * @param {string} status - New status (e.g. 'in_progress', 'completed')
 */
async function updateTaskStatus(agentId, taskId, status) {
  if (!taskId) return
  try {
    await apiRequest('PUT', '/api/agent-tasks', {
      agent: agentId, taskId, status,
    })
    logger.debug('task-bridge', `Updated task ${taskId} status to ${status}`)
  } catch (e) {
    logger.debug('task-bridge', `Failed to update task ${taskId} status`, e)
  }
}

module.exports = { createCycleTask, completeCycleTask, createWorkTask, updateTaskStatus }
