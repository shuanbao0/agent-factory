/**
 * Bridge: import CJS shared modules into Next.js TypeScript.
 * All shared/*.cjs modules are accessed through this single entry point.
 */
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// --- Repository ---

const baseRepoMod = require('../../../shared/base-repository.cjs')
const configRepoMod = require('../../../shared/config-repository.cjs')
const projectMetaRepoMod = require('../../../shared/project-meta-repository.cjs')
const agentMetaRepoMod = require('../../../shared/agent-meta-repository.cjs')
const deptConfigRepoMod = require('../../../shared/dept-config-repository.cjs')

export const BaseRepository = baseRepoMod.BaseRepository as new (opts?: { cacheTtlMs?: number }) => {
  read(filePath: string): Record<string, unknown> | null
  write(filePath: string, data: unknown): void
  update(
    filePath: string,
    mutator: (data: Record<string, unknown>) => Record<string, unknown>,
    defaultValue?: Record<string, unknown>
  ): Record<string, unknown>
  invalidate(filePath?: string): void
}

export const ConfigRepository = configRepoMod.ConfigRepository as new (opts?: { cacheTtlMs?: number }) => {
  getConfig(): Record<string, unknown>
  updateConfig(mutator: (config: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown>
  getGatewayConfig(): { port: number; token: string }
  addAgent(agentId: string, workspaceDir: string, model?: string): void
  removeAgent(agentId: string): void
  read(filePath: string): Record<string, unknown> | null
  write(filePath: string, data: unknown): void
}
export const configRepo = configRepoMod.configRepo

export const ProjectMetaRepository = projectMetaRepoMod.ProjectMetaRepository
export const projectMetaRepo = projectMetaRepoMod.projectMetaRepo

export const AgentMetaRepository = agentMetaRepoMod.AgentMetaRepository
export const agentMetaRepo = agentMetaRepoMod.agentMetaRepo

export const DeptConfigRepository = deptConfigRepoMod.DeptConfigRepository
export const deptConfigRepo = deptConfigRepoMod.deptConfigRepo
export const deptConfigRepoNoCache = deptConfigRepoMod.deptConfigRepoNoCache

// --- State Machine ---

const stateMachineMod = require('../../../shared/task-state-machine.cjs')
export const canTransition: (from: string, to: string) => boolean = stateMachineMod.canTransition
export const getValidTransitions: (from: string) => string[] = stateMachineMod.getValidTransitions
export const isTerminal: (status: string) => boolean = stateMachineMod.isTerminal
export const normalizeStatus: (status: string) => string = stateMachineMod.normalizeStatus
export const transition = stateMachineMod.transition as (
  task: Record<string, unknown>,
  to: string,
  context?: { actor?: string; reason?: string; extras?: Record<string, unknown>; recordHistory?: boolean }
) => { ok: boolean; task?: Record<string, unknown>; error?: string; reason?: string }

// --- Services ---

const agentServiceMod = require('../../../shared/agent-service.cjs')
export const AgentService = agentServiceMod.AgentService as new (
  configRepo?: InstanceType<typeof ConfigRepository>,
  agentMetaRepo?: InstanceType<typeof AgentMetaRepository>
) => {
  _configRepo: InstanceType<typeof ConfigRepository>
  _agentMetaRepo: InstanceType<typeof AgentMetaRepository>
  deleteAgent(id: string): Promise<{ ok: boolean; archivedTo: string | null }>
}

// --- Validators ---

const validatorsMod = require('../../../shared/validators.cjs')
export const validateAgentId: (id: string) => { valid: boolean; error?: string } = validatorsMod.validateAgentId
export const validateTaskStatus: (status: string) => boolean = validatorsMod.validateTaskStatus
export const sanitizePath: (p: string) => string | null = validatorsMod.sanitizePath

// --- Task Strategy ---

const taskStrategyMod = require('../../../shared/task-strategy.cjs')

export interface TaskStrategy {
  idleThresholdMins: number
  staleThresholdMins: number
  minPassingScore: number
  preferredReviewers: string[]
  reviewCriteria?: string
}

export const getStrategy: (taskType?: string, deptConfig?: Record<string, unknown>) => TaskStrategy = taskStrategyMod.getStrategy
export const BUILTIN_STRATEGIES: Record<string, TaskStrategy> = taskStrategyMod.BUILTIN_STRATEGIES
