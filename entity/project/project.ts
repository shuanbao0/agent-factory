/**
 * Project entity — project and project metadata types.
 */
import type { Task } from '../task/task'
import type { PhaseDefinition } from '../dept/dept'

export interface Project {
  id: string
  name: string
  description: string
  status: 'planning' | 'in-progress' | 'completed' | 'paused'
  currentPhase: number
  totalPhases: number
  tasks: Task[]
  createdAt: string
  tokensUsed: number
  phases?: PhaseDefinition[]
  department?: string
}

export interface ProjectMeta {
  id?: string
  name?: string
  description?: string
  department?: string
  status?: string
  currentPhase?: number
  totalPhases?: number
  tasks?: Task[]
  createdAt?: string
  [key: string]: unknown
}
