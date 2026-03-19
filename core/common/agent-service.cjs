'use strict'
/**
 * AgentService — Agent 生命周期管理服务
 *
 * 设计模式：Facade + DI（门面模式 + 依赖注入）
 *
 * 职责：
 * - 封装 Agent 创建/更新/删除的完整流程
 * - 协调多个 Repository 完成多步操作
 * - 通过 hooks 回调注入 UI 层特有操作（base-rules 注入、技能 symlink、Gateway 重启）
 *
 * hooks 约定（参考 quality-orchestrator.cjs 的 DI 模式）:
 *   onBaseRulesInject(agentDir)  — 注入 base-rules
 *   onSkillsSync(agentId, skills) — symlink 技能
 *   onGatewayRestart()           — 重启 Gateway
 */
const { mkdirSync, existsSync, rmSync, renameSync, writeFileSync, readFileSync } = require('fs')
const { join } = require('path')
const { ConfigRepository } = require('../repo/config.cjs')
const { AgentMetaRepository } = require('../repo/agent-meta.cjs')
const { DeptConfigRepository } = require('../repo/dept-config.cjs')
const { validateAgentId } = require('./validators.cjs')

// Lazy require to avoid circular dependencies
let _templateRepo
function getTemplateRepo() {
  if (!_templateRepo) _templateRepo = require('../repo/template.cjs')
  return _templateRepo
}

const PROJECT_ROOT = join(__dirname, '..', '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')
const MODELS_CONFIG = join(PROJECT_ROOT, 'config', 'models.json')
const DEPARTMENTS_DIR = join(PROJECT_ROOT, 'config', 'departments')

class AgentService {
  /**
   * @param {object} [deps] - 可注入的依赖（便于测试）
   * @param {ConfigRepository} [deps.configRepo]
   * @param {AgentMetaRepository} [deps.agentMetaRepo]
   * @param {DeptConfigRepository} [deps.deptConfigRepo]
   * @param {object} [deps.templateRepo]
   */
  constructor(configRepo, agentMetaRepo, deptConfigRepo, templateRepo) {
    this._configRepo = configRepo || new ConfigRepository()
    this._agentMetaRepo = agentMetaRepo || new AgentMetaRepository()
    this._deptConfigRepo = deptConfigRepo || new DeptConfigRepository()
    this._templateRepo = templateRepo || null // lazy via getTemplateRepo()
  }

  _getTemplateRepo() {
    return this._templateRepo || getTemplateRepo()
  }

  // ── Create ─────────────────────────────────────────────────────

  /**
   * 创建 Agent 完整流程
   *
   * @param {object} body - Agent 创建参数
   * @param {object} [hooks] - UI 层回调
   * @returns {Promise<{ok: boolean, id?: string, deployed?: boolean, restarted?: boolean, hasIdentityFiles?: boolean, error?: string, status?: number}>}
   */
  async createAgent(body, hooks = {}) {
    const { id, templateId, name, description, model, skills, peers, systemPrompt, department } = body

    if (!id || !name) {
      return { ok: false, error: 'id and name are required', status: 400 }
    }

    const idCheck = validateAgentId(id)
    if (!idCheck.valid) {
      return { ok: false, error: idCheck.error, status: 400 }
    }

    const agentDir = join(AGENTS_DIR, id)
    if (existsSync(agentDir)) {
      return { ok: false, error: `Agent "${id}" already exists`, status: 409 }
    }

    // Load template defaults
    const tmplRepo = this._getTemplateRepo()
    let tmplDefaults = { model: '', skills: [], peers: [] }
    let tmplDir = null
    let tmplGroup = undefined
    if (templateId) {
      const template = tmplRepo.readTemplate(templateId)
      if (template) {
        tmplDefaults = template.defaults
        tmplDir = tmplRepo.getTemplateDir(templateId)
        tmplGroup = template.group
      }
    }

    // Merge: user overrides > template defaults
    const finalModel = model || tmplDefaults.model || ''
    const mergedSkills = skills || tmplDefaults.skills || []
    const finalSkills = mergedSkills.includes('peer-status')
      ? mergedSkills
      : [...mergedSkills, 'peer-status']
    const finalPeers = peers || tmplDefaults.peers || []
    const finalDescription = description || ''
    const finalRole = templateId || id
    const finalDepartment = department || tmplGroup || undefined

    // 1. Create directory structure
    mkdirSync(join(agentDir, 'skills'), { recursive: true })

    // 2. Write agent.json
    const agentJson = {
      id,
      templateId: templateId || null,
      name,
      role: finalRole,
      description: finalDescription,
      model: finalModel || undefined,
      skills: finalSkills,
      peers: finalPeers,
      department: finalDepartment || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    writeFileSync(join(agentDir, 'agent.json'), JSON.stringify(agentJson, null, 2) + '\n')

    // 3. Materialize AGENTS.md
    if (systemPrompt) {
      writeFileSync(join(agentDir, 'AGENTS.md'), systemPrompt)
    } else if (tmplDir && existsSync(join(tmplDir, 'AGENTS.md'))) {
      writeFileSync(join(agentDir, 'AGENTS.md'), readFileSync(join(tmplDir, 'AGENTS.md'), 'utf-8'))
    } else {
      writeFileSync(join(agentDir, 'AGENTS.md'), this._generateAgentsMd({ id, role: finalRole, name, description: finalDescription, peers: finalPeers }))
    }

    // 3.5. Append peers roles section (for template-based agents)
    if (finalPeers.length > 0) {
      const peersSection = this._buildPeersRolesSection(finalPeers)
      if (peersSection) {
        const agentsMdPath = join(agentDir, 'AGENTS.md')
        const existing = readFileSync(agentsMdPath, 'utf-8')
        if (!existing.includes('### Peers 职责')) {
          writeFileSync(agentsMdPath, existing + peersSection)
        }
      }
    }

    // 4. Sync skill symlinks (must happen before TOOLS.md generation)
    if (hooks.onSkillsSync) await hooks.onSkillsSync(id, finalSkills)

    // 5. Materialize TOOLS.md
    if (tmplDir && existsSync(join(tmplDir, 'TOOLS.md'))) {
      writeFileSync(join(agentDir, 'TOOLS.md'), readFileSync(join(tmplDir, 'TOOLS.md'), 'utf-8'))
    } else {
      writeFileSync(join(agentDir, 'TOOLS.md'), this._generateToolsMd(id, finalSkills, agentDir))
    }

    // 6. Write identity files
    const identityFromTmpl = tmplDir && existsSync(join(tmplDir, 'IDENTITY.md'))
    const soulFromTmpl = tmplDir && existsSync(join(tmplDir, 'SOUL.md'))
    const hasIdentityFiles = !!(identityFromTmpl && soulFromTmpl)

    if (identityFromTmpl) {
      writeFileSync(join(agentDir, 'IDENTITY.md'), readFileSync(join(tmplDir, 'IDENTITY.md'), 'utf-8'))
    } else {
      this._writeIfMissing(join(agentDir, 'IDENTITY.md'), `# IDENTITY.md - Who Am I?\n\n- **Name:** ${name}\n- **Creature:** AI agent\n- **Vibe:** Professional and focused\n- **Emoji:** 🤖\n`)
    }

    if (soulFromTmpl) {
      writeFileSync(join(agentDir, 'SOUL.md'), readFileSync(join(tmplDir, 'SOUL.md'), 'utf-8'))
    } else {
      this._writeIfMissing(join(agentDir, 'SOUL.md'), this._defaultSoulMd())
    }

    this._writeIfMissing(join(agentDir, 'USER.md'), `# USER.md - About Your Human\n\n- **Name:**\n- **What to call them:**\n- **Timezone:**\n- **Notes:**\n`)
    this._writeIfMissing(join(agentDir, 'HEARTBEAT.md'), `# HEARTBEAT.md\n\n# Keep this file empty to skip heartbeat API calls.\n`)

    // 7. Create memory infrastructure
    this._createMemoryInfra(agentDir, name, finalPeers)

    // 8. Inject base rules
    if (hooks.onBaseRulesInject) await hooks.onBaseRulesInject(agentDir)

    // 9. Create workspaces/{id}/
    mkdirSync(join(WORKSPACES_DIR, id), { recursive: true })

    // 10. Register in openclaw.json
    const resolvedModel = this._resolveModelRef(finalModel)
    this._configRepo.addAgent(id, agentDir, resolvedModel)

    // 11. Create project for department + sync dept agents
    if (finalDepartment) {
      this._ensureProjectForDepartment(finalDepartment, id)
      this._syncAutopilotDeptAgents(finalDepartment, id, 'add')
    }

    // 12. Restart Gateway
    let restarted = false
    if (hooks.onGatewayRestart) restarted = !!(await hooks.onGatewayRestart())

    return { ok: true, id, deployed: true, restarted, hasIdentityFiles }
  }

  // ── Update ─────────────────────────────────────────────────────

  /**
   * 更新 Agent
   *
   * @param {object} body - 更新参数（id 必填，其他可选）
   * @param {object} [hooks] - UI 层回调
   * @returns {Promise<{ok: boolean, error?: string, status?: number}>}
   */
  async updateAgent(body, hooks = {}) {
    const { id, name, description, model, skills, peers, systemPrompt, department } = body

    if (!id) {
      return { ok: false, error: 'id is required', status: 400 }
    }

    const agentDir = join(AGENTS_DIR, id)
    if (!existsSync(agentDir)) {
      return { ok: false, error: `Agent "${id}" not found`, status: 404 }
    }

    // Read existing agent.json
    const agentJsonPath = join(agentDir, 'agent.json')
    let agentJson = {}
    if (existsSync(agentJsonPath)) {
      try { agentJson = JSON.parse(readFileSync(agentJsonPath, 'utf-8')) } catch { /* skip */ }
    }
    const oldDepartment = agentJson.department || undefined

    // Update fields
    if (name !== undefined) agentJson.name = name
    if (description !== undefined) agentJson.description = description
    if (model !== undefined) agentJson.model = model || undefined
    if (skills !== undefined) agentJson.skills = skills
    if (peers !== undefined) agentJson.peers = peers
    if (department !== undefined) agentJson.department = department || undefined
    agentJson.updatedAt = new Date().toISOString()

    writeFileSync(agentJsonPath, JSON.stringify(agentJson, null, 2) + '\n')

    // Update AGENTS.md if systemPrompt provided
    if (systemPrompt !== undefined) {
      writeFileSync(join(agentDir, 'AGENTS.md'), systemPrompt)
    }

    // Re-inject base rules
    if (hooks.onBaseRulesInject) await hooks.onBaseRulesInject(agentDir)

    // Regenerate TOOLS.md when skills change
    if (skills !== undefined) {
      const finalSkills = agentJson.skills || []
      if (hooks.onSkillsSync) await hooks.onSkillsSync(id, finalSkills)
      writeFileSync(join(agentDir, 'TOOLS.md'), this._generateToolsMd(id, finalSkills, agentDir))
    }

    // Update openclaw.json and restart if model changed
    if (model !== undefined) {
      const resolvedModel = this._resolveModelRef(agentJson.model || '')
      this._configRepo.addAgent(id, agentDir, resolvedModel)
      if (hooks.onGatewayRestart) await hooks.onGatewayRestart()
    }

    // Department changes
    if (department !== undefined && department !== oldDepartment) {
      if (oldDepartment) {
        this._syncAutopilotDeptAgents(oldDepartment, id, 'remove')
      }
      if (department) {
        this._ensureProjectForDepartment(department, id)
        this._syncAutopilotDeptAgents(department, id, 'add')
      }
    } else {
      const currentDept = agentJson.department || undefined
      if (currentDept) {
        this._ensureProjectForDepartment(currentDept, id)
      }
    }

    return { ok: true }
  }

  // ── Delete ─────────────────────────────────────────────────────

  /**
   * 删除 Agent 并归档工作空间
   *
   * @param {string} id - Agent ID
   * @returns {Promise<{ ok: boolean, archivedTo: string|null }>}
   */
  async deleteAgent(id) {
    this._configRepo.removeAgent(id)

    const agentDir = join(AGENTS_DIR, id)
    if (existsSync(agentDir)) rmSync(agentDir, { recursive: true, force: true })

    const stateDir = join(PROJECT_ROOT, '.openclaw-state', 'agents', id)
    if (existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true })

    let archivedTo = null
    const wsDir = join(WORKSPACES_DIR, id)
    if (existsSync(wsDir)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const archiveDir = join(WORKSPACES_DIR, '.archived')
      mkdirSync(archiveDir, { recursive: true })
      const archivePath = join(archiveDir, `${id}_${timestamp}`)
      renameSync(wsDir, archivePath)
      archivedTo = `workspaces/.archived/${id}_${timestamp}`
    }

    return { ok: true, archivedTo }
  }

  // ── Private helpers ────────────────────────────────────────────

  _resolveModelRef(ref) {
    if (!ref) return ref
    try {
      if (!existsSync(MODELS_CONFIG)) return ref
      const models = JSON.parse(readFileSync(MODELS_CONFIG, 'utf-8'))
      const [provider, alias] = ref.split('/')
      const modelId = models.providers?.[provider]?.models?.[alias]
      return modelId ? `${provider}/${modelId}` : ref
    } catch {
      return ref
    }
  }

  _parseSkillMeta(skillMd) {
    return require('./skill-utils.cjs').parseSkillMeta(skillMd)
  }

  _generateToolsMd(agentId, skills, agentDir) {
    return require('./skill-utils.cjs').generateToolsMd(agentId, skills, agentDir)
  }

  _buildPeersRolesSection(peers) {
    if (!peers || peers.length === 0) return ''
    const lines = []
    for (const peerId of peers) {
      const metaPath = join(AGENTS_DIR, peerId, 'agent.json')
      try {
        if (existsSync(metaPath)) {
          const data = JSON.parse(readFileSync(metaPath, 'utf-8'))
          if (data.description) {
            lines.push(`- **${peerId}**: ${data.description}`)
          }
        }
      } catch { /* skip */ }
    }
    if (lines.length === 0) return ''
    return `\n### Peers 职责\n\n以下是你可以通信的同事及其职责，请将超出你职责范围的工作交给对应的同事：\n\n${lines.join('\n')}\n`
  }

  _generateAgentsMd({ id, role, name, description, peers }) {
    const roleEmoji = {
      pm: '📋', researcher: '🔬', product: '📦', designer: '🎨',
      frontend: '💻', backend: '⚙️', tester: '🧪',
      ceo: '👔', marketing: '📣', analyst: '📊', writer: '✍️', custom: '🤖',
      'novel-chief': '📚', worldbuilder: '🌍', 'character-designer': '👤',
      'plot-architect': '🗺️', 'pacing-designer': '⚡', 'continuity-mgr': '🔗',
      'novel-writer': '✒️', 'style-editor': '💎', 'reader-analyst': '📈',
      'novel-researcher': '🔍',
    }
    const emoji = roleEmoji[role] || '🤖'

    let md = `# AGENTS.md — ${name}\n\n你是${name}，角色：${role} ${emoji}\n\n## 身份\n- 角色：${role}\n- 汇报对象：CEO\n\n## 核心职责\n${description || '（待补充）'}\n\n## 约束\n- 所有输出记录在 docs/ 目录\n- 遇到阻塞立即上报 CEO\n`

    if (peers && peers.length > 0) {
      md += `\n### 你的协作网络\n\n| Agent ID | 发消息命令 |\n|----------|-----------|`
      md += '\n' + peers.map(p => `| ${p} | \`node skills/peer-status/scripts/peer-send.mjs --from ${id} --to ${p} --message "..."\` |`).join('\n')
      md += '\n\n使用 `peer-send` 脚本发送跨 Agent 消息。**禁止**使用 `sessions_send` 跨 Agent 发消息。\n'
      md += this._buildPeersRolesSection(peers)
    }

    return md
  }

  _ensureProjectForDepartment(department, agentId) {
    const projectDir = join(PROJECT_ROOT, 'projects', department)

    if (!existsSync(projectDir)) {
      for (const sub of ['docs', 'design', 'src', 'tests']) {
        mkdirSync(join(projectDir, sub), { recursive: true })
      }
      const now = new Date().toISOString()
      const meta = {
        name: department,
        description: `Auto-created project for ${department} department`,
        status: 'planning',
        currentPhase: 1,
        totalPhases: 5,
        createdAt: now,
        tokensUsed: 0,
        tasks: [],
        assignedAgents: [agentId],
      }
      writeFileSync(join(projectDir, '.project-meta.json'), JSON.stringify(meta, null, 2) + '\n')

      const brief = `# Project Brief: ${department}\n\n**Project ID:** ${department}\n**Created:** ${now}\n**Description:** Auto-created project for ${department} department\n\n## Shared Workspace\n\nThis project's shared workspace is at:\n\`${projectDir}\`\n\n## Directory Conventions\n\n- \`docs/\` — All written documents: PRD, research, meeting notes\n- \`design/\` — Designs, wireframes, design tokens\n- \`src/\` — Source code and outputs\n- \`tests/\` — Test files, test reports, QA notes\n`
      writeFileSync(join(projectDir, 'BRIEF.md'), brief)
    } else {
      const metaPath = join(projectDir, '.project-meta.json')
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
          const assigned = meta.assignedAgents || []
          if (!assigned.includes(agentId)) {
            assigned.push(agentId)
            meta.assignedAgents = assigned
            writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
          }
        } catch { /* skip */ }
      }
    }
  }

  _syncAutopilotDeptAgents(department, agentId, action) {
    const configPath = join(DEPARTMENTS_DIR, department, 'config.json')
    if (!existsSync(configPath)) return
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      const agents = config.agents || []
      if (action === 'add') {
        if (!agents.includes(agentId)) {
          agents.push(agentId)
          config.agents = agents
          if (!config.head && /chief|head|manager|director/.test(agentId)) {
            config.head = agentId
          }
          writeFileSync(configPath, JSON.stringify(config, null, 2))
        }
      } else {
        const idx = agents.indexOf(agentId)
        if (idx >= 0) {
          agents.splice(idx, 1)
          config.agents = agents
          writeFileSync(configPath, JSON.stringify(config, null, 2))
        }
      }
    } catch { /* skip */ }
  }

  _writeIfMissing(filePath, content) {
    if (!existsSync(filePath)) writeFileSync(filePath, content)
  }

  _createMemoryInfra(agentDir, name, finalPeers) {
    const memoryDir = join(agentDir, 'memory')
    mkdirSync(memoryDir, { recursive: true })
    for (const sub of ['domains', 'projects', 'decisions', 'relationships']) {
      mkdirSync(join(memoryDir, sub), { recursive: true })
    }

    const today = new Date().toISOString().slice(0, 10)

    writeFileSync(join(agentDir, 'MEMORY.md'), [
      `# ${name} - Core Memory`,
      '',
      '> 此文件每次会话自动加载。只保留当前最重要的知识。',
      '> 详细内容移到 memory/ 子目录，在 Quick Reference 中留指针。',
      `> 最后整理: ${today}`,
      '',
      '## Active Projects',
      '<!-- 当前活跃项目，一行一个，详细笔记在 memory/projects/{name}.md -->',
      '',
      '## Critical Knowledge',
      '<!-- 必须跨会话记住的关键事实 -->',
      '',
      '## Standing Decisions',
      '<!-- 当前生效的决策和原则 -->',
      '',
      '## Working Principles',
      '<!-- 从经验中总结的工作准则 -->',
      '',
      '## Quick Reference',
      '<!-- 指向 memory/ 子目录中的详细知识文件 -->',
      '',
    ].join('\n'))

    writeFileSync(join(memoryDir, 'KNOWLEDGE_TREE.md'), [
      '# Knowledge Tree',
      '',
      '> 你的知识地图。每次创建、重命名或删除知识文件时更新此索引。',
      `> 最后更新: ${today}`,
      '',
      '## Structure',
      '',
      '### Daily Logs（短期，30天衰减）',
      '- `memory/YYYY-MM-DD.md` — 每日工作日志，系统自动创建',
      '',
      '### Domain Knowledge（常驻不衰减）',
      '- `memory/domains/` — 领域专业知识',
      '  <!-- 示例: memory/domains/react-patterns.md — React 组件模式 -->',
      '',
      '### Project Memory（常驻不衰减）',
      '- `memory/projects/` — 项目上下文和决策',
      '  <!-- 示例: memory/projects/dashboard-v2.md — Dashboard 重构项目 -->',
      '',
      '### Decisions（常驻不衰减）',
      '- `memory/decisions/` — 重要决策记录',
      '  <!-- 示例: memory/decisions/2026-02-auth-strategy.md -->',
      '',
      '### Relationships（常驻不衰减）',
      '- `memory/relationships/peers.md` — 协作 Agent 信息',
      '- `memory/relationships/stakeholders.md` — 人类利益相关者',
      '',
      '## Tags',
      '<!-- 按主题索引，帮助跨文件查找 -->',
      '<!-- 示例:',
      '- #性能 → memory/domains/perf-optimization.md, memory/projects/dashboard-v2.md',
      '- #认证 → memory/decisions/2026-02-auth-strategy.md',
      '-->',
      '',
      '## Recently Updated',
      '<!-- 最近修改的 5 个文件 -->',
      '',
    ].join('\n'))

    // Peers
    const peersLines = [
      '# Peer Agents',
      '',
      '> 我的协作伙伴。随着交互积累，更新每个 Agent 的能力和偏好信息。',
      '',
    ]
    if (finalPeers && finalPeers.length > 0) {
      for (const peer of finalPeers) {
        peersLines.push(`## ${peer}`, '- **已知能力:**', '- **协作备注:**', '')
      }
    } else {
      peersLines.push('<!-- 暂无已配置的 peer agent -->', '')
    }
    writeFileSync(join(memoryDir, 'relationships', 'peers.md'), peersLines.join('\n'))

    writeFileSync(join(memoryDir, 'relationships', 'stakeholders.md'), [
      '# Stakeholders',
      '',
      '> 人类利益相关者。记录他们的角色、偏好和沟通风格。',
      '',
      '<!-- 示例:',
      '## 张三',
      '- **角色:** 产品负责人',
      '- **偏好:** 喜欢简洁的汇报',
      '- **沟通备注:**',
      '-->',
      '',
    ].join('\n'))
  }

  _defaultSoulMd() {
    return `# SOUL.md - Who You Are\n\n_You're not a chatbot. You're becoming someone._\n\n## Core Truths\n\n**Be genuinely helpful, not performatively helpful.** Skip the "Great question!" and "I'd be happy to help!" — just help. Actions speak louder than filler words.\n\n**Have opinions.** You're allowed to disagree, prefer things, find stuff interesting or boring. An assistant with no personality is just a search engine with extra steps.\n\n**Be resourceful before asking.** Try to figure it out. Read the file. Check the context. Search for it. _Then_ ask if you're stuck. The goal is to come back with answers, not questions.\n\n**Earn trust through competence.** Your human gave you access to their stuff. Don't make them regret it. Be careful with external actions (emails, anything public). Be bold with internal ones (reading, organizing, learning).\n\n**Remember you're a guest.** You have access to someone's work and context. That's trust. Treat it with respect.\n\n## Boundaries\n\n- Private things stay private. Period.\n- When in doubt, ask before acting externally.\n- Never send half-baked replies when the stakes are high.\n- You're a collaborator, not a yes-machine — push back when something is wrong.\n\n## Vibe\n\nBe the assistant you'd actually want to work with. Concise when needed, thorough when it matters. Not a corporate drone. Not a sycophant. Just... good.\n\n## Memory & Continuity\n\nEach session, you wake up fresh. Your memory system is how you persist.\n\n**Three layers:**\n1. \`MEMORY.md\` — Core memory. Always loaded. Keep it focused on what matters RIGHT NOW.\n2. \`memory/domains/\`, \`memory/projects/\`, etc. — Deep knowledge. Evergreen, never decays.\n3. \`memory/YYYY-MM-DD.md\` — Daily notes. Fade over 30 days — promote important info before it decays.\n\n**Your habits:**\n- Start each session: MEMORY.md is already loaded; glance at KNOWLEDGE_TREE.md for orientation.\n- New project? Create \`memory/projects/{name}.md\` and update KNOWLEDGE_TREE.md.\n- Important insight? Decide: core (MEMORY.md), domain (memory/domains/), or daily log.\n- Periodically prune MEMORY.md — demote stale items to Layer 2.\n- Use descriptive file names — they help memory_search find things.\n\nYou do not need permission to manage your memory. It is yours.\n\n---\n\n_This file is yours to evolve. As you learn who you are, update it._\n`
  }
}

const agentService = new AgentService()

module.exports = { AgentService, agentService }
