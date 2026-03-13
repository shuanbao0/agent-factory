import type { Task, DepartmentWorkflow, QualityGateConfig } from './types'
import {
  readProjectMeta,
  writeProjectMeta,
  readStandaloneTasks,
  writeStandaloneTasks,
} from './task-storage'
import { getDepartmentWorkflow } from './department-workflow'

export interface QualityGateResult {
  passed: boolean
  errors: string[]
  shouldRework: boolean
  escalate: boolean
}

const DEFAULT_GATE: Required<Pick<QualityGateConfig, 'minScore' | 'requireSelfCheck' | 'maxReworks'>> = {
  minScore: 75,
  requireSelfCheck: true,
  maxReworks: 3,
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
  const result: QualityGateResult = { passed: true, errors: [], shouldRework: false, escalate: false }

  if (!task.type) return result

  const step = workflow.pipeline.find(p => p.from === task.type)
  if (!step) return result

  const gateConfig = step.qualityGate
  // Backward compat: no qualityGate config AND no quality data → pass through
  if (!gateConfig && !task.quality) return result

  const gate = {
    minScore: gateConfig?.minScore ?? DEFAULT_GATE.minScore,
    requireSelfCheck: gateConfig?.requireSelfCheck ?? DEFAULT_GATE.requireSelfCheck,
    requirePeerReview: gateConfig?.requirePeerReview ?? false,
    maxReworks: gateConfig?.maxReworks ?? DEFAULT_GATE.maxReworks,
    validators: gateConfig?.validators ?? [],
    validatorConfig: gateConfig?.validatorConfig ?? {},
  }

  // Check selfCheck
  if (gate.requireSelfCheck) {
    if (!task.quality?.selfCheck) {
      result.passed = false
      result.errors.push('Self-check not performed')
    } else if (!task.quality.selfCheck.passed) {
      result.passed = false
      result.errors.push(`Self-check failed (score: ${task.quality.selfCheck.score})`)
    } else if (task.quality.selfCheck.score < gate.minScore) {
      result.passed = false
      result.errors.push(`Self-check score ${task.quality.selfCheck.score} below minimum ${gate.minScore}`)
    }
  }

  // Check peerReview
  if (gate.requirePeerReview) {
    if (!task.quality?.peerReview) {
      result.passed = false
      result.errors.push('Peer review not performed')
    } else if (!task.quality.peerReview.passed) {
      result.passed = false
      result.errors.push('Peer review not passed')
    }
  }

  // Run validators
  for (const v of gate.validators) {
    const vConfig = (gate.validatorConfig[v] ?? {}) as Record<string, unknown>
    const vErrors = runValidator(v, task, vConfig)
    if (vErrors.length > 0) {
      result.passed = false
      result.errors.push(...vErrors)
    }
  }

  if (!result.passed) {
    const reworkCount = task.reworkCount ?? 0
    if (reworkCount >= gate.maxReworks) {
      result.escalate = true
    } else {
      result.shouldRework = true
    }
  }

  return result
}

/** Run a built-in validator */
function runValidator(name: string, task: Task, config: Record<string, unknown>): string[] {
  switch (name) {
    case 'wordCount': {
      const min = (config.min as number) ?? 500
      const len = task.output ? Buffer.byteLength(task.output, 'utf-8') : 0
      if (len < min) {
        return [`Output too short: ${len} bytes (min: ${min})`]
      }
      return []
    }
    case 'endingKeywords': {
      const keywords = (config.keywords as string[]) ?? ['全书完', '大结局', '（完）', 'THE END']
      if (!task.output) return ['No output to check for ending keywords']
      const found = keywords.some(kw => task.output!.includes(kw))
      if (!found) {
        return [`Output missing ending keyword (expected one of: ${keywords.join(', ')})`]
      }
      return []
    }
    case 'noEndingKeywords': {
      const keywords = (config.keywords as string[]) ?? ['全书完', '大结局', '（完）', 'THE END', '完结', '终章']
      if (!task.output) return []
      const found = keywords.filter(kw => task.output!.includes(kw))
      if (found.length > 0) {
        return [`Non-final chapter contains ending keywords: ${found.join(', ')}`]
      }
      return []
    }
    case 'similarity': {
      const maxRepeatRatio = (config.maxRepeatRatio as number) ?? 0.3
      const minBlockSize = (config.minBlockSize as number) ?? 100
      if (!task.output || task.output.length < minBlockSize * 2) return []
      // Split into blocks, check for duplicate blocks
      const blocks: string[] = []
      for (let i = 0; i <= task.output.length - minBlockSize; i += minBlockSize) {
        blocks.push(task.output.slice(i, i + minBlockSize))
      }
      const unique = new Set(blocks)
      const repeatRatio = 1 - unique.size / blocks.length
      if (repeatRatio > maxRepeatRatio) {
        return [`Content repeat ratio ${(repeatRatio * 100).toFixed(0)}% exceeds max ${(maxRepeatRatio * 100).toFixed(0)}%`]
      }
      return []
    }
    default:
      return []
  }
}

/** Create pipeline follow-up task when a task completes and passes quality gate */
export function createPipelineTask(completedTask: Task, workflow: DepartmentWorkflow): Task | null {
  if (!completedTask.type || !completedTask.projectId) return null

  const step = workflow.pipeline.find(p => p.from === completedTask.type)
  if (!step) return null

  const toType = workflow.taskTypes.find(tt => tt.value === step.to)
  const label = toType ? toType.labelEn : step.to

  const now = new Date().toISOString()
  return {
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: `${label}: ${completedTask.name}`,
    description: `Auto-created from pipeline: ${completedTask.type} -> ${step.to}`,
    projectId: completedTask.projectId,
    status: 'pending',
    priority: completedTask.priority,
    assignees: [],
    creator: 'pipeline',
    progress: 0,
    dependencies: [completedTask.id],
    type: step.to,
    parentTaskId: completedTask.parentTaskId,
    createdAt: now,
    updatedAt: now,
  }
}

/** Create a rework task from a failed quality gate */
export function createReworkTask(task: Task, errors: string[]): Task {
  const now = new Date().toISOString()
  return {
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: `[Rework] ${task.name}`,
    description: `Rework required:\n${errors.map(e => `- ${e}`).join('\n')}`,
    projectId: task.projectId ?? null,
    status: 'pending',
    priority: task.priority,
    assignees: [...task.assignees],
    assignedAgent: task.assignedAgent,
    creator: 'quality-gate',
    progress: 0,
    dependencies: [],
    type: task.type,
    parentTaskId: task.parentTaskId,
    reworkCount: (task.reworkCount ?? 0) + 1,
    reworkFromId: task.id,
    createdAt: now,
    updatedAt: now,
  }
}

/** Persist a new task to the correct storage location */
export function persistNewTask(task: Task): void {
  if (task.projectId) {
    const meta = readProjectMeta(task.projectId)
    if (meta) {
      if (!meta.tasks) meta.tasks = [];
      (meta.tasks as Record<string, unknown>[]).push({ ...task })
      writeProjectMeta(task.projectId, meta)
      return
    }
    // Project not found — fallback to standalone to prevent data loss
    console.warn(`[persistNewTask] Project "${task.projectId}" not found, saving as standalone task`)
  }
  const tasks = readStandaloneTasks()
  tasks.push(task)
  writeStandaloneTasks(tasks)
}
