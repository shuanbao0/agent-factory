'use strict'
/**
 * MemoryManager — 结构化记忆管理（角色感知压缩策略）
 *
 * 设计模式：Strategy（角色策略）
 *
 * 记忆层次：
 * - SUMMARY.md — 概要（每次循环更新）
 * - decisions/YYYY-MM-DD.md — 每日决策日志
 * - lessons/what-worked.md — 经验教训（CEO 专用）
 * - work-output/YYYY-MM-DD.md — 工作产出（member 专用）
 * - domains/knowledge.md — 领域知识（member 专用）
 */
const { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } = require('fs')
const { join, resolve } = require('path')

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const MAX_DOMAIN_KNOWLEDGE_CHARS = 3000

/**
 * Build structured memory context for an agent.
 * @param {string} agentId
 * @param {'coordination'|'strategy'|'department'} cycleType
 * @returns {object} { summary, recentDecisions, departmentStatus, lessonsLearned }
 */
function buildMemoryContext(agentId, cycleType) {
  const agentDir = join(AGENTS_DIR, agentId)
  const memoryDir = join(agentDir, 'memory')
  const result = {}

  // Always include summary
  const summaryPath = join(memoryDir, 'SUMMARY.md')
  if (existsSync(summaryPath)) {
    try {
      result.summary = readFileSync(summaryPath, 'utf-8').slice(0, 2000)
    } catch { /* skip */ }
  }

  // Fallback to MEMORY.md
  if (!result.summary) {
    const memoryPath = join(agentDir, 'MEMORY.md')
    if (existsSync(memoryPath)) {
      try {
        result.summary = extractSummaryFromMemory(readFileSync(memoryPath, 'utf-8'))
      } catch { /* skip */ }
    }
  }

  // Recent decisions (last 7 days)
  if (cycleType === 'coordination' || cycleType === 'strategy') {
    const decisionsDir = join(memoryDir, 'decisions')
    if (existsSync(decisionsDir)) {
      try {
        const files = require('fs').readdirSync(decisionsDir)
          .filter(f => f.endsWith('.md'))
          .sort()
          .slice(-7)
        let decisions = ''
        for (const f of files) {
          try {
            const content = readFileSync(join(decisionsDir, f), 'utf-8')
            decisions += `\n### ${f.replace('.md', '')}\n${content.slice(0, 500)}\n`
          } catch { /* skip */ }
        }
        if (decisions) result.recentDecisions = decisions.slice(0, 3000)
      } catch { /* skip */ }
    }
  }

  // Lessons learned (strategy only)
  if (cycleType === 'strategy') {
    const lessonsPath = join(memoryDir, 'lessons', 'what-worked.md')
    if (existsSync(lessonsPath)) {
      try {
        result.lessonsLearned = readFileSync(lessonsPath, 'utf-8').slice(0, 2000)
      } catch { /* skip */ }
    }
  }

  return result
}

/**
 * Extract concise summary from raw MEMORY.md.
 */
function extractSummaryFromMemory(raw) {
  if (!raw) return ''
  const sections = []
  const sectionRegex = /^##\s+(.+)$/gm
  let match
  while ((match = sectionRegex.exec(raw)) !== null) {
    sections.push({ title: match[1], start: match.index })
  }
  if (sections.length === 0) return raw.slice(0, 2000)

  const priorities = ['当前状态', '需要用户决策', '下轮关注', '本轮总结', '关键进展', 'Status', 'Current']
  let summary = ''
  for (const prio of priorities) {
    const section = sections.find(s => s.title.includes(prio))
    if (section) {
      const nextSection = sections.find(s => s.start > section.start)
      const end = nextSection ? nextSection.start : raw.length
      const content = raw.slice(section.start, end).trim()
      if (summary.length + content.length < 2000) {
        summary += content + '\n\n'
      }
    }
  }
  return summary || raw.slice(0, 2000)
}

/** Extract decision entry from response */
function extractDecisionEntry(response, timestamp) {
  if (!response || response.length < 20) return null
  const lines = response.split('\n').filter(l => l.trim())
  const summary = lines.slice(0, 5).join('\n')
  return `#### ${timestamp}\n${summary.slice(0, 500)}`
}

/** Build summary from response */
function buildSummaryFromResponse(response, date) {
  if (!response || response.length < 20) return null
  const lines = response.split('\n').filter(l => l.trim())
  const firstLines = lines.slice(0, 10).join('\n')
  return `# Agent Memory Summary\n\nLast updated: ${date}\n\n## 最新状态\n${firstLines.slice(0, 1000)}\n`
}

/**
 * Compress memory after a successful cycle.
 */
function compressMemory(agentId, fullResponse) {
  if (!fullResponse) return
  const agentDir = join(AGENTS_DIR, agentId)
  const memoryDir = join(agentDir, 'memory')
  const dirs = [memoryDir, join(memoryDir, 'decisions'), join(memoryDir, 'lessons')]
  for (const dir of dirs) {
    if (!existsSync(dir)) try { mkdirSync(dir, { recursive: true }) } catch { /* skip */ }
  }

  const today = new Date().toISOString().slice(0, 10)
  const timestamp = new Date().toISOString().slice(11, 19)

  const decisionsFile = join(memoryDir, 'decisions', `${today}.md`)
  try {
    const entry = extractDecisionEntry(fullResponse, timestamp)
    if (entry) appendFileSync(decisionsFile, entry + '\n\n')
  } catch { /* skip */ }

  const summaryFile = join(memoryDir, 'SUMMARY.md')
  try {
    const summary = buildSummaryFromResponse(fullResponse, today)
    if (summary) writeFileSync(summaryFile, summary)
  } catch { /* skip */ }
}

/** Extract work output summary from member response */
function extractWorkOutput(response, timestamp) {
  if (!response || response.length < 20) return null
  const lines = response.split('\n').filter(l => l.trim())
  const outputKeywords = ['完成', '创建', '生成', '写入', '输出', '产出',
    'completed', 'created', 'generated', 'wrote', 'output', 'produced',
    'saved', 'published', 'updated', 'built']
  const relevantLines = lines.filter(l => {
    const lower = l.toLowerCase()
    return outputKeywords.some(k => lower.includes(k))
  })
  const summary = relevantLines.length > 0
    ? relevantLines.slice(0, 8).join('\n')
    : lines.slice(0, 5).join('\n')
  return `#### ${timestamp}\n${summary.slice(0, 500)}`
}

/** Update domain knowledge for a member */
function updateDomainKnowledge(agentId, response) {
  if (!response || response.length < 50) return
  const memoryDir = join(AGENTS_DIR, agentId, 'memory', 'domains')
  const knowledgePath = join(memoryDir, 'knowledge.md')
  const knowledgeKeywords = ['发现', '学到', '注意', '规律', '模式', '技巧', '经验',
    'learned', 'discovered', 'pattern', 'insight', 'technique', 'finding', 'note']
  const lines = response.split('\n').filter(l => l.trim())
  const knowledgeLines = lines.filter(l => {
    const lower = l.toLowerCase()
    return knowledgeKeywords.some(k => lower.includes(k))
  })
  if (knowledgeLines.length === 0) return

  const newKnowledge = knowledgeLines.slice(0, 5).join('\n')
  let existing = ''
  if (existsSync(knowledgePath)) existing = readFileSync(knowledgePath, 'utf-8')

  if (existing && newKnowledge.split('\n').every(line =>
    line.length < 10 || existing.includes(line.trim())
  )) return

  const today = new Date().toISOString().slice(0, 10)
  const updated = existing
    ? `${existing}\n\n### ${today}\n${newKnowledge}`
    : `# Domain Knowledge\n\n### ${today}\n${newKnowledge}`

  if (updated.length > MAX_DOMAIN_KNOWLEDGE_CHARS) {
    const header = '# Domain Knowledge\n\n'
    const trimmed = updated.slice(updated.length - MAX_DOMAIN_KNOWLEDGE_CHARS + header.length)
    const nextSection = trimmed.indexOf('\n### ')
    const clean = nextSection >= 0 ? trimmed.slice(nextSection + 1) : trimmed
    writeFileSync(knowledgePath, header + clean)
  } else {
    writeFileSync(knowledgePath, updated)
  }
}

/** Update lessons learned for CEO */
function updateLessons(agentId, response) {
  if (!response || response.length < 50) return
  const lessonsPath = join(AGENTS_DIR, agentId, 'memory', 'lessons', 'what-worked.md')
  const lessonKeywords = ['成功', '有效', '改进', '教训', '失败', '经验',
    'worked', 'success', 'improve', 'lesson', 'failed', 'better']
  const lines = response.split('\n').filter(l => l.trim())
  const lessonLines = lines.filter(l => {
    const lower = l.toLowerCase()
    return lessonKeywords.some(k => lower.includes(k))
  })
  if (lessonLines.length === 0) return

  const today = new Date().toISOString().slice(0, 10)
  const entry = `\n### ${today}\n${lessonLines.slice(0, 5).join('\n')}\n`
  let existing = ''
  if (existsSync(lessonsPath)) existing = readFileSync(lessonsPath, 'utf-8')

  const updated = existing ? existing + entry : `# Lessons Learned\n${entry}`
  if (updated.length > 5000) {
    const header = '# Lessons Learned\n'
    const trimmed = updated.slice(updated.length - 5000 + header.length)
    const nextSection = trimmed.indexOf('\n### ')
    const clean = nextSection >= 0 ? trimmed.slice(nextSection + 1) : trimmed
    writeFileSync(lessonsPath, header + clean)
  } else {
    writeFileSync(lessonsPath, updated)
  }
}

/**
 * Role-aware memory compression.
 * @param {string} agentId
 * @param {string} fullResponse
 * @param {'ceo'|'leader'|'member'} role
 */
function compressMemoryByRole(agentId, fullResponse, role) {
  if (!fullResponse) return
  const agentDir = join(AGENTS_DIR, agentId)
  const memoryDir = join(agentDir, 'memory')
  if (!existsSync(memoryDir)) try { mkdirSync(memoryDir, { recursive: true }) } catch { /* skip */ }

  const today = new Date().toISOString().slice(0, 10)
  const timestamp = new Date().toISOString().slice(11, 19)

  // All roles: update SUMMARY.md
  try {
    const summary = buildSummaryFromResponse(fullResponse, today)
    if (summary) writeFileSync(join(memoryDir, 'SUMMARY.md'), summary)
  } catch { /* skip */ }

  if (role === 'ceo' || role === 'leader') {
    const decisionsDir = join(memoryDir, 'decisions')
    if (!existsSync(decisionsDir)) try { mkdirSync(decisionsDir, { recursive: true }) } catch { /* skip */ }
    try {
      const entry = extractDecisionEntry(fullResponse, timestamp)
      if (entry) appendFileSync(join(decisionsDir, `${today}.md`), entry + '\n\n')
    } catch { /* skip */ }

    if (role === 'ceo') {
      const lessonsDir = join(memoryDir, 'lessons')
      if (!existsSync(lessonsDir)) try { mkdirSync(lessonsDir, { recursive: true }) } catch { /* skip */ }
      try { updateLessons(agentId, fullResponse) } catch { /* skip */ }
    }
  } else {
    const workOutputDir = join(memoryDir, 'work-output')
    if (!existsSync(workOutputDir)) try { mkdirSync(workOutputDir, { recursive: true }) } catch { /* skip */ }
    try {
      const entry = extractWorkOutput(fullResponse, timestamp)
      if (entry) appendFileSync(join(workOutputDir, `${today}.md`), entry + '\n\n')
    } catch { /* skip */ }

    const domainsDir = join(memoryDir, 'domains')
    if (!existsSync(domainsDir)) try { mkdirSync(domainsDir, { recursive: true }) } catch { /* skip */ }
    try { updateDomainKnowledge(agentId, fullResponse) } catch { /* skip */ }
  }
}

module.exports = {
  buildMemoryContext,
  compressMemory,
  compressMemoryByRole,
  extractSummaryFromMemory,
  extractDecisionEntry,
  buildSummaryFromResponse,
  extractWorkOutput,
  updateDomainKnowledge,
  updateLessons,
  MAX_DOMAIN_KNOWLEDGE_CHARS,
}
