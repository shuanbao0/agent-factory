import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import type { Task } from './types'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')
const TASKS_FILE = join(PROJECT_ROOT, 'config', 'tasks.json')

/** Normalize legacy task fields to new Task shape */
export function normalizeTask(raw: Record<string, unknown>, projectId?: string): Task {
  const assignees: string[] = Array.isArray(raw.assignees)
    ? raw.assignees as string[]
    : typeof raw.assignedAgent === 'string' && raw.assignedAgent
      ? [raw.assignedAgent as string]
      : []

  let status = (raw.status as string) || 'pending'
  if (status === 'running') status = 'in_progress'

  return {
    id: raw.id as string,
    name: raw.name as string,
    description: (raw.description as string) || undefined,
    projectId: projectId ?? (raw.projectId as string | null) ?? null,
    phase: (raw.phase as number) || undefined,
    status: status as Task['status'],
    priority: (raw.priority as Task['priority']) || 'P1',
    assignees,
    assignedAgent: assignees[0] || undefined,
    creator: (raw.creator as string) || 'user',
    progress: (raw.progress as number) || 0,
    dependencies: (raw.dependencies as string[]) || [],
    output: (raw.output as string) || undefined,
    tags: (raw.tags as string[]) || undefined,
    type: (raw.type as string) || undefined,
    parentTaskId: (raw.parentTaskId as string) || undefined,
    quality: raw.quality as Task['quality'],
    createdAt: (raw.createdAt as string) || new Date().toISOString(),
    updatedAt: (raw.updatedAt as string) || new Date().toISOString(),
    completedAt: (raw.completedAt as string) || undefined,
  }
}

/** Read standalone tasks from config/tasks.json */
export function readStandaloneTasks(): Task[] {
  try {
    if (!existsSync(TASKS_FILE)) return []
    const data = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'))
    return (data.tasks || []).map((t: Record<string, unknown>) => normalizeTask(t))
  } catch {
    return []
  }
}

/** Write standalone tasks to config/tasks.json */
export function writeStandaloneTasks(tasks: Task[]) {
  const dir = join(PROJECT_ROOT, 'config')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(TASKS_FILE, JSON.stringify({ tasks, lastUpdated: new Date().toISOString() }, null, 2) + '\n')
}

/** Read project meta */
export function readProjectMeta(projectId: string): Record<string, unknown> | null {
  // Support nested project IDs like "dept/project"
  const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
  if (!existsSync(metaPath)) return null
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8'))
  } catch {
    return null
  }
}

/** Write project meta */
export function writeProjectMeta(projectId: string, meta: Record<string, unknown>) {
  const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
}

/** Read all project tasks */
export function readProjectTasks(): Task[] {
  const tasks: Task[] = []
  try {
    if (!existsSync(PROJECTS_DIR)) return tasks
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      // Top-level project
      const metaPath = join(PROJECTS_DIR, dir.name, '.project-meta.json')
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
          for (const t of (meta.tasks || []) as Record<string, unknown>[]) {
            tasks.push(normalizeTask(t, dir.name))
          }
        } catch { /* skip */ }
      }
      // Sub-projects
      try {
        const subDirs = readdirSync(join(PROJECTS_DIR, dir.name), { withFileTypes: true })
          .filter(sd => sd.isDirectory() && !sd.name.startsWith('.'))
        for (const sd of subDirs) {
          const subMetaPath = join(PROJECTS_DIR, dir.name, sd.name, '.project-meta.json')
          if (existsSync(subMetaPath)) {
            const subId = `${dir.name}/${sd.name}`
            try {
              const meta = JSON.parse(readFileSync(subMetaPath, 'utf-8'))
              for (const t of (meta.tasks || []) as Record<string, unknown>[]) {
                tasks.push(normalizeTask(t, subId))
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return tasks
}

/** Find all tasks (standalone + project) */
export function findAllTasks(): Task[] {
  return [...readProjectTasks(), ...readStandaloneTasks()]
}

/** Find a task by ID, returns task and its source */
export function findTaskById(taskId: string): { task: Task; source: 'standalone' | string } | null {
  // Check standalone
  const standalone = readStandaloneTasks()
  const st = standalone.find(t => t.id === taskId)
  if (st) return { task: st, source: 'standalone' }

  // Check project tasks
  const projectTasks = readProjectTasks()
  const pt = projectTasks.find(t => t.id === taskId)
  if (pt && pt.projectId) return { task: pt, source: pt.projectId }

  return null
}

/** Update a task in a project's .project-meta.json */
export function updateProjectTask(projectId: string, taskId: string, updates: Partial<Task>): boolean {
  const meta = readProjectMeta(projectId)
  if (!meta) return false
  const tasks = (meta.tasks || []) as Record<string, unknown>[]
  const idx = tasks.findIndex(t => t.id === taskId)
  if (idx === -1) return false
  const merged = { ...tasks[idx], ...updates, updatedAt: new Date().toISOString() }
  if (updates.assignees && updates.assignees.length > 0) {
    merged.assignedAgent = updates.assignees[0]
  }
  if ((merged as Record<string, unknown>).status === 'in_progress') {
    (merged as Record<string, unknown>).status = 'running'
  }
  tasks[idx] = merged
  meta.tasks = tasks
  writeProjectMeta(projectId, meta)
  return true
}

/** Delete a task from a project's .project-meta.json */
export function deleteProjectTask(projectId: string, taskId: string): boolean {
  const meta = readProjectMeta(projectId)
  if (!meta) return false
  const tasks = (meta.tasks || []) as Record<string, unknown>[]
  const idx = tasks.findIndex(t => t.id === taskId)
  if (idx === -1) return false
  tasks.splice(idx, 1)
  meta.tasks = tasks
  writeProjectMeta(projectId, meta)
  return true
}

/** Update a task in-place (finds it wherever it is) */
export function updateTaskInPlace(taskId: string, updates: Partial<Task>): Task | null {
  // Try standalone
  const standalone = readStandaloneTasks()
  const sIdx = standalone.findIndex(t => t.id === taskId)
  if (sIdx !== -1) {
    const merged = { ...standalone[sIdx], ...updates, updatedAt: new Date().toISOString() }
    if (updates.assignees) merged.assignedAgent = updates.assignees[0] || undefined
    standalone[sIdx] = merged
    writeStandaloneTasks(standalone)
    return merged
  }

  // Try project tasks
  const projectTasks = readProjectTasks()
  const pt = projectTasks.find(t => t.id === taskId)
  if (pt && pt.projectId) {
    const success = updateProjectTask(pt.projectId, taskId, updates)
    if (success) return { ...pt, ...updates, updatedAt: new Date().toISOString() } as Task
  }

  return null
}
