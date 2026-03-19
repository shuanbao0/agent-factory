'use strict'
/**
 * BaseRulesInjector — 解析 config/base-rules.md 并注入到 Agent 的 AGENTS.md / SOUL.md
 *
 * 三段标记：
 *   ## AGENTS_RULES  → 注入 AGENTS.md 头部
 *   ## SOUL_RULES    → 注入 SOUL.md 头部
 *   ## REMINDER      → 注入 AGENTS.md 尾部
 *
 * 注入使用 HTML 注释 marker 包裹，支持幂等更新。
 */
const { readFileSync, existsSync } = require('fs')
const { join, resolve } = require('path')
const { agentMetaRepo } = require('../repo/agent-meta.cjs')

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const BASE_RULES_PATH = join(PROJECT_ROOT, 'config', 'base-rules.md')

// ── Marker constants ──────────────────────────────────────────

const AGENTS_BEGIN = '<!-- BASE-RULES:BEGIN -->'
const AGENTS_END = '<!-- BASE-RULES:END -->'
const REMINDER_BEGIN = '<!-- BASE-RULES-REMINDER:BEGIN -->'
const REMINDER_END = '<!-- BASE-RULES-REMINDER:END -->'
const SOUL_BEGIN = '<!-- BASE-SOUL:BEGIN -->'
const SOUL_END = '<!-- BASE-SOUL:END -->'

// ── Parsing ───────────────────────────────────────────────────

/**
 * Parse raw base-rules.md content into three sections.
 * @param {string} raw
 * @returns {{ agentsRules: string, soulRules: string, reminder: string }}
 */
function parseBaseRules(raw) {
  const sections = {}
  const sectionPattern = /^## (AGENTS_RULES|SOUL_RULES|REMINDER)\s*$/gm
  const matches = []
  let m
  while ((m = sectionPattern.exec(raw)) !== null) {
    matches.push(m)
  }

  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1]
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length
    sections[key] = raw.slice(start, end).trim()
  }

  return {
    agentsRules: sections['AGENTS_RULES'] || '',
    soulRules: sections['SOUL_RULES'] || '',
    reminder: sections['REMINDER'] || '',
  }
}

// ── Strip / inject helpers ────────────────────────────────────

/**
 * Remove everything between (and including) startMarker and endMarker.
 * @param {string} content
 * @param {string} startMarker
 * @param {string} endMarker
 * @returns {string}
 */
function stripMarkerBlock(content, startMarker, endMarker) {
  const startIdx = content.indexOf(startMarker)
  if (startIdx === -1) return content
  const endIdx = content.indexOf(endMarker, startIdx)
  if (endIdx === -1) return content

  const before = content.slice(0, startIdx)
  const after = content.slice(endIdx + endMarker.length)

  const cleaned = after.replace(/^\n{1,2}/, '\n')
  return (before + cleaned).replace(/^\n+/, '')
}

/**
 * Inject agentsRules at top and reminder at bottom of AGENTS.md content.
 * @param {string} content
 * @param {string} agentsRules
 * @param {string} reminder
 * @returns {string}
 */
function injectIntoAgentsMd(content, agentsRules, reminder) {
  let cleaned = stripMarkerBlock(content, AGENTS_BEGIN, AGENTS_END)
  cleaned = stripMarkerBlock(cleaned, REMINDER_BEGIN, REMINDER_END)
  cleaned = cleaned.trim()

  const parts = []

  if (agentsRules) {
    parts.push(AGENTS_BEGIN)
    parts.push('# 强制执行协议\n')
    parts.push(agentsRules)
    parts.push(AGENTS_END)
    parts.push('')
  }

  parts.push(cleaned)

  if (reminder) {
    parts.push('')
    parts.push(REMINDER_BEGIN)
    parts.push('---')
    parts.push(reminder)
    parts.push(REMINDER_END)
  }

  return parts.join('\n') + '\n'
}

/**
 * Inject soulRules at the top of SOUL.md content.
 * @param {string} content
 * @param {string} soulRules
 * @returns {string}
 */
function injectIntoSoulMd(content, soulRules) {
  let cleaned = stripMarkerBlock(content, SOUL_BEGIN, SOUL_END)
  cleaned = cleaned.trim()

  const parts = []

  if (soulRules) {
    parts.push(SOUL_BEGIN)
    parts.push('## 底层信念\n')
    parts.push(soulRules)
    parts.push(SOUL_END)
    parts.push('')
  }

  parts.push(cleaned)

  return parts.join('\n') + '\n'
}

// ── High-level: inject for a single agent directory ───────────

/**
 * Read config/base-rules.md, parse it, and inject into the given agent directory's
 * AGENTS.md and SOUL.md. No-op if base-rules.md doesn't exist.
 * @param {string} agentDir - Absolute path to agent directory (agents/{id}/)
 */
function injectBaseRulesForAgent(agentDir) {
  if (!existsSync(BASE_RULES_PATH)) return

  const raw = readFileSync(BASE_RULES_PATH, 'utf-8')
  const rules = parseBaseRules(raw)

  // Extract agentId from path
  const parts = agentDir.split('/')
  const agentId = parts[parts.length - 1]

  // Inject into AGENTS.md
  const agentsMd = agentMetaRepo.readAgentFile(agentId, 'AGENTS.md')
  if (agentsMd) {
    const injected = injectIntoAgentsMd(agentsMd, rules.agentsRules, rules.reminder)
    agentMetaRepo.writeAgentFile(agentId, 'AGENTS.md', injected)
  }

  // Inject into SOUL.md
  const soulMd = agentMetaRepo.readAgentFile(agentId, 'SOUL.md')
  if (soulMd) {
    const injected = injectIntoSoulMd(soulMd, rules.soulRules)
    agentMetaRepo.writeAgentFile(agentId, 'SOUL.md', injected)
  }
}

module.exports = {
  parseBaseRules,
  stripMarkerBlock,
  injectIntoAgentsMd,
  injectIntoSoulMd,
  injectBaseRulesForAgent,
  AGENTS_BEGIN, AGENTS_END,
  REMINDER_BEGIN, REMINDER_END,
  SOUL_BEGIN, SOUL_END,
}
