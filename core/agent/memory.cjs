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
const { agentMetaRepo } = require('../repo/agent-meta.cjs')
const logger = require('../common/logger.cjs')

const MAX_DOMAIN_KNOWLEDGE_CHARS = 3000

/** Structured section labels used in Chief's output format */
const STRUCTURED_SECTIONS = ['任务分配', '任务完成', '任务恢复', '进展汇报', '阻塞项']
const SECTION_REGEX = new RegExp(`^\\[(?:${STRUCTURED_SECTIONS.join('|')})\\]`, 'm')

/**
 * Extract structured memory from a Chief/leader response.
 * Chief responses follow a fixed format: free-form reasoning, then [任务分配], [任务完成], etc.
 * @param {string} response
 * @returns {{ reasoning: string, assignments: string, completions: string, progress: string, blockers: string }}
 */
function extractStructuredLeaderMemory(response) {
  const result = { reasoning: '', assignments: '', completions: '', progress: '', blockers: '' }
  if (!response) return result

  // Find the first structured section marker
  const firstMatch = response.match(SECTION_REGEX)
  if (firstMatch) {
    // Everything before the first marker is reasoning/analysis
    result.reasoning = response.slice(0, firstMatch.index).trim()
  }

  // Extract each section
  const sectionMap = {
    '任务分配': 'assignments',
    '任务完成': 'completions',
    '任务恢复': 'completions', // merge with completions
    '进展汇报': 'progress',
    '阻塞项': 'blockers',
  }
  for (const [label, key] of Object.entries(sectionMap)) {
    const regex = new RegExp(`\\[${label}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\[(?:${STRUCTURED_SECTIONS.join('|')})\\]|$)`)
    const m = response.match(regex)
    if (m && m[1]) {
      const content = m[1].trim()
      if (content && content !== '无' && content !== '- 无') {
        result[key] = result[key] ? result[key] + '\n' + content : content
      }
    }
  }

  // If no structured sections found, treat entire response as reasoning
  if (!firstMatch) {
    result.reasoning = response.trim()
  }

  return result
}

/**
 * Build structured memory context for an agent.
 * @param {string} agentId
 * @param {'coordination'|'strategy'|'department'} cycleType
 * @returns {object} { summary, recentDecisions, departmentStatus, lessonsLearned }
 */
function buildMemoryContext(agentId, cycleType) {
  const result = {}

  // Always include summary
  const summaryContent = agentMetaRepo.readAgentFile(agentId, 'memory/SUMMARY.md')
  if (summaryContent) {
    result.summary = summaryContent.slice(0, 2000)
  }

  // Fallback to MEMORY.md
  if (!result.summary) {
    const memoryContent = agentMetaRepo.readAgentFile(agentId, 'MEMORY.md')
    if (memoryContent) {
      result.summary = extractSummaryFromMemory(memoryContent)
    }
  }

  // Recent decisions — also included for 'department' type (stateless session continuity)
  if (cycleType === 'coordination' || cycleType === 'strategy' || cycleType === 'department') {
    const daysToInclude = cycleType === 'department' ? 3 : 7
    const perFileLimit = cycleType === 'department' ? 1500 : 500
    const totalLimit = cycleType === 'department' ? 4000 : 3000

    const entries = agentMetaRepo.listAgentDir(agentId, 'memory/decisions')
    const mdFiles = entries
      .filter(e => e.isFile && e.name.endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(-daysToInclude)

    if (mdFiles.length > 0) {
      let decisions = ''
      for (const f of mdFiles) {
        const content = agentMetaRepo.readAgentFile(agentId, `memory/decisions/${f.name}`)
        if (content) {
          decisions += `\n### ${f.name.replace('.md', '')}\n${content.slice(0, perFileLimit)}\n`
        }
      }
      if (decisions) result.recentDecisions = decisions.slice(0, totalLimit)
    }
  }

  // Lessons learned (strategy only)
  if (cycleType === 'strategy') {
    const lessonsContent = agentMetaRepo.readAgentFile(agentId, 'memory/lessons/what-worked.md')
    if (lessonsContent) {
      result.lessonsLearned = lessonsContent.slice(0, 2000)
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

/** Extract decision entry from response (structured extraction for leader, fallback for others) */
function extractDecisionEntry(response, timestamp) {
  if (!response || response.length < 20) return null
  const structured = extractStructuredLeaderMemory(response)
  const parts = []
  if (structured.reasoning) parts.push(structured.reasoning.slice(0, 800))
  if (structured.assignments) parts.push('分配: ' + structured.assignments.slice(0, 400))
  if (structured.blockers) parts.push('阻塞: ' + structured.blockers.slice(0, 200))
  // Fallback: if no structured sections found, use first lines
  const content = parts.length > 1 || (parts.length === 1 && structured.assignments)
    ? parts.join('\n')
    : response.split('\n').filter(l => l.trim()).slice(0, 8).join('\n')
  return `#### ${timestamp}\n${content.slice(0, 1500)}`
}

/** Build summary from response (structured extraction for leader, fallback for others) */
function buildSummaryFromResponse(response, date) {
  if (!response || response.length < 20) return null
  const structured = extractStructuredLeaderMemory(response)
  const parts = []
  if (structured.reasoning) parts.push(structured.reasoning.slice(0, 800))
  if (structured.progress) parts.push('进展: ' + structured.progress.slice(0, 400))
  if (structured.blockers) parts.push('阻塞: ' + structured.blockers.slice(0, 200))
  // Fallback: if no structured sections found, use first lines
  const content = parts.length > 1 || (parts.length === 1 && structured.progress)
    ? parts.join('\n')
    : response.split('\n').filter(l => l.trim()).slice(0, 10).join('\n')
  return `# Agent Memory Summary\n\nLast updated: ${date}\n\n## 最新状态\n${content.slice(0, 1500)}\n`
}

/**
 * Compress memory after a successful cycle.
 */
function compressMemory(agentId, fullResponse) {
  if (!fullResponse) return
  const dirs = ['memory', 'memory/decisions', 'memory/lessons']
  for (const dir of dirs) {
    agentMetaRepo.ensureAgentDir(agentId, dir)
  }

  const today = new Date().toISOString().slice(0, 10)
  const timestamp = new Date().toISOString().slice(11, 19)

  try {
    const entry = extractDecisionEntry(fullResponse, timestamp)
    if (entry) agentMetaRepo.appendAgentFile(agentId, `memory/decisions/${today}.md`, entry + '\n\n')
  } catch { logger.warn('memory', 'Memory compression failed', { agentId }) }

  try {
    const summary = buildSummaryFromResponse(fullResponse, today)
    if (summary) agentMetaRepo.writeAgentFile(agentId, 'memory/SUMMARY.md', summary)
  } catch { logger.warn('memory', 'Memory compression failed', { agentId }) }
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
  const knowledgeKeywords = ['发现', '学到', '注意', '规律', '模式', '技巧', '经验',
    'learned', 'discovered', 'pattern', 'insight', 'technique', 'finding', 'note']
  const lines = response.split('\n').filter(l => l.trim())
  const knowledgeLines = lines.filter(l => {
    const lower = l.toLowerCase()
    return knowledgeKeywords.some(k => lower.includes(k))
  })
  if (knowledgeLines.length === 0) return

  const newKnowledge = knowledgeLines.slice(0, 5).join('\n')
  const existing = agentMetaRepo.readAgentFile(agentId, 'memory/domains/knowledge.md') || ''

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
    agentMetaRepo.writeAgentFile(agentId, 'memory/domains/knowledge.md', header + clean)
  } else {
    agentMetaRepo.writeAgentFile(agentId, 'memory/domains/knowledge.md', updated)
  }
}

/** Update lessons learned for CEO */
function updateLessons(agentId, response) {
  if (!response || response.length < 50) return
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
  const existing = agentMetaRepo.readAgentFile(agentId, 'memory/lessons/what-worked.md') || ''

  const updated = existing ? existing + entry : `# Lessons Learned\n${entry}`
  if (updated.length > 5000) {
    const header = '# Lessons Learned\n'
    const trimmed = updated.slice(updated.length - 5000 + header.length)
    const nextSection = trimmed.indexOf('\n### ')
    const clean = nextSection >= 0 ? trimmed.slice(nextSection + 1) : trimmed
    agentMetaRepo.writeAgentFile(agentId, 'memory/lessons/what-worked.md', header + clean)
  } else {
    agentMetaRepo.writeAgentFile(agentId, 'memory/lessons/what-worked.md', updated)
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
  agentMetaRepo.ensureAgentDir(agentId, 'memory')

  const today = new Date().toISOString().slice(0, 10)
  const timestamp = new Date().toISOString().slice(11, 19)

  // All roles: update SUMMARY.md
  try {
    const summary = buildSummaryFromResponse(fullResponse, today)
    if (summary) agentMetaRepo.writeAgentFile(agentId, 'memory/SUMMARY.md', summary)
  } catch { logger.warn('memory', 'Memory compression failed', { agentId }) }

  if (role === 'ceo' || role === 'leader') {
    agentMetaRepo.ensureAgentDir(agentId, 'memory/decisions')
    try {
      const entry = extractDecisionEntry(fullResponse, timestamp)
      if (entry) agentMetaRepo.appendAgentFile(agentId, `memory/decisions/${today}.md`, entry + '\n\n')
    } catch { logger.debug('memory', 'Memory file write failed', { agentId, file: `memory/decisions/${today}.md` }) }

    if (role === 'ceo') {
      agentMetaRepo.ensureAgentDir(agentId, 'memory/lessons')
      try { updateLessons(agentId, fullResponse) } catch { logger.warn('memory', 'Lessons update failed', { agentId }) }
    }
  } else {
    agentMetaRepo.ensureAgentDir(agentId, 'memory/work-output')
    try {
      const entry = extractWorkOutput(fullResponse, timestamp)
      if (entry) agentMetaRepo.appendAgentFile(agentId, `memory/work-output/${today}.md`, entry + '\n\n')
    } catch { logger.debug('memory', 'Memory file write failed', { agentId, file: `memory/work-output/${today}.md` }) }

    agentMetaRepo.ensureAgentDir(agentId, 'memory/domains')
    try { updateDomainKnowledge(agentId, fullResponse) } catch { logger.debug('memory', 'Domain knowledge update failed', { agentId }) }
  }
}

/**
 * Extract a structured task memory from worker output and persist it.
 *
 * @param {string} agentId
 * @param {object} task - { id, name, type, description }
 * @param {string} workerOutput - Raw text output from the worker session
 * @param {object} [options]
 * @param {number} [options.maxChars=3000] - Maximum chars for the memory file
 */
function extractTaskMemory(agentId, task, workerOutput, options = {}) {
  if (!workerOutput || workerOutput.length < 20) return
  const maxChars = options.maxChars || 3000

  agentMetaRepo.ensureAgentDir(agentId, 'memory/tasks')

  const lines = workerOutput.split('\n').filter(l => l.trim())
  const outcomeKeywords = ['完成', '创建', '生成', '输出', '结论', '结果',
    'completed', 'created', 'generated', 'output', 'conclusion', 'result']
  const outcomeLines = lines.filter(l => {
    const lower = l.toLowerCase()
    return outcomeKeywords.some(k => lower.includes(k))
  })
  const summary = outcomeLines.length > 0
    ? outcomeLines.slice(0, 10).join('\n')
    : lines.slice(0, 8).join('\n')

  const today = new Date().toISOString().slice(0, 10)
  const content = [
    `# Task Memory: ${task.name || task.id}`,
    '',
    `- **Task ID**: ${task.id}`,
    `- **Type**: ${task.type || 'unknown'}`,
    `- **Date**: ${today}`,
    task.description ? `- **Description**: ${task.description.slice(0, 200)}` : '',
    '',
    '## Outcome',
    summary.slice(0, maxChars - 300),
  ].filter(Boolean).join('\n')

  try {
    agentMetaRepo.writeAgentFile(agentId, `memory/tasks/${task.id}.md`, content.slice(0, maxChars))
  } catch { logger.debug('memory', 'Task memory extraction failed', { agentId }) }
}

/**
 * Load task memories for an agent.
 *
 * @param {string} agentId
 * @param {object} [options]
 * @param {number} [options.limit=5] - Maximum number of memories to return
 * @returns {Array<{taskId: string, content: string}>}
 */
function loadTaskMemories(agentId, options = {}) {
  const limit = options.limit || 5
  const entries = agentMetaRepo.listAgentDir(agentId, 'memory/tasks')
  if (entries.length === 0) return []

  const files = entries
    .filter(e => e.isFile && e.name.endsWith('.md'))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)

  return files.map(f => {
    const content = agentMetaRepo.readAgentFile(agentId, `memory/tasks/${f.name}`)
    if (!content) return null
    return { taskId: f.name.replace('.md', ''), content: content.slice(0, 2000) }
  }).filter(Boolean)
}

module.exports = {
  buildMemoryContext,
  compressMemory,
  compressMemoryByRole,
  extractSummaryFromMemory,
  extractStructuredLeaderMemory,
  extractDecisionEntry,
  buildSummaryFromResponse,
  extractWorkOutput,
  updateDomainKnowledge,
  updateLessons,
  extractTaskMemory,
  loadTaskMemories,
  MAX_DOMAIN_KNOWLEDGE_CHARS,
}
