'use strict'
/**
 * TaskBridge — Dashboard API 客户端（任务 CRUD 桥接）
 *
 * 设计模式：Client/Adapter（fire-and-forget）
 */
const http = require('http')

const DASHBOARD_BASE = 'http://localhost:3100'
const INTERNAL_TOKEN = process.env.AGENT_FACTORY_TOKEN || 'agent-factory-internal-token-2026'

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

async function createCycleTask(agentId, type, cycleNum) {
  try {
    const result = await apiRequest('POST', '/api/agent-tasks', {
      agent: agentId,
      name: `${type} cycle #${cycleNum}`,
      type: 'autopilot-cycle',
      priority: 'P2',
    })
    return result?.task?.id || null
  } catch {
    return null
  }
}

async function completeCycleTask(agentId, taskId, result) {
  if (!taskId) return
  try {
    const status = result.ok ? 'completed' : 'failed'
    const output = result.ok
      ? (result.text || '').slice(0, 200)
      : `Error: ${result.error || 'unknown'}`
    await apiRequest('PUT', '/api/agent-tasks', { agent: agentId, taskId, status, output })
  } catch { /* skip */ }
}

async function createWorkTask(assignee, taskName, deptId, options = {}) {
  try {
    const existingId = await findActiveTaskForAgent(assignee, deptId)
    if (existingId) return existingId

    const result = await apiRequest('POST', '/api/agent-tasks', {
      agent: assignee,
      name: taskName,
      projectId: deptId || undefined,
      type: options.type || 'dept-work',
      priority: options.priority || 'P1',
    })
    return result?.task?.id || null
  } catch {
    return null
  }
}

async function updateTaskStatus(agentId, taskId, status, extras) {
  if (!taskId) return
  try {
    await apiRequest('PUT', '/api/agent-tasks', { agent: agentId, taskId, status, ...extras })
  } catch { /* skip */ }
}

async function findActiveTaskForAgent(assignee, deptId) {
  try {
    const params = new URLSearchParams({ agent: assignee })
    if (deptId) params.set('projectId', deptId)
    const result = await apiRequest('GET', `/api/agent-tasks?${params.toString()}`)
    if (!result || !Array.isArray(result.tasks)) return null
    const activeStatuses = new Set(['pending', 'assigned', 'in_progress', 'rework', 'review'])
    const active = result.tasks.find(t => activeStatuses.has(t.status))
    return active ? active.id : null
  } catch {
    return null
  }
}

module.exports = { apiRequest, createCycleTask, completeCycleTask, createWorkTask, updateTaskStatus, findActiveTaskForAgent }
