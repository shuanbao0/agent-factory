'use strict'
/**
 * Validators — 轻量级输入校验工具函数
 *
 * 设计模式：Validation / Guard Clause
 *
 * 职责：
 * - Agent ID 格式校验（小写字母+数字+连字符，最长 64 字符）
 * - 任务状态白名单校验
 * - 路径安全检查（防止目录遍历攻击）
 *
 * 用于系统边界（API 入参、用户输入），内部代码无需校验
 */

/**
 * 校验 Agent ID 格式
 *
 * 规则：
 * - 必须为非空字符串
 * - 只允许小写字母、数字、连字符
 * - 最长 64 字符
 *
 * @param {string} id - Agent ID
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAgentId(id) {
  if (!id || typeof id !== 'string') return { valid: false, error: 'Agent ID is required' }
  if (!/^[a-z0-9-]+$/.test(id)) return { valid: false, error: 'Agent ID must be lowercase alphanumeric with hyphens' }
  if (id.length > 64) return { valid: false, error: 'Agent ID too long (max 64)' }
  return { valid: true }
}

/**
 * 校验任务状态是否在白名单中
 * @param {string} status - 任务状态
 * @returns {boolean}
 */
function validateTaskStatus(status) {
  const valid = ['pending', 'assigned', 'in_progress', 'review', 'completed', 'failed', 'rework']
  return valid.includes(status)
}

/**
 * 路径安全检查：拒绝包含 '..' 的路径（防止目录遍历）
 * @param {string} p - 路径字符串
 * @returns {string|null} 安全的路径，或 null（不安全时）
 */
function sanitizePath(p) {
  if (!p || typeof p !== 'string') return null
  if (p.includes('..')) return null
  return p
}

module.exports = { validateAgentId, validateTaskStatus, sanitizePath }
