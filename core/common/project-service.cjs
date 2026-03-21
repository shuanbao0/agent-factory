'use strict'
/**
 * ProjectService — 项目生命周期管理
 *
 * 职责：创建项目、列出项目（含 token 用量）
 */
const { join } = require('path')
const { projectMetaRepo } = require('../repo/project-meta.cjs')
const { sessionRepo } = require('../repo/session.cjs')
const { injectStandardsForProject } = require('./project-standards.cjs')
const { generatePhaseDeliverables } = require('./phase-deliverables.cjs')

const { PROJECTS_DIR } = require('./paths.cjs')

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
  const topDirs = projectMetaRepo.listProjectIds()
  for (const name of topDirs) {
    if (!seenTopLevel.has(name)) {
      projects.push({ id: name, name, description: '', status: 'unknown' })
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

  const slug = name.trim().toLowerCase()
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!slug) return { ok: false, error: 'invalid project name', status: 400 }

  const id = department ? `${department}/${slug}` : slug

  const existingMeta = projectMetaRepo.readMeta(id)
  if (existingMeta) {
    return { ok: false, error: `Project "${id}" already exists`, status: 409 }
  }

  // Create directory structure from workflow
  projectMetaRepo.ensureProjectDirs(id, workflow.directories)

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
  const projectDir = join(PROJECTS_DIR, id)
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
  projectMetaRepo.writeProjectFile(id, 'BRIEF.md', brief)

  // Fire-and-forget: inject project standards + phase 1 deliverable templates
  try { injectStandardsForProject(id) } catch { /* non-blocking */ }
  try {
    const phase1 = workflow.phases[0]
    const phaseKey = phase1?.key || phase1?.labelEn?.toLowerCase()
    if (phaseKey) {
      let deptConfig = null
      if (department) {
        try { deptConfig = require('../repo/dept-config.cjs').deptConfigRepo.load(department) } catch { /* skip */ }
      }
      generatePhaseDeliverables(id, phaseKey, meta, deptConfig)
    }
  } catch { /* non-blocking */ }

  return { ok: true, project: { id, ...meta } }
}

module.exports = { listProjects, createProject }
