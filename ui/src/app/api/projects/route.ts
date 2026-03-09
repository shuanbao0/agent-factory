import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { getDepartmentWorkflow } from '@/lib/department-workflow'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')
const SESSIONS_DIR = join(PROJECT_ROOT, '.openclaw-state', 'agents')

/** Read real token usage from gateway session files, grouped by agent */
function getSessionTokensByAgent(): Record<string, number> {
  const byAgent: Record<string, number> = {}
  try {
    if (!existsSync(SESSIONS_DIR)) return byAgent
    const agentDirs = readdirSync(SESSIONS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const dir of agentDirs) {
      const sessFile = join(SESSIONS_DIR, dir.name, 'sessions', 'sessions.json')
      if (!existsSync(sessFile)) continue
      try {
        const sessions = JSON.parse(readFileSync(sessFile, 'utf-8'))
        let total = 0
        for (const key of Object.keys(sessions)) {
          total += sessions[key]?.totalTokens || 0
        }
        byAgent[dir.name] = total
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return byAgent
}

/** Parse a project directory into a project object, returns null if not a valid project */
function parseProject(dirPath: string, projectId: string, tokensByAgent: Record<string, number>): Record<string, unknown> | null {
  const metaPath = join(dirPath, '.project-meta.json')
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      const assigned: string[] = meta.assignedAgents || []
      if (assigned.length > 0) {
        meta.tokensUsed = assigned.reduce((sum: number, aid: string) => sum + (tokensByAgent[aid] || 0), 0)
      }
      return { id: projectId, ...meta }
    } catch { /* fall through */ }
  }
  return null
}

export async function GET() {
  try {
    if (!existsSync(PROJECTS_DIR)) {
      return NextResponse.json({ projects: [], source: 'filesystem' })
    }
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())

    // Load live token data once
    const tokensByAgent = getSessionTokensByAgent()

    const projects: Record<string, unknown>[] = []

    for (const d of dirs) {
      const dirPath = join(PROJECTS_DIR, d.name)
      const topProject = parseProject(dirPath, d.name, tokensByAgent)

      if (topProject) {
        projects.push(topProject)
      }

      // Scan sub-projects: projects/{department}/{book-id}/
      // A sub-project is a subdirectory that has its own .project-meta.json
      try {
        const subDirs = readdirSync(dirPath, { withFileTypes: true })
          .filter(sd => sd.isDirectory() && !sd.name.startsWith('.'))
        for (const sd of subDirs) {
          const subDirPath = join(dirPath, sd.name)
          const subMetaPath = join(subDirPath, '.project-meta.json')
          if (existsSync(subMetaPath)) {
            const subId = `${d.name}/${sd.name}`
            const subProject = parseProject(subDirPath, subId, tokensByAgent)
            if (subProject) {
              subProject.department = d.name
              subProject.parentProject = d.name
              projects.push(subProject)
            }
          }
        }
      } catch { /* ignore sub-scan errors */ }

      // If top-level dir has no .project-meta.json, add as unknown
      if (!topProject) {
        projects.push({
          id: d.name,
          name: d.name,
          description: '',
          status: 'unknown',
        })
      }
    }

    return NextResponse.json({ projects, source: 'filesystem' })
  } catch (e) {
    return NextResponse.json({ error: String(e), projects: [], source: 'error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, description = '', department } = await req.json() as { name: string; description?: string; department?: string }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    // Slugify name -> id
    const id = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
    if (!id) return NextResponse.json({ error: 'invalid project name' }, { status: 400 })

    const projectDir = join(PROJECTS_DIR, id)
    if (existsSync(projectDir)) {
      return NextResponse.json({ error: `Project "${id}" already exists` }, { status: 409 })
    }

    // Get workflow from department
    const workflow = getDepartmentWorkflow(department)

    // Create directory structure from workflow
    for (const sub of workflow.directories) {
      mkdirSync(join(projectDir, sub), { recursive: true })
    }

    const now = new Date().toISOString()
    const meta: Record<string, unknown> = {
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
    writeFileSync(join(projectDir, '.project-meta.json'), JSON.stringify(meta, null, 2) + '\n')

    // Build BRIEF.md content based on department
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

    return NextResponse.json({ ok: true, project: { id, ...meta } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
