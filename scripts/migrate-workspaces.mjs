#!/usr/bin/env node
/**
 * migrate-workspaces.mjs
 *
 * Migrates existing agents to the new workspace layout:
 * 1. Ensures workspaces/{id}/ exists for each agent (output directory)
 * 2. Moves output directories (e.g. agents/novel-chief/novel/) to workspaces/{id}/
 * 3. Ensures config/openclaw.json workspace paths point to agents/{id}/ (definition dir)
 * 4. Creates projects/{department}/ and assigns department agents
 *
 * Architecture:
 *   agents/{id}/     = agent core (AGENTS.md, SOUL.md, memory, skills, agent.json)
 *   workspaces/{id}/ = agent output (documents, code, etc.)
 *   openclaw.json workspace → agents/{id}/ (gateway reads definitions from here)
 *   base-rules.md instructs agents to write output to workspaces/{id}/
 *
 * Usage:
 *   node scripts/migrate-workspaces.mjs           # execute migration
 *   node scripts/migrate-workspaces.mjs --dry-run  # preview only
 */

import { existsSync, readdirSync, mkdirSync, renameSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, '..')

const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')
const OPENCLAW_CONFIG = join(PROJECT_ROOT, 'config', 'openclaw.json')

const DRY_RUN = process.argv.includes('--dry-run')

function log(msg) {
  console.log(DRY_RUN ? `[DRY-RUN] ${msg}` : msg)
}

// Agent core files/dirs — should NOT be moved to workspaces
const CORE_ENTRIES = new Set([
  'AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'TOOLS.md', 'MEMORY.md',
  'USER.md', 'HEARTBEAT.md', 'agent.json',
  'memory', 'skills',
  'agents',  // openclaw runtime subdir
])

function getAgentIds() {
  if (!existsSync(AGENTS_DIR)) return []
  return readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name)
}

function migrateAgent(agentId) {
  const agentDir = join(AGENTS_DIR, agentId)
  const workspaceDir = join(WORKSPACES_DIR, agentId)

  log(`\n── Migrating: ${agentId} ──`)

  // 1. Ensure workspace output dir exists
  if (!existsSync(workspaceDir)) {
    log(`  mkdir workspaces/${agentId}/`)
    if (!DRY_RUN) mkdirSync(workspaceDir, { recursive: true })
  }

  // 2. Move non-core entries from agents/{id}/ to workspaces/{id}/
  const entries = readdirSync(agentDir, { withFileTypes: true })
  for (const entry of entries) {
    if (CORE_ENTRIES.has(entry.name)) continue
    if (entry.name.startsWith('.')) continue

    const src = join(agentDir, entry.name)
    const dest = join(workspaceDir, entry.name)

    if (existsSync(dest)) {
      log(`  skip ${entry.name} (already in workspaces/)`)
      continue
    }

    log(`  move ${entry.name} → workspaces/${agentId}/${entry.name}`)
    if (!DRY_RUN) renameSync(src, dest)
  }
}

function ensureOpenclawConfig() {
  if (!existsSync(OPENCLAW_CONFIG)) {
    log('\nNo openclaw.json found — skipping')
    return
  }

  log('\n── Checking config/openclaw.json ──')
  const config = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf-8'))
  const list = config.agents?.list || []
  let changed = 0

  for (const entry of list) {
    if (!entry.id || !entry.workspace) continue
    const expectedWorkspace = join(AGENTS_DIR, entry.id)

    if (entry.workspace !== expectedWorkspace) {
      log(`  ${entry.id}: ${entry.workspace.split('agent-factory/')[1] || entry.workspace} → agents/${entry.id}`)
      entry.workspace = expectedWorkspace
      changed++
    } else {
      log(`  ${entry.id}: OK`)
    }
  }

  if (changed > 0) {
    log(`  Fixed ${changed} workspace path(s)`)
    if (!DRY_RUN) {
      writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2) + '\n')
    }
  } else {
    log(`  All paths correct`)
  }
}

function ensureDepartmentProjects(agentIds) {
  // Group agents by department
  const departments = {}
  for (const id of agentIds) {
    try {
      const agentJson = JSON.parse(readFileSync(join(AGENTS_DIR, id, 'agent.json'), 'utf-8'))
      const dept = agentJson.department
      if (dept) {
        if (!departments[dept]) departments[dept] = []
        departments[dept].push(id)
      }
    } catch { /* skip */ }
  }

  for (const [dept, agents] of Object.entries(departments)) {
    const projectDir = join(PROJECTS_DIR, dept)
    log(`\n── Project: ${dept} (${agents.length} agents) ──`)

    if (existsSync(projectDir)) {
      const metaPath = join(projectDir, '.project-meta.json')
      if (existsSync(metaPath)) {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        const existing = new Set(meta.assignedAgents || [])
        let added = 0
        for (const id of agents) {
          if (!existing.has(id)) { existing.add(id); added++ }
        }
        if (added > 0) {
          meta.assignedAgents = [...existing]
          log(`  Added ${added} agent(s)`)
          if (!DRY_RUN) writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
        } else {
          log(`  All agents already assigned`)
        }
      }
      continue
    }

    log(`  Creating project directory`)
    if (!DRY_RUN) {
      for (const sub of ['docs', 'design', 'src', 'tests']) {
        mkdirSync(join(projectDir, sub), { recursive: true })
      }

      const now = new Date().toISOString()
      writeFileSync(join(projectDir, '.project-meta.json'), JSON.stringify({
        name: dept,
        description: `Project for ${dept} department`,
        status: 'planning',
        currentPhase: 1,
        totalPhases: 5,
        createdAt: now,
        tokensUsed: 0,
        tasks: [],
        assignedAgents: agents,
      }, null, 2) + '\n')

      writeFileSync(join(projectDir, 'BRIEF.md'), `# Project Brief: ${dept}

**Project ID:** ${dept}
**Created:** ${now}
**Description:** Project for ${dept} department

## Shared Workspace

\`${projectDir}\`

## Directory Conventions

- \`docs/\` — Documents, outlines, research
- \`design/\` — Designs, plans, structure
- \`src/\` — Source content and drafts
- \`tests/\` — Reviews, checks, feedback
`)
    }
    log(`  Assigned: ${agents.join(', ')}`)
  }
}

// ── Main ──

console.log(`\n${'='.repeat(60)}`)
console.log(`  Agent Factory — Workspace Migration`)
console.log(`  ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🚀 EXECUTING'}`)
console.log(`${'='.repeat(60)}`)

const agentIds = getAgentIds()
console.log(`\nFound ${agentIds.length} agent(s): ${agentIds.join(', ')}`)

for (const id of agentIds) {
  migrateAgent(id)
}

ensureOpenclawConfig()
ensureDepartmentProjects(agentIds)

console.log(`\n${'='.repeat(60)}`)
console.log(DRY_RUN ? `  Dry run complete. Run without --dry-run to execute.` : `  Done! Restart Gateway to apply.`)
console.log(`${'='.repeat(60)}\n`)
