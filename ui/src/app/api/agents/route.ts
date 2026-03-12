import { NextRequest, NextResponse } from 'next/server'
import { readTemplate, getTemplateDir } from '@/lib/template-meta'
import { fetchAgentsData } from '@/lib/data-fetchers'
import { injectBaseRulesForAgent } from '@/lib/base-rules'
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, renameSync } from 'fs'
import { join, resolve } from 'path'
import { restartGateway, getStatus } from '@/lib/gateway-manager'
import { syncSkillSymlinks } from '@/lib/skill-symlinks'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const OPENCLAW_CONFIG = join(PROJECT_ROOT, 'config/openclaw.json')
const MODELS_CONFIG = join(PROJECT_ROOT, 'config/models.json')

// ── Helpers ─────────────────────────────────────────────────────

function resolveModelRef(ref: string): string {
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

function parseSkillMeta(skillMd: string): { name: string; description: string; bins: string[] } {
  const fmMatch = skillMd.match(/^---\n([\s\S]*?)\n---/)
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

function generateToolsMd(agentId: string, skills: string[], agentDir: string): string {
  const lines: string[] = [`# TOOLS.md — ${agentId} Agent`, '']

  if (skills.length === 0) {
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
      } catch {}
    }
    lines.push(`### ${slug}`, `- Full docs: \`skills/${slug}/SKILL.md\``, '')
  }

  // Add peer communication quick reference if peer-status skill installed
  if (skills.includes('peer-status')) {
    lines.push('## Peer Communication Quick Reference', '')
    lines.push('### 查询 peer 在线状态', '')
    lines.push('```bash')
    lines.push(`node skills/peer-status/scripts/peer-status.mjs --agent-id ${agentId}`)
    lines.push('```')
    lines.push('输出 JSON 数组：`[{ id, name, status, updatedAt }]`，status 为 `busy` 或 `online`。', '')
    lines.push('### 发送跨 Agent 消息', '')
    lines.push('```bash')
    lines.push(`# 同步模式（等待回复）`)
    lines.push(`node skills/peer-status/scripts/peer-send.mjs --from ${agentId} --to <peerId> --message "消息内容"`)
    lines.push('')
    lines.push(`# 异步模式（发送后立即返回）`)
    lines.push(`node skills/peer-status/scripts/peer-send.mjs --from ${agentId} --to <peerId> --message "消息内容" --no-wait`)
    lines.push('```')
    lines.push('> **注意**：禁止使用 `sessions_send` 跨 Agent 发消息，会被 Gateway 阻断。必须使用 `peer-send` 脚本。', '')
  }

  lines.push('---')
  lines.push('_Auto-generated from agent.json skills[] on deploy. Run "Sync Config" to regenerate._')
  return lines.join('\n')
}

function readOpenlawConfig(): Record<string, any> {
  if (existsSync(OPENCLAW_CONFIG)) {
    return JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf-8'))
  }
  return {}
}

function writeOpenclawConfig(config: Record<string, any>) {
  writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2) + '\n')
}

function addToOpenclawConfig(agentId: string, workspaceDir: string, model: string | undefined) {
  const config = readOpenlawConfig()
  if (!config.agents) config.agents = {}
  if (!config.agents.list) config.agents.list = []
  if (!config.tools) config.tools = {}
  if (!config.tools.agentToAgent) config.tools.agentToAgent = { enabled: true, allow: ['*'] }

  const list = config.agents.list as Array<{ id: string; [key: string]: any }>
  const existingIdx = list.findIndex(a => a.id === agentId)

  const entry: { id: string; [key: string]: any } = {
    id: agentId,
    workspace: workspaceDir,
  }
  if (model) entry.model = { primary: resolveModelRef(model) }
  entry.subagents = { allowAgents: [agentId] }

  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...entry }
  } else {
    list.push(entry)
  }

  config.agents.list = list
  writeOpenclawConfig(config)
}

function removeFromOpenclawConfig(agentId: string) {
  const config = readOpenlawConfig()
  if (!config.agents?.list) return
  config.agents.list = (config.agents.list as Array<{ id: string }>).filter(a => a.id !== agentId)
  writeOpenclawConfig(config)
}

const DEPARTMENTS_DIR = join(PROJECT_ROOT, 'config/departments')

function syncAutopilotDeptAgents(department: string, agentId: string, action: 'add' | 'remove') {
  const configPath = join(DEPARTMENTS_DIR, department, 'config.json')
  if (!existsSync(configPath)) return
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    const agents: string[] = config.agents || []
    if (action === 'add') {
      if (!agents.includes(agentId)) {
        agents.push(agentId)
        config.agents = agents
        // Auto-set head if empty and agent looks like a head
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

function ensureProjectForDepartment(department: string, agentId: string) {
  const projectDir = join(PROJECT_ROOT, 'projects', department)

  // Create project directory structure if it doesn't exist
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

    const brief = `# Project Brief: ${department}

**Project ID:** ${department}
**Created:** ${now}
**Description:** Auto-created project for ${department} department

## Shared Workspace

This project's shared workspace is at:
\`${projectDir}\`

## Directory Conventions

- \`docs/\` — All written documents: PRD, research, meeting notes
- \`design/\` — Designs, wireframes, design tokens
- \`src/\` — Source code and outputs
- \`tests/\` — Test files, test reports, QA notes
`
    writeFileSync(join(projectDir, 'BRIEF.md'), brief)
  } else {
    // Project exists — ensure agent is in assignedAgents
    const metaPath = join(projectDir, '.project-meta.json')
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        const assigned: string[] = meta.assignedAgents || []
        if (!assigned.includes(agentId)) {
          assigned.push(agentId)
          meta.assignedAgents = assigned
          writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
        }
      } catch { /* skip */ }
    }
  }
}

async function tryRestartGateway(): Promise<boolean> {
  try {
    const status = await getStatus()
    if (status.status === 'running') {
      const result = await restartGateway()
      return result.ok
    }
  } catch {}
  return false
}

function writeIfMissing(filePath: string, content: string) {
  if (!existsSync(filePath)) writeFileSync(filePath, content)
}

// ── GET: List all agents ────────────────────────────────────────

export async function GET() {
  try {
    const data = await fetchAgentsData()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), source: 'error' },
      { status: 502 }
    )
  }
}

// ── POST: Create a new agent (atomic: create + deploy) ──────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, templateId, name, description, model, skills, peers, systemPrompt, department } = body as {
      id: string
      templateId?: string
      name: string
      description?: string
      model?: string
      skills?: string[]
      peers?: string[]
      systemPrompt?: string
      department?: string
    }

    if (!id || !name) {
      return NextResponse.json({ error: 'id and name are required' }, { status: 400 })
    }

    if (!/^[a-z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: 'ID must be lowercase alphanumeric with hyphens' }, { status: 400 })
    }

    const agentDir = join(AGENTS_DIR, id)
    if (existsSync(agentDir)) {
      return NextResponse.json({ error: `Agent "${id}" already exists` }, { status: 409 })
    }

    // Load template defaults if templateId provided
    let tmplDefaults = { model: '', skills: [] as string[], peers: [] as string[] }
    let tmplDir: string | null = null
    if (templateId) {
      const template = readTemplate(templateId)
      if (template) {
        tmplDefaults = template.defaults
        tmplDir = getTemplateDir(templateId)
      }
    }

    // Merge: user overrides take precedence over template defaults
    const finalModel = model || tmplDefaults.model || ''
    const mergedSkills = skills || tmplDefaults.skills || []
    // Ensure peer-status is always included (required for cross-agent messaging)
    const finalSkills = mergedSkills.includes('peer-status')
      ? mergedSkills
      : [...mergedSkills, 'peer-status']
    const finalPeers = peers || tmplDefaults.peers || []
    const finalDescription = description || ''
    const finalRole = templateId || id

    // 1. Create agents/{id}/ with agent.json
    mkdirSync(join(agentDir, 'skills'), { recursive: true })

    // Resolve department: explicit > template group > undefined
    let finalDepartment = department
    if (!finalDepartment && templateId) {
      const template = readTemplate(templateId)
      if (template?.group) finalDepartment = template.group
    }

    const agentJson: Record<string, unknown> = {
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

    // 2. Materialize AGENTS.md
    if (systemPrompt) {
      writeFileSync(join(agentDir, 'AGENTS.md'), systemPrompt)
    } else if (tmplDir && existsSync(join(tmplDir, 'AGENTS.md'))) {
      writeFileSync(join(agentDir, 'AGENTS.md'), readFileSync(join(tmplDir, 'AGENTS.md'), 'utf-8'))
    } else {
      writeFileSync(join(agentDir, 'AGENTS.md'), generateAgentsMd({ id, role: finalRole, name, description: finalDescription, peers: finalPeers }))
    }

    // 2.5. Append peers roles section to AGENTS.md (for template-based agents)
    if (finalPeers.length > 0) {
      const peersSection = buildPeersRolesSection(finalPeers)
      if (peersSection) {
        const agentsMdPath = join(agentDir, 'AGENTS.md')
        const existing = readFileSync(agentsMdPath, 'utf-8')
        // Only append if not already present (idempotent)
        if (!existing.includes('### Peers 职责')) {
          writeFileSync(agentsMdPath, existing + peersSection)
        }
      }
    }

    // 2.6. Create skill symlinks (must happen before TOOLS.md generation)
    await syncSkillSymlinks(id, finalSkills)

    // 3. Materialize TOOLS.md
    if (tmplDir && existsSync(join(tmplDir, 'TOOLS.md'))) {
      writeFileSync(join(agentDir, 'TOOLS.md'), readFileSync(join(tmplDir, 'TOOLS.md'), 'utf-8'))
    } else {
      writeFileSync(join(agentDir, 'TOOLS.md'), generateToolsMd(id, finalSkills, agentDir))
    }

    // 4. Write identity files directly into agents/{id}/
    // Prefer copying from template if IDENTITY.md/SOUL.md exist there
    const identityFromTmpl = tmplDir && existsSync(join(tmplDir, 'IDENTITY.md'))
    const soulFromTmpl = tmplDir && existsSync(join(tmplDir, 'SOUL.md'))
    const hasIdentityFiles = !!(identityFromTmpl && soulFromTmpl)

    if (identityFromTmpl) {
      writeFileSync(join(agentDir, 'IDENTITY.md'), readFileSync(join(tmplDir!, 'IDENTITY.md'), 'utf-8'))
    } else {
      writeIfMissing(join(agentDir, 'IDENTITY.md'), `# IDENTITY.md - Who Am I?\n\n- **Name:** ${name}\n- **Creature:** AI agent\n- **Vibe:** Professional and focused\n- **Emoji:** 🤖\n`)
    }

    if (soulFromTmpl) {
      writeFileSync(join(agentDir, 'SOUL.md'), readFileSync(join(tmplDir!, 'SOUL.md'), 'utf-8'))
    } else {
      writeIfMissing(join(agentDir, 'SOUL.md'), `# SOUL.md - Who You Are\n\n_You're not a chatbot. You're becoming someone._\n\n## Core Truths\n\n**Be genuinely helpful, not performatively helpful.** Skip the "Great question!" and "I'd be happy to help!" — just help. Actions speak louder than filler words.\n\n**Have opinions.** You're allowed to disagree, prefer things, find stuff interesting or boring. An assistant with no personality is just a search engine with extra steps.\n\n**Be resourceful before asking.** Try to figure it out. Read the file. Check the context. Search for it. _Then_ ask if you're stuck. The goal is to come back with answers, not questions.\n\n**Earn trust through competence.** Your human gave you access to their stuff. Don't make them regret it. Be careful with external actions (emails, anything public). Be bold with internal ones (reading, organizing, learning).\n\n**Remember you're a guest.** You have access to someone's work and context. That's trust. Treat it with respect.\n\n## Boundaries\n\n- Private things stay private. Period.\n- When in doubt, ask before acting externally.\n- Never send half-baked replies when the stakes are high.\n- You're a collaborator, not a yes-machine — push back when something is wrong.\n\n## Vibe\n\nBe the assistant you'd actually want to work with. Concise when needed, thorough when it matters. Not a corporate drone. Not a sycophant. Just... good.\n\n## Memory & Continuity\n\nEach session, you wake up fresh. Your memory system is how you persist.\n\n**Three layers:**\n1. \`MEMORY.md\` — Core memory. Always loaded. Keep it focused on what matters RIGHT NOW.\n2. \`memory/domains/\`, \`memory/projects/\`, etc. — Deep knowledge. Evergreen, never decays.\n3. \`memory/YYYY-MM-DD.md\` — Daily notes. Fade over 30 days — promote important info before it decays.\n\n**Your habits:**\n- Start each session: MEMORY.md is already loaded; glance at KNOWLEDGE_TREE.md for orientation.\n- New project? Create \`memory/projects/{name}.md\` and update KNOWLEDGE_TREE.md.\n- Important insight? Decide: core (MEMORY.md), domain (memory/domains/), or daily log.\n- Periodically prune MEMORY.md — demote stale items to Layer 2.\n- Use descriptive file names — they help memory_search find things.\n\nYou do not need permission to manage your memory. It is yours.\n\n---\n\n_This file is yours to evolve. As you learn who you are, update it._\n`)
    }
    writeIfMissing(join(agentDir, 'USER.md'), `# USER.md - About Your Human\n\n- **Name:**\n- **What to call them:**\n- **Timezone:**\n- **Notes:**\n`)
    writeIfMissing(join(agentDir, 'HEARTBEAT.md'), `# HEARTBEAT.md\n\n# Keep this file empty to skip heartbeat API calls.\n`)

    // Create memory infrastructure
    const memoryDir = join(agentDir, 'memory')
    mkdirSync(memoryDir, { recursive: true })

    // Create memory subdirectories (evergreen, never decay)
    mkdirSync(join(memoryDir, 'domains'), { recursive: true })
    mkdirSync(join(memoryDir, 'projects'), { recursive: true })
    mkdirSync(join(memoryDir, 'decisions'), { recursive: true })
    mkdirSync(join(memoryDir, 'relationships'), { recursive: true })

    const today = new Date().toISOString().slice(0, 10)

    // Layer 1: Core Memory (auto-loaded every session, never decays)
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

    // Knowledge Tree index (agent self-maintained)
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

    // Relationships: peers.md (pre-populated from finalPeers)
    const peersLines = [
      '# Peer Agents',
      '',
      '> 我的协作伙伴。随着交互积累，更新每个 Agent 的能力和偏好信息。',
      '',
    ]
    if (finalPeers.length > 0) {
      for (const peer of finalPeers) {
        peersLines.push(`## ${peer}`, '- **已知能力:**', '- **协作备注:**', '')
      }
    } else {
      peersLines.push('<!-- 暂无已配置的 peer agent -->', '')
    }
    writeFileSync(join(memoryDir, 'relationships', 'peers.md'), peersLines.join('\n'))

    // Relationships: stakeholders.md (empty template)
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

    // 5. Inject global base rules into AGENTS.md and SOUL.md
    injectBaseRulesForAgent(agentDir)

    // 6. Create workspaces/{id}/ directory (for agent output)
    mkdirSync(join(PROJECT_ROOT, 'workspaces', id), { recursive: true })

    // 7. Add to openclaw.json (workspace = agents/{id})
    addToOpenclawConfig(id, agentDir, finalModel)

    // 8. Auto-create project for department + sync autopilot agents
    if (finalDepartment) {
      ensureProjectForDepartment(finalDepartment, id)
      syncAutopilotDeptAgents(finalDepartment, id, 'add')
    }

    // 9. Restart gateway
    const restarted = await tryRestartGateway()

    return NextResponse.json({ ok: true, id, deployed: true, restarted, hasIdentityFiles })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── PUT: Update an existing agent ───────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, description, model, skills, peers, systemPrompt, department } = body as {
      id: string
      name?: string
      description?: string
      model?: string
      skills?: string[]
      peers?: string[]
      systemPrompt?: string
      department?: string
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const agentDir = join(AGENTS_DIR, id)
    if (!existsSync(agentDir)) {
      return NextResponse.json({ error: `Agent "${id}" not found` }, { status: 404 })
    }

    // Read existing agent.json
    const agentJsonPath = join(agentDir, 'agent.json')
    let agentJson: Record<string, unknown> = {}
    if (existsSync(agentJsonPath)) {
      try { agentJson = JSON.parse(readFileSync(agentJsonPath, 'utf-8')) } catch {}
    }
    const oldDepartment = (agentJson.department as string) || undefined

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

    // Re-inject base rules (handles both systemPrompt updates and fresh re-injection)
    injectBaseRulesForAgent(agentDir)

    // Regenerate TOOLS.md in agents/{id}/ when skills change
    if (skills !== undefined) {
      const finalSkills = (agentJson.skills as string[]) || []
      await syncSkillSymlinks(id, finalSkills)
      writeFileSync(join(agentDir, 'TOOLS.md'), generateToolsMd(id, finalSkills, agentDir))
    }

    // Update openclaw.json and restart if model changed
    if (model !== undefined) {
      addToOpenclawConfig(id, agentDir, (agentJson.model as string) || '')
      await tryRestartGateway()
    }

    // Auto-create project for department + sync autopilot agents
    if (department !== undefined && department !== oldDepartment) {
      // Remove from old department's autopilot agents
      if (oldDepartment) {
        syncAutopilotDeptAgents(oldDepartment, id, 'remove')
      }
      // Add to new department
      if (department) {
        ensureProjectForDepartment(department, id)
        syncAutopilotDeptAgents(department, id, 'add')
      }
    } else {
      const currentDept = (agentJson.department as string) || undefined
      if (currentDept) {
        ensureProjectForDepartment(currentDept, id)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── DELETE: Remove an agent (atomic: delete + undeploy) ─────────
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // 1. Remove from openclaw.json
    removeFromOpenclawConfig(id)

    // 2. Remove agents/{id}/
    const agentDir = join(AGENTS_DIR, id)
    if (existsSync(agentDir)) {
      rmSync(agentDir, { recursive: true, force: true })
    }

    // 3. Remove Gateway runtime state (.openclaw-state/agents/{id}/)
    const stateDir = join(PROJECT_ROOT, '.openclaw-state', 'agents', id)
    if (existsSync(stateDir)) {
      rmSync(stateDir, { recursive: true, force: true })
    }

    // 4. Archive workspaces/{id}/ to workspaces/.archived/
    let archivedTo: string | null = null
    const workspaceDir = join(PROJECT_ROOT, 'workspaces', id)
    if (existsSync(workspaceDir)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const archiveDir = join(PROJECT_ROOT, 'workspaces', '.archived')
      mkdirSync(archiveDir, { recursive: true })
      const archivePath = join(archiveDir, `${id}_${timestamp}`)
      renameSync(workspaceDir, archivePath)
      archivedTo = `workspaces/.archived/${id}_${timestamp}`
    }

    // 5. Restart gateway
    const restarted = await tryRestartGateway()

    return NextResponse.json({ ok: true, restarted, archivedTo })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── Helper: Build peers roles section ────────────────────────────
function buildPeersRolesSection(peers: string[]): string {
  if (!peers || peers.length === 0) return ''
  const lines: string[] = []
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

// ── Helper: Generate default AGENTS.md ──────────────────────────
function generateAgentsMd({ id, role, name, description, peers }: {
  id: string; role: string; name: string; description: string; peers?: string[]
}): string {
  const roleEmoji: Record<string, string> = {
    pm: '📋', researcher: '🔬', product: '📦', designer: '🎨',
    frontend: '💻', backend: '⚙️', tester: '🧪',
    ceo: '👔', marketing: '📣', analyst: '📊', writer: '✍️', custom: '🤖',
    'novel-chief': '📚', worldbuilder: '🌍', 'character-designer': '👤',
    'plot-architect': '🗺️', 'pacing-designer': '⚡', 'continuity-mgr': '🔗',
    'novel-writer': '✒️', 'style-editor': '💎', 'reader-analyst': '📈',
    'novel-researcher': '🔍',
  }
  const emoji = roleEmoji[role] || '🤖'

  let md = `# AGENTS.md — ${name}

你是${name}，角色：${role} ${emoji}

## 身份
- 角色：${role}
- 汇报对象：CEO

## 核心职责
${description || '（待补充）'}

## 约束
- 所有输出记录在 docs/ 目录
- 遇到阻塞立即上报 CEO
`

  // Inject peer communication directory if peers exist
  if (peers && peers.length > 0) {
    md += `
### 你的协作网络

| Agent ID | 发消息命令 |
|----------|-----------|
${peers.map(p => `| ${p} | \`node skills/peer-status/scripts/peer-send.mjs --from ${id} --to ${p} --message "..."\` |`).join('\n')}

使用 \`peer-send\` 脚本发送跨 Agent 消息。**禁止**使用 \`sessions_send\` 跨 Agent 发消息。
`
    // Append peers roles section
    md += buildPeersRolesSection(peers)
  }

  return md
}
