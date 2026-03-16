/**
 * task-storage.ts — 薄 Facade，委托 core/repo/taskRepo
 *
 * 保留原有 TS 类型签名，内部全部走 core-bridge。
 */
import core from '@/lib/core-bridge'
import type { Task } from '@entity/task'
import type { ProjectMeta } from '@entity/project'

const taskRepo = core.repo.taskRepo

export function normalizeTask(raw: Record<string, unknown>, projectId?: string): Task {
  return taskRepo.normalizeTask(raw, projectId)
}

export function readStandaloneTasks(): Task[] {
  return taskRepo.readStandaloneTasks()
}

export function writeStandaloneTasks(tasks: Task[]) {
  taskRepo.writeStandaloneTasks(tasks)
}

export function readProjectMeta(projectId: string): ProjectMeta | null {
  return taskRepo.readProjectMeta(projectId)
}

export function writeProjectMeta(projectId: string, meta: ProjectMeta) {
  taskRepo.writeProjectMeta(projectId, meta)
}

export function readProjectTasks(): Task[] {
  return taskRepo.readProjectTasks()
}

export function findAllTasks(): Task[] {
  return taskRepo.findAllTasks()
}

export function findTaskById(taskId: string): { task: Task; source: 'standalone' | string } | null {
  return taskRepo.findTaskById(taskId) as { task: Task; source: 'standalone' | string } | null
}

export function updateProjectTask(projectId: string, taskId: string, updates: Partial<Task>): boolean {
  return taskRepo.updateProjectTask(projectId, taskId, updates)
}

export function deleteProjectTask(projectId: string, taskId: string): boolean {
  return taskRepo.deleteProjectTask(projectId, taskId)
}

export function updateTaskInPlace(taskId: string, updates: Partial<Task>): Task | null {
  return taskRepo.updateTaskInPlace(taskId, updates)
}
