import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import {
  readStandaloneTasks,
  writeStandaloneTasks,
  readProjectMeta,
  writeProjectMeta,
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
