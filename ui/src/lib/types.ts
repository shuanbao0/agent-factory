/**
 * Backward-compatible re-export shim.
 * All types now live in the entity/ module (single source of truth).
 * Existing imports from '@/lib/types' continue to work.
 */

// agent
export type { Agent, AgentTemplate, AgentRole, AgentMeta, AgentConfigEntry } from '@entity/agent'

// task
export type { Task, TaskQuality, TaskStatus } from '@entity/task'
export { STATUSES, TRANSITIONS, TERMINAL, canTransition, getValidTransitions,
         isTerminal, isValidStatus, normalizeStatus } from '@entity/task'
export type { GateStage } from '@entity/task'
export type { QualityGateConfig, PipelineStep } from '@entity/task'

// dept
export type { Department, DepartmentConfig, DepartmentWorkflow, DepartmentLoopState,
             DepartmentFurnitureItem, PhaseDefinition, TaskTypeDefinition,
             DepartmentTemplate } from '@entity/dept'
export { DEFAULT_DEPT_STATE } from '@entity/dept'

// config
export type { OpenClawConfig, OpenClawModelEntry, OpenClawProviderConfig, GatewayConfig } from '@entity/config'

// autopilot
export type { AutopilotState, DeptInfo } from '@entity/autopilot'
export { DEFAULT_AUTOPILOT_STATE, DEFAULT_INTERVAL_SEC } from '@entity/autopilot'

// observe
export type { CompanyBudget, BudgetSummary, CostEntry, CostQueryResult, DailyCostSummary } from '@entity/observe'
export { DEFAULT_BUDGET, PRICING } from '@entity/observe'

// project
export type { Project, ProjectMeta } from '@entity/project'

// ui
export type { Skill, LogEntry, TimelineMessage, Channel } from '@entity/ui'
