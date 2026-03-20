'use strict'
/**
 * TaskTypeInference — 从 Agent 角色和任务摘要推断任务类型
 *
 * 推断优先级：
 *   1. 摘要关键词匹配（最高优先，Chief 意图明确）
 *   2. Agent templateId 映射（基于角色职责）
 *   3. 兜底 'dept-work'（无法推断时）
 *
 * 推断结果必须是 strategy.cjs 中有对应策略的类型名。
 */
const { BUILTIN_STRATEGIES } = require('./strategy.cjs')

// ── Agent templateId → taskType 映射 ────────────────────────

const TEMPLATE_TYPE_MAP = {
  // 技术
  'backend': 'coding',
  'frontend': 'coding',
  'data-engineer-quant': 'coding',
  'tester': 'coding',
  'execution-engineer': 'coding',
  'quant-developer': 'coding',

  // 研究
  'researcher': 'research',
  'novel-researcher': 'research',
  'quant-researcher': 'research',
  'tutorial-researcher': 'research',
  'ai-researcher': 'research',
  'chief-scientist': 'research',
  'innovation-analyst': 'research',

  // 分析
  'analyst': 'analysis',
  'cost-analyst': 'analysis',
  'risk-manager': 'analysis',
  'market-analyst-crypto': 'analysis',
  'strategy-optimizer': 'analysis',
  'reader-analyst': 'analysis',

  // 设计
  'designer': 'design',
  'art-director': 'design',
  'storyboard-artist': 'design',

  // 营销/品牌
  'marketing': 'marketing',
  'content-creator': 'marketing',
  'brand-director': 'marketing',
  'pr-specialist': 'marketing',
  'growth-ops': 'marketing',

  // 教程
  'tutorial-writer': 'tutorial',
  'tutorial-reviewer': 'tutorial',
  'code-instructor': 'tutorial',

  // 运营
  'content-ops': 'operations',
  'support-agent': 'operations',
  'csm': 'operations',
  'service-manager': 'operations',

  // 财务
  'accountant': 'finance',
  'cfo': 'finance',

  // 评审
  'tutorial-reviewer': 'review',

  // 创作 — 小说
  'novel-writer': 'writing',
  'writer': 'writing',
  'script-adapter': 'writing',
  'style-editor': 'editing',
  'visual-editor': 'editing',
  'continuity-mgr': 'editing',
  'worldbuilder': 'worldbuilding',
  'anime-char-designer': 'character',
  'character-designer': 'character',
  'plot-architect': 'plotting',
  'pacing-designer': 'plotting',
}

// ── 摘要关键词 → taskType 映射 ──────────────────────────────

/**
 * 关键词匹配表。顺序决定优先级——更具体的类型放前面。
 * 每个 type 可有多个 pattern，任一命中即匹配。
 */
const KEYWORD_PATTERNS = [
  // ── 先匹配具体领域（避免被宽泛词吃掉）──
  { type: 'coding',        patterns: [/编码|开发|实现|编写代码|修复|bug|重构|部署|api|接口开发|测试用例/i, /\b(?:code|develop|implement|fix|refactor|deploy|api)\b/i] },
  { type: 'worldbuilding', patterns: [/世界观|背景构建/i, /\b(?:worldbuild|lore)\b/i] },
  { type: 'character',     patterns: [/角色设计|人物设定|角色关系/i, /\b(?:character\s*design|persona)\b/i] },
  { type: 'plotting',      patterns: [/情节|大纲|剧情|故事线/i, /\b(?:plot|storyline|outline)\b/i] },
  { type: 'writing',       patterns: [/写作|撰写|创作|写第|续写|文稿|草稿|章节/i, /\b(?:draft|compose|chapter)\b/i] },
  { type: 'editing',       patterns: [/编辑|修订|校对|润色|审校|修改文稿/i, /\b(?:edit|revise|proofread|polish)\b/i] },
  { type: 'tutorial',      patterns: [/教程|教学|课程|指南|入门|手把手/i, /\b(?:tutorial|lesson|guide|teach|course)\b/i] },
  { type: 'marketing',     patterns: [/营销|推广|文案|宣传|品牌|获客|策划/i, /\b(?:marketing|campaign|copywriting|brand|promote)\b/i] },
  { type: 'finance',       patterns: [/财务|预算|成本|会计|报表|核算/i, /\b(?:financ|budget|accounting|cost)\b/i] },
  { type: 'operations',    patterns: [/运营|流程|合规|审批|排期/i, /\b(?:operations|process|compliance|schedule)\b/i] },
  { type: 'review',        patterns: [/评审|审查|复核/i, /\b(?:review|audit|inspect)\b/i] },
  { type: 'research',      patterns: [/研究|调研|调查|文献|综述|探索/i, /\b(?:research|investigate|survey|literature)\b/i] },
  { type: 'analysis',      patterns: [/分析|评估|数据|统计|洞察|对比/i, /\b(?:analy[sz]e|assess|data|statistic)\b/i] },
  // ── 宽泛词放最后 ──
  { type: 'design',        patterns: [/系统设计|架构设计|方案设计|技术选型|原型|蓝图|架构/i, /\b(?:design|architect|prototype|blueprint)\b/i] },
]

/**
 * 从摘要关键词推断任务类型
 * @param {string} summary
 * @returns {string|null}
 */
function inferFromSummary(summary) {
  if (!summary) return null
  for (const { type, patterns } of KEYWORD_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(summary)) return type
    }
  }
  return null
}

/**
 * 从 Agent 的 templateId 推断任务类型
 * @param {string} templateId
 * @returns {string|null}
 */
function inferFromTemplate(templateId) {
  if (!templateId) return null
  return TEMPLATE_TYPE_MAP[templateId] || null
}

/**
 * 推断任务类型
 *
 * @param {string} summary - 任务摘要（Chief 的分配描述）
 * @param {object} [agentMeta] - Agent 元数据（来自 agent.json）
 * @returns {string} 推断出的任务类型（保证是 strategy.cjs 中有定义的）
 */
function inferTaskType(summary, agentMeta) {
  // 1. 摘要关键词（Chief 意图最明确）
  const fromSummary = inferFromSummary(summary)
  if (fromSummary) return fromSummary

  // 2. Agent templateId
  if (agentMeta) {
    const fromTemplate = inferFromTemplate(agentMeta.templateId || agentMeta.role)
    if (fromTemplate) return fromTemplate
  }

  // 3. 兜底
  return 'dept-work'
}

module.exports = {
  inferTaskType,
  inferFromSummary,
  inferFromTemplate,
  TEMPLATE_TYPE_MAP,
  KEYWORD_PATTERNS,
}
