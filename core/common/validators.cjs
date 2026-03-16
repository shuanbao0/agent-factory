'use strict'

function validateAgentId(id) {
  if (!id || typeof id !== 'string') return { valid: false, error: 'Agent ID is required' }
  if (!/^[a-z0-9-]+$/.test(id)) return { valid: false, error: 'Agent ID must be lowercase alphanumeric with hyphens' }
  if (id.length > 64) return { valid: false, error: 'Agent ID too long (max 64)' }
  return { valid: true }
}

function validateTaskStatus(status) {
  const valid = ['pending', 'assigned', 'in_progress', 'review', 'completed', 'failed', 'rework']
  return valid.includes(status)
}

function sanitizePath(p) {
  if (!p || typeof p !== 'string') return null
  if (p.includes('..')) return null
  return p
}

module.exports = { validateAgentId, validateTaskStatus, sanitizePath }
