import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import {
  findAllTasks,
  readStandaloneTasks,
  writeStandaloneTasks,
  readProjectMeta,
  writeProjectMeta,
  updateTaskInPlace,
  deleteProjectTask,
} from '@/lib/task-storage'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

// ── DELETE /api/tasks/batch ─────────────────────────────────────
// Body: { statuses: string[], olderThanDays?: number }

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { statuses, olderThanDays } = body as { statuses: string[]; olderThanDays?: number }

    if (!Array.isArray(statuses) || statuses.length === 0) {
      return NextResponse.json({ error: 'statuses array required' }, { status: 400 })
    }

    const statusSet = new Set(statuses)
    const cutoff = olderThanDays != null
      ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
      : null

    const shouldRemove = (task: Record<string, unknown>): boolean => {
      if (!statusSet.has(task.status as string)) return false
      if (cutoff != null) {
        const updatedAt = new Date(task.updatedAt as string).getTime()
        if (updatedAt > cutoff) return false
      }
      return true
    }

    let deleted = 0

    // 1. Standalone tasks
    const standalone = readStandaloneTasks()
    const kept = standalone.filter(t => !shouldRemove(t as unknown as Record<string, unknown>))
    deleted += standalone.length - kept.length
    if (kept.length !== standalone.length) {
      writeStandaloneTasks(kept)
    }

    // 2. Project tasks
    if (existsSync(PROJECTS_DIR)) {
      const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
      for (const dir of dirs) {
        // Top-level project
        deleted += filterProjectTasks(dir.name, shouldRemove)
        // Sub-projects
        try {
          const subDirs = readdirSync(join(PROJECTS_DIR, dir.name), { withFileTypes: true })
            .filter(sd => sd.isDirectory() && !sd.name.startsWith('.'))
          for (const sd of subDirs) {
            deleted += filterProjectTasks(`${dir.name}/${sd.name}`, shouldRemove)
          }
        } catch { /* skip */ }
      }
    }

    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── POST /api/tasks/batch ─────────────────────────────────────
// Body: { action: 'cleanup' }
// Cleans up:
// 1. Duplicate rework tasks: same reworkFromId → keep only newest
// 2. Orphan rework tasks: parent already completed/failed but rework still pending

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body as { action: string }

    if (action !== 'cleanup') {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    const allTasks = findAllTasks()
    let deletedDuplicates = 0
    let closedOrphans = 0

    // 1. Deduplicate rework tasks: group by reworkFromId, keep newest
    const reworkGroups = new Map<string, typeof allTasks>()
    for (const t of allTasks) {
      if (!t.reworkFromId) continue
      const group = reworkGroups.get(t.reworkFromId) || []
      group.push(t)
      reworkGroups.set(t.reworkFromId, group)
    }

    reworkGroups.forEach((group) => {
      if (group.length <= 1) return
      // Sort by createdAt descending, keep the newest
      group.sort((a: { createdAt?: string }, b: { createdAt?: string }) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      for (let i = 1; i < group.length; i++) {
        const task = group[i]
        // Only delete if not completed/failed (don't touch finished work)
        if (['pending', 'assigned', 'in_progress', 'rework', 'review'].includes(task.status)) {
          deleteTask(task)
          deletedDuplicates++
        }
      }
    })

    // 2. Close orphan rework tasks: parent is terminal but rework is still active
    const freshTasks = findAllTasks() // re-read after deletions
    for (const t of freshTasks) {
      if (!t.reworkFromId) continue
      if (!['pending', 'assigned', 'in_progress', 'rework', 'review'].includes(t.status)) continue

      const parent = freshTasks.find(p => p.id === t.reworkFromId)
      if (parent && ['completed', 'failed'].includes(parent.status)) {
        updateTaskInPlace(t.id, {
          status: 'failed',
          output: `Closed: parent task ${t.reworkFromId} already ${parent.status}`,
        })
        closedOrphans++
      }
    }

    return NextResponse.json({
      ok: true,
      deletedDuplicates,
      closedOrphans,
      total: deletedDuplicates + closedOrphans,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** Delete a task from wherever it lives (standalone or project) */
function deleteTask(task: { id: string; projectId?: string | null }) {
  if (task.projectId) {
    deleteProjectTask(task.projectId, task.id)
  } else {
    const standalone = readStandaloneTasks()
    const filtered = standalone.filter(t => t.id !== task.id)
    if (filtered.length !== standalone.length) {
      writeStandaloneTasks(filtered)
    }
  }
}

function filterProjectTasks(
  projectId: string,
  shouldRemove: (t: Record<string, unknown>) => boolean
): number {
  const meta = readProjectMeta(projectId)
  if (!meta || !Array.isArray(meta.tasks)) return 0
  const tasks = meta.tasks as Record<string, unknown>[]
  const kept = tasks.filter(t => !shouldRemove(t))
  const removed = tasks.length - kept.length
  if (removed > 0) {
    meta.tasks = kept
    writeProjectMeta(projectId, meta)
  }
  return removed
}
