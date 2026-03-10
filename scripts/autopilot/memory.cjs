/**
 * Memory — intelligent memory management for agents
 *
 * Replaces the 2000-char truncation with structured memory:
 * - SUMMARY.md: concise overview (~500 chars)
 * - decisions/YYYY-MM-DD.md: daily decision logs
 * - lessons/what-worked.md: accumulated strategy lessons
 */
const { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } = require('fs')
const { join } = require('path')
const { AGENTS_DIR, MAX_DOMAIN_KNOWLEDGE_CHARS } = require('./constants.cjs')
const logger = require('./logger.cjs')

/**
 * Build structured memory context for an agent.
 *
 * @param {string} agentId - Agent ID (e.g. 'ceo')
 * @param {string} cycleType - 'coordination' | 'strategy' | 'department'
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
    } catch (err) {
      logger.debug('memory', `Failed to read SUMMARY.md for ${agentId}`, err)
    }
  }

  // Fall back to MEMORY.md if no SUMMARY.md
  if (!result.summary) {
    const memoryPath = join(agentDir, 'MEMORY.md')
    if (existsSync(memoryPath)) {
      try {
        const raw = readFileSync(memoryPath, 'utf-8')
        result.summary = extractSummaryFromMemory(raw)
      } catch (err) {
        logger.debug('memory', `Failed to read MEMORY.md for ${agentId}`, err)
      }
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
          .slice(-7) // Last 7 days
        let decisions = ''
        for (const f of files) {
          try {
            const content = readFileSync(join(decisionsDir, f), 'utf-8')
            decisions += `\n### ${f.replace('.md', '')}\n${content.slice(0, 500)}\n`
          } catch {}
        }
        if (decisions) result.recentDecisions = decisions.slice(0, 3000)
      } catch (err) {
        logger.debug('memory', `Failed to read decisions for ${agentId}`, err)
      }
    }
  }

  // Lessons learned (for strategy cycles)
  if (cycleType === 'strategy') {
    const lessonsPath = join(memoryDir, 'lessons', 'what-worked.md')
    if (existsSync(lessonsPath)) {
      try {
        result.lessonsLearned = readFileSync(lessonsPath, 'utf-8').slice(0, 2000)
      } catch (err) {
        logger.debug('memory', `Failed to read lessons for ${agentId}`, err)
      }
    }
  }

  return result
}

/**
 * Extract a concise summary from a raw MEMORY.md file.
 * Looks for ## sections and takes the most important ones.
 */
function extractSummaryFromMemory(raw) {
  if (!raw) return ''

  // Try to find key sections
  const sections = []
  const sectionRegex = /^##\s+(.+)$/gm
  let match
  while ((match = sectionRegex.exec(raw)) !== null) {
    sections.push({ title: match[1], start: match.index })
  }

  if (sections.length === 0) {
    return raw.slice(0, 2000)
  }

  // Priority sections to include
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

/**
 * Compress memory after a successful cycle.
 * Extracts key decisions from the response and stores them.
 *
 * @param {string} agentId - Agent ID
 * @param {string} fullResponse - The full agent response text
 */
function compressMemory(agentId, fullResponse) {
  if (!fullResponse) return

  const agentDir = join(AGENTS_DIR, agentId)
  const memoryDir = join(agentDir, 'memory')

  // Ensure memory directories exist
  const dirs = [memoryDir, join(memoryDir, 'decisions'), join(memoryDir, 'lessons')]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      try { mkdirSync(dir, { recursive: true }) } catch (err) {
        logger.warn('memory', `Failed to create dir ${dir}`, err)
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const timestamp = new Date().toISOString().slice(11, 19)

  // Append to daily decisions log
  const decisionsFile = join(memoryDir, 'decisions', `${today}.md`)
  try {
    const entry = extractDecisionEntry(fullResponse, timestamp)
    if (entry) {
      appendFileSync(decisionsFile, entry + '\n\n')
      logger.debug('memory', `Appended decision to ${decisionsFile}`)
    }
  } catch (err) {
    logger.warn('memory', 'Failed to write decision log', err)
  }

  // Update SUMMARY.md with latest status
  const summaryFile = join(memoryDir, 'SUMMARY.md')
  try {
    const summary = buildSummaryFromResponse(fullResponse, today)
    if (summary) {
      writeFileSync(summaryFile, summary)
      logger.debug('memory', `Updated SUMMARY.md for ${agentId}`)
    }
  } catch (err) {
    logger.warn('memory', 'Failed to update SUMMARY.md', err)
  }
}

/**
 * Extract a concise decision entry from an agent's response.
 */
function extractDecisionEntry(response, timestamp) {
  if (!response || response.length < 20) return null

  // Take first 300 chars as the decision summary
  const lines = response.split('\n').filter(l => l.trim())
  const summary = lines.slice(0, 5).join('\n')

  return `#### ${timestamp}\n${summary.slice(0, 500)}`
}

/**
 * Build a concise summary from the latest response.
 */
function buildSummaryFromResponse(response, date) {
  if (!response || response.length < 20) return null

  // Extract key information
  const lines = response.split('\n').filter(l => l.trim())
  const firstLines = lines.slice(0, 10).join('\n')

  return `# Agent Memory Summary\n\nLast updated: ${date}\n\n## 最新状态\n${firstLines.slice(0, 1000)}\n`
}

/**
 * Role-aware memory compression.
 *
 * @param {string} agentId - Agent ID
 * @param {string} fullResponse - The full agent response text
 * @param {'ceo'|'leader'|'member'} role - Agent role
 */
function compressMemoryByRole(agentId, fullResponse, role) {
  if (!fullResponse) return

  const agentDir = join(AGENTS_DIR, agentId)
  const memoryDir = join(agentDir, 'memory')

  // Ensure base memory directory exists
  if (!existsSync(memoryDir)) {
    try { mkdirSync(memoryDir, { recursive: true }) } catch {}
  }

  const today = new Date().toISOString().slice(0, 10)
  const timestamp = new Date().toISOString().slice(11, 19)

  // All roles: update SUMMARY.md
  const summaryFile = join(memoryDir, 'SUMMARY.md')
  try {
    const summary = buildSummaryFromResponse(fullResponse, today)
    if (summary) {
      writeFileSync(summaryFile, summary)
      logger.debug('memory', `Updated SUMMARY.md for ${agentId} (role=${role})`)
    }
  } catch (err) {
    logger.warn('memory', `Failed to update SUMMARY.md for ${agentId}`, err)
  }

  if (role === 'ceo' || role === 'leader') {
    // CEO/Leader: decisions + lessons
    const decisionsDir = join(memoryDir, 'decisions')
    if (!existsSync(decisionsDir)) {
      try { mkdirSync(decisionsDir, { recursive: true }) } catch {}
    }
    const decisionsFile = join(decisionsDir, `${today}.md`)
    try {
      const entry = extractDecisionEntry(fullResponse, timestamp)
      if (entry) appendFileSync(decisionsFile, entry + '\n\n')
    } catch (err) {
      logger.warn('memory', `Failed to write decision log for ${agentId}`, err)
    }

    if (role === 'ceo') {
      const lessonsDir = join(memoryDir, 'lessons')
      if (!existsSync(lessonsDir)) {
        try { mkdirSync(lessonsDir, { recursive: true }) } catch {}
      }
      try {
        updateLessons(agentId, fullResponse)
      } catch (err) {
        logger.debug('memory', `Failed to update lessons for ${agentId}`, err)
      }
    }
  } else {
    // Member: work-output + domain knowledge
    const workOutputDir = join(memoryDir, 'work-output')
    if (!existsSync(workOutputDir)) {
      try { mkdirSync(workOutputDir, { recursive: true }) } catch {}
    }
    const workOutputFile = join(workOutputDir, `${today}.md`)
    try {
      const entry = extractWorkOutput(fullResponse, timestamp)
      if (entry) appendFileSync(workOutputFile, entry + '\n\n')
    } catch (err) {
      logger.warn('memory', `Failed to write work output for ${agentId}`, err)
    }

    const domainsDir = join(memoryDir, 'domains')
    if (!existsSync(domainsDir)) {
      try { mkdirSync(domainsDir, { recursive: true }) } catch {}
    }
    try {
      updateDomainKnowledge(agentId, fullResponse)
    } catch (err) {
      logger.debug('memory', `Failed to update domain knowledge for ${agentId}`, err)
    }
  }
}

/**
 * Extract work output summary from a team member's response.
 */
function extractWorkOutput(response, timestamp) {
  if (!response || response.length < 20) return null

  const lines = response.split('\n').filter(l => l.trim())

  // Look for output-related keywords
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

/**
 * Update domain knowledge file for a team member.
 * Appends new knowledge points, deduplicates, and caps at MAX_DOMAIN_KNOWLEDGE_CHARS.
 */
function updateDomainKnowledge(agentId, response) {
  if (!response || response.length < 50) return

  const memoryDir = join(AGENTS_DIR, agentId, 'memory', 'domains')
  const knowledgePath = join(memoryDir, 'knowledge.md')

  // Extract knowledge-like content (patterns, findings, technical details)
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
  if (existsSync(knowledgePath)) {
    existing = readFileSync(knowledgePath, 'utf-8')
  }

  // Deduplicate: skip if the new content is already substantially present
  if (existing && newKnowledge.split('\n').every(line =>
    line.length < 10 || existing.includes(line.trim())
  )) {
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  const updated = existing
    ? `${existing}\n\n### ${today}\n${newKnowledge}`
    : `# Domain Knowledge\n\n### ${today}\n${newKnowledge}`

  // Cap at MAX_DOMAIN_KNOWLEDGE_CHARS — trim oldest entries
  if (updated.length > MAX_DOMAIN_KNOWLEDGE_CHARS) {
    const header = '# Domain Knowledge\n\n'
    const trimmed = updated.slice(updated.length - MAX_DOMAIN_KNOWLEDGE_CHARS + header.length)
    // Find next section boundary to avoid cutting mid-entry
    const nextSection = trimmed.indexOf('\n### ')
    const clean = nextSection >= 0 ? trimmed.slice(nextSection + 1) : trimmed
    writeFileSync(knowledgePath, header + clean)
  } else {
    writeFileSync(knowledgePath, updated)
  }

  logger.debug('memory', `Updated domain knowledge for ${agentId}`)
}

/**
 * Update lessons learned for CEO.
 */
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
  if (existsSync(lessonsPath)) {
    existing = readFileSync(lessonsPath, 'utf-8')
  }

  const updated = existing ? existing + entry : `# Lessons Learned\n${entry}`

  // Cap at 5000 chars
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

module.exports = { buildMemoryContext, compressMemory, compressMemoryByRole, extractSummaryFromMemory }
