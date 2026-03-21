'use strict'
/**
 * SkillUtils — 技能元数据解析和 TOOLS.md 生成
 */
const { existsSync, readFileSync } = require('fs')
const { join } = require('path')
const logger = require('./logger.cjs')

/**
 * 从 SKILL.md 提取 frontmatter 元数据
 * @param {string} content - SKILL.md 文件内容
 * @returns {{ name: string, description: string, bins: string[] }}
 */
function parseSkillMeta(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return { name: '', description: '', bins: [] }
  const fm = fmMatch[1]
  const name = fm.match(/^name:\s*(.+)/m)?.[1]?.trim().replace(/['"]/g, '') || ''
  const description = fm.match(/^description:\s*"?(.+?)"?\s*$/m)?.[1]?.trim() || ''
  const binsMatch = fm.match(/"bins":\s*\[([^\]]+)\]/)
  const bins = binsMatch
    ? binsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean)
    : []
  return { name, description, bins }
}

/**
 * 生成 TOOLS.md 内容
 * @param {string} agentId
 * @param {string[]} skills - 技能 slug 列表
 * @param {string} agentDir - agents/{id}/ 目录
 * @returns {string}
 */
function generateToolsMd(agentId, skills, agentDir) {
  const lines = [`# TOOLS.md — ${agentId} Agent`, '']

  if (!skills || skills.length === 0) {
    lines.push('No skills configured for this agent.', '', '---')
    lines.push('_Auto-generated on deploy. Edit agent.json skills[] to update._')
    return lines.join('\n')
  }

  lines.push('## Available Skills', '')

  for (const slug of skills) {
    const skillMdPath = join(agentDir, 'skills', slug, 'SKILL.md')
    if (existsSync(skillMdPath)) {
      try {
        const { name, description, bins } = parseSkillMeta(readFileSync(skillMdPath, 'utf-8'))
        lines.push(`### ${name || slug}`)
        if (description) lines.push(description)
        if (bins.length > 0) lines.push(`- **Requires:** ${bins.map(b => `\`${b}\``).join(', ')} on PATH`)
        lines.push(`- Full docs: \`skills/${slug}/SKILL.md\``, '')
        continue
      } catch (err) {
        logger.debug('skill-utils', 'failed to parse skill metadata', { slug, error: err.message })
      }
    }
    lines.push(`### ${slug}`, `- Full docs: \`skills/${slug}/SKILL.md\``, '')
  }

  if (skills.includes('peer-status')) {
    lines.push('## Peer Communication Quick Reference', '')
    lines.push('### 查询 peer 在线状态', '')
    lines.push('```bash')
    lines.push(`node skills/peer-status/scripts/peer-status.mjs --agent-id ${agentId}`)
    lines.push('```')
    lines.push('输出 JSON 数组：`[{ id, name, status, updatedAt }]`，status 为 `busy` 或 `online`。', '')
    lines.push('### 发送跨 Agent 消息', '')
    lines.push('```bash')
    lines.push('# 同步模式（等待回复）')
    lines.push(`node skills/peer-status/scripts/peer-send.mjs --from ${agentId} --to <peerId> --message "消息内容"`)
    lines.push('')
    lines.push('# 异步模式（发送后立即返回）')
    lines.push(`node skills/peer-status/scripts/peer-send.mjs --from ${agentId} --to <peerId> --message "消息内容" --no-wait`)
    lines.push('```')
    lines.push('> **注意**：禁止使用 `sessions_send` 跨 Agent 发消息，会被 Gateway 阻断。必须使用 `peer-send` 脚本。', '')
  }

  lines.push('---')
  lines.push('_Auto-generated from agent.json skills[]. Run "Sync Config" to regenerate._')
  return lines.join('\n')
}

module.exports = { parseSkillMeta, generateToolsMd }
