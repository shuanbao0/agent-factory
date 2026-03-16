/**
 * task-storage.ts — 薄 Facade，委托 core/repo/taskRepo
 *
 * 保留原有 TS 类型签名，内部全部走 core-bridge。
 */
import core from '@/lib/core-bridge'
import type { Task } from './types'

const taskRepo = core.repo.taskRepo

export function normalizeTask(raw: Record<string, unknown>, projectId?: string): Task {
  return taskRepo.normalizeTask(raw, projectId) as unknown as Task
}

export function readStandaloneTasks(): Task[] {
  return taskRepo.readStandaloneTasks() as unknown as Task[]
}

export function writeStandaloneTasks(tasks: Task[]) {
  taskRepo.writeStandaloneTasks(tasks as unknown as Record<string, unknown>[])
}

export function readProjectMeta(projectId: string): Record<string, unknown> | null {
  return taskRepo.readProjectMeta(projectId)
}

export function writeProjectMeta(projectId: string, meta: Record<string, unknown>) {
  taskRepo.writeProjectMeta(projectId, meta)
}

export function readProjectTasks(): Task[] {
  return taskRepo.readProjectTasks() as unknown as Task[]
}

export function findAllTasks(): Task[] {
  return taskRepo.findAllTasks() as unknown as Task[]
}

export function findTaskById(taskId: string): { task: Task; source: 'standalone' | string } | null {
  return taskRepo.findTaskById(taskId) as unknown as { task: Task; source: 'standalone' | string } | null
}

export function updateProjectTask(projectId: string, taskId: string, updates: Partial<Task>): boolean {
  return taskRepo.updateProjectTask(projectId, taskId, updates as unknown as Record<string, unknown>)
}

export function deleteProjectTask(projectId: string, taskId: string): boolean {
  return taskRepo.deleteProjectTask(projectId, taskId)
}

export function updateTaskInPlace(taskId: string, updates: Partial<Task>): Task | null {
  return taskRepo.updateTaskInPlace(taskId, updates as unknown as Record<string, unknown>) as unknown as Task | null
}
