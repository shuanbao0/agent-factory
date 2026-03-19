'use strict'
/**
 * ProjectService — 项目生命周期管理
 *
 * 职责：创建项目、列出项目（含 token 用量）
 */
const { mkdirSync, existsSync, writeFileSync } = require('fs')
const { join } = require('path')
const { projectMetaRepo } = require('../repo/project-meta.cjs')
const { sessionRepo } = require('../repo/session.cjs')

const PROJECT_ROOT = join(__dirname, '..', '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

/**
 * 列出所有项目（含 token 用量）
 * @returns {Array<Record<string, unknown>>}
 */
function listProjects() {
  const tokensByAgent = sessionRepo.fetchSessionTokens().byAgent
  const allProjects = projectMetaRepo.readAll()

  const projects = []
  const seenTopLevel = new Set()

  for (const { projectId, meta } of allProjects) {
    const assigned = meta.assignedAgents || []
    if (assigned.length > 0) {
      meta.tokensUsed = assigned.reduce((sum, aid) => sum + (tokensByAgent[aid] || 0), 0)
    }

    const isSubProject = projectId.includes('/')
    if (isSubProject) {
      const parentId = projectId.split('/')[0]
      meta.department = parentId
      meta.parentProject = parentId
    }

    projects.push({ id: projectId, ...meta })
    if (!isSubProject) seenTopLevel.add(projectId)
  }

  // Add unknown top-level directories without .project-meta.json
  if (existsSync(PROJECTS_DIR)) {
    const { readdirSync } = require('fs')
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const d of dirs) {
      if (!seenTopLevel.has(d.name)) {
        projects.push({ id: d.name, name: d.name, description: '', status: 'unknown' })
      }
    }
  }

  return projects
}

/**
 * 创建项目
 * @param {object} body - { name, description, department, workflow }
 * @param {object} workflow - Department workflow (phases, directories)
 * @returns {{ ok: boolean, project?: object, error?: string, status?: number }}
 */
function createProject(body, workflow) {
  const { name, description = '', department } = body

  if (!name?.trim()) {
    return { ok: false, error: 'name is required', status: 400 }
  }

  const id = name.trim().toLowerCase()
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!id) return { ok: false, error: 'invalid project name', status: 400 }

  const projectDir = join(PROJECTS_DIR, id)
  if (existsSync(projectDir)) {
    return { ok: false, error: `Project "${id}" already exists`, status: 409 }
  }

  // Create directory structure from workflow
  for (const sub of workflow.directories) {
    mkdirSync(join(projectDir, sub), { recursive: true })
  }

  const now = new Date().toISOString()
  const meta = {
    name: name.trim(),
    description,
    status: 'planning',
    currentPhase: 1,
    totalPhases: workflow.phases.length,
    phases: workflow.phases,
    department: department || undefined,
    createdAt: now,
    tokensUsed: 0,
    tasks: [],
    assignedAgents: [],
  }
  projectMetaRepo.writeMeta(id, meta)

  // Build BRIEF.md
  const dirList = workflow.directories.map(d => `- \`${d}/\``).join('\n')
  const phaseList = workflow.phases.map((p, i) => `${i + 1}. **${p.labelEn}** (${p.labelZh})`).join('\n')

  const brief = `# Project Brief: ${meta.name}

**Project ID:** ${id}
**Created:** ${now}
**Department:** ${department || 'none'}
**Description:** ${description || '(none)'}

## Shared Workspace

This project's shared workspace is at:
\`${projectDir}\`

## Phases

${phaseList}

## Directory Conventions

${dirList}

## Agent Workflow

Agents should coordinate through tasks and use the shared directories above for deliverables.
Leave notes for other agents in the project directory.
`
  writeFileSync(join(projectDir, 'BRIEF.md'), brief)

  return { ok: true, project: { id, ...meta } }
}

module.exports = { listProjects, createProject }
