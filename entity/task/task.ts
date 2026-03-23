/**
 * Task entity — statuses, transitions, predicates, and type definitions.
 * Single source of truth for task lifecycle constants.
 */

export const STATUSES = ['pending', 'assigned', 'in_progress', 'review', 'completed', 'failed', 'rework'] as const
export type TaskStatus = typeof STATUSES[number]

export const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending:     ['assigned', 'in_progress', 'completed', 'failed'],
  assigned:    ['in_progress', 'completed', 'failed'],
  in_progress: ['review', 'completed', 'rework', 'failed'],
  review:      ['completed', 'rework', 'in_progress', 'failed'],
  rework:      ['in_progress', 'review', 'completed', 'failed'],
  completed:   [],
  failed:      ['completed'],
}

export const TERMINAL: ReadonlySet<TaskStatus> = new Set(['completed', 'failed'] as const)

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from as TaskStatus]
  if (!allowed) return false
  return allowed.includes(to as TaskStatus)
}

export function getValidTransitions(from: string): readonly string[] {
  return TRANSITIONS[from as TaskStatus] || []
}

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status as TaskStatus)
}

export function isValidStatus(status: string): boolean {
  return (STATUSES as readonly string[]).includes(status)
}

export function normalizeStatus(status: string): string {
  if (status === 'running') return 'in_progress'
  return status
}

export interface TaskQuality {
  selfCheck?: {
    passed: boolean
    score: number
    checklist: string[]
    at: string
  }
  peerReview?: {
    reviewer: string
    passed: boolean
    score: number
    comments: string
    at: string
  }
  headApproval?: {
    approver: string
    passed: boolean
    at: string
  }
}

export interface Task {
  id: string
  name: string
  description?: string
  projectId?: string | null
  phase?: number
  status: TaskStatus
  priority: 'P0' | 'P1' | 'P2'
  assignees: string[]
  assignedAgent?: string
  creator: 'user' | string
  progress: number
  dependencies: string[]
  output?: string
  tags?: string[]
  type?: string
  parentTaskId?: string
  quality?: TaskQuality
  reworkCount?: number
  reworkFromId?: string
  validationErrors?: string[]
  failureReason?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}
