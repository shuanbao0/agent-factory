/**
 * quality-gate.ts — 薄 Facade，委托 core/task 质量门逻辑
 *
 * 保留原有 TS 接口签名，内部走 core-bridge。
 * UI 层的 checkQualityGate(task, workflow) 做 pipeline step 查找后委托 core/。
 */
import core from '@/lib/core-bridge'
import type { Task, DepartmentWorkflow } from './types'
import { readProjectMeta } from './task-storage'
import { getDepartmentWorkflow } from './department-workflow'

export interface QualityGateResult {
  passed: boolean
  errors: string[]
  shouldRework: boolean
  escalate: boolean
}

/** Get the workflow for a task based on its project's department */
export function getWorkflowForTask(task: Task): DepartmentWorkflow {
  if (!task.projectId) return getDepartmentWorkflow()
  const meta = readProjectMeta(task.projectId)
  if (!meta) return getDepartmentWorkflow()
  const dept = (meta.department as string) || undefined
  return getDepartmentWorkflow(dept)
}

/** Check quality gate for a completed task */
export function checkQualityGate(task: Task, workflow: DepartmentWorkflow): QualityGateResult {
  if (!task.type) return { passed: true, errors: [], shouldRework: false, escalate: false }
  const step = workflow.pipeline.find(p => p.from === task.type) || null
  return core.task.checkQualityGate(task as unknown as Record<string, unknown>, step as unknown as Record<string, unknown> | null)
}

/** Create pipeline follow-up task when a task completes and passes quality gate */
export function createPipelineTask(completedTask: Task, workflow: DepartmentWorkflow): Task | null {
  if (!completedTask.type || !completedTask.projectId) return null
  const step = workflow.pipeline.find(p => p.from === completedTask.type) || null
  return core.task.createPipelineTask(
    completedTask as unknown as Record<string, unknown>,
    step as Record<string, unknown> | null,
    workflow.taskTypes as unknown as Record<string, unknown>[],
  ) as Task | null
}

/** Create a rework task from a failed quality gate */
export function createReworkTask(task: Task, errors: string[]): Task {
  return core.task.createReworkTask(task as unknown as Record<string, unknown>, errors) as unknown as Task
}

/** Persist a new task to the correct storage location */
export function persistNewTask(task: Task): void {
  if (task.projectId) {
    const meta = readProjectMeta(task.projectId)
    if (meta) {
      if (!meta.tasks) meta.tasks = [];
      (meta.tasks as Record<string, unknown>[]).push({ ...task })
      core.repo.taskRepo.writeProjectMeta(task.projectId, meta)
      return
    }
    console.warn(`[persistNewTask] Project "${task.projectId}" not found, saving as standalone task`)
  }
  const tasks = core.repo.taskRepo.readStandaloneTasks()
  tasks.push({ ...task })
  core.repo.taskRepo.writeStandaloneTasks(tasks)
}
