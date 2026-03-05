#!/usr/bin/env node
/**
 * inject-base-rules.mjs
 *
 * Re-inject config/base-rules.md into all agents' AGENTS.md and SOUL.md.
 * Idempotent — strips old marker blocks before injecting.
 *
 * Usage:
 *   node scripts/inject-base-rules.mjs              # inject all agents
 *   node scripts/inject-base-rules.mjs novel-chief   # inject single agent
 *   node scripts/inject-base-rules.mjs --dry-run     # preview only
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const AGENTS_DIR = join(ROOT, 'agents')
const BASE_RULES = join(ROOT, 'config', 'base-rules.md')

const DRY_RUN = process.argv.includes('--dry-run')
const targetId = process.argv.slice(2).find(a => !a.startsWith('--'))

// ── Markers (must match ui/src/lib/base-rules.ts) ──

const AGENTS_BEGIN = '<!-- BASE-RULES:BEGIN -->'
const AGENTS_END   = '<!-- BASE-RULES:END -->'
const REMINDER_BEGIN = '<!-- BASE-RULES-REMINDER:BEGIN -->'
const REMINDER_END   = '<!-- BASE-RULES-REMINDER:END -->'
const SOUL_BEGIN = '<!-- BASE-SOUL:BEGIN -->'
const SOUL_END   = '<!-- BASE-SOUL:END -->'

// ── Logic (mirrored from ui/src/lib/base-rules.ts) ──

function strip(content, startMarker, endMarker) {
  const si = content.indexOf(startMarker)
  if (si === -1) return content
  const ei = content.indexOf(endMarker, si)
  if (ei === -1) return content
  const before = content.slice(0, si)
  const after = content.slice(ei + endMarker.length).replace(/^\n{1,2}/, '\n')
  return (before + after).replace(/^\n+/, '')
}

function parseRules(raw) {
  const sections = {}
  const re = /^## (AGENTS_RULES|SOUL_RULES|REMINDER)\s*$/gm
  const matches = []
  let m
  while ((m = re.exec(raw)) !== null) matches.push(m)
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1]
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length
    sections[key] = raw.slice(start, end).trim()
  }
  return {
    agentsRules: sections.AGENTS_RULES || '',
    soulRules: sections.SOUL_RULES || '',
    reminder: sections.REMINDER || '',
  }
}

function injectAgentsMd(content, agentsRules, reminder) {
  let cleaned = strip(content, AGENTS_BEGIN, AGENTS_END)
  cleaned = strip(cleaned, REMINDER_BEGIN, REMINDER_END).trim()
  const parts = []
  if (agentsRules) {
    parts.push(AGENTS_BEGIN, '# 强制执行协议\n', agentsRules, AGENTS_END, '')
  }
  parts.push(cleaned)
  if (reminder) {
    parts.push('', REMINDER_BEGIN, '---', reminder, REMINDER_END)
  }
  return parts.join('\n') + '\n'
}

function injectSoulMd(content, soulRules) {
  let cleaned = strip(content, SOUL_BEGIN, SOUL_END).trim()
  const parts = []
  if (soulRules) {
    parts.push(SOUL_BEGIN, '## 底层信念\n', soulRules, SOUL_END, '')
  }
  parts.push(cleaned)
  return parts.join('\n') + '\n'
}

// ── Main ──

if (!existsSync(BASE_RULES)) {
  console.error('config/base-rules.md not found')
  process.exit(1)
}

const rules = parseRules(readFileSync(BASE_RULES, 'utf-8'))

const agentIds = targetId
  ? [targetId]
  : readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name)

console.log(`${DRY_RUN ? '[DRY-RUN] ' : ''}Injecting base-rules into ${agentIds.length} agent(s)...\n`)

let count = 0
for (const id of agentIds) {
  const dir = join(AGENTS_DIR, id)
  if (!existsSync(dir)) {
    console.log(`  SKIP ${id} (not found)`)
    continue
  }

  let updated = []

  const agentsMdPath = join(dir, 'AGENTS.md')
  if (existsSync(agentsMdPath)) {
    const result = injectAgentsMd(readFileSync(agentsMdPath, 'utf-8'), rules.agentsRules, rules.reminder)
    if (!DRY_RUN) writeFileSync(agentsMdPath, result)
    updated.push('AGENTS.md')
  }

  const soulMdPath = join(dir, 'SOUL.md')
  if (existsSync(soulMdPath)) {
    const result = injectSoulMd(readFileSync(soulMdPath, 'utf-8'), rules.soulRules)
    if (!DRY_RUN) writeFileSync(soulMdPath, result)
    updated.push('SOUL.md')
  }

  console.log(`  ${id}: ${updated.join(', ') || 'no files'}`)
  count++
}

console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}Done. ${count} agent(s) processed.`)
