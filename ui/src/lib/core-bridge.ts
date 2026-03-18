/**
 * core-bridge.ts — CJS↔TS 桥接层
 *
 * Next.js API 路由运行在 Node.js 服务端，可直接 require() CJS 模块。
 * 此文件是 UI 层访问 core/ 的唯一入口。
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { Task, PipelineStep } from '@entity/task'
import type { DepartmentConfig, DepartmentLoopState, TaskTypeDefinition } from '@entity/dept'
import type { OpenClawConfig, GatewayConfig } from '@entity/config'
import type { AutopilotState } from '@entity/autopilot'
import type { CompanyBudget, CostEntry, DailyCostSummary } from '@entity/observe'
import type { AgentMeta } from '@entity/agent'
import type { ProjectMeta } from '@entity/project'

const _path = require('path')
const _corePath = _path.resolve(process.cwd(), '..', 'core', 'index.cjs')
// 使用 createRequire 绕过 webpack 静态分析（webpack 不会改写 module.createRequire 产生的 require）
const { createRequire } = require('module')
const _nativeRequire = createRequire(__filename)
const _core = _nativeRequire(_corePath)

export default _core as {
  repo: {
    taskRepo: {
      normalizeTask(raw: Record<string, unknown>, projectId?: string): Task
      readStandaloneTasks(): Task[]
      writeStandaloneTasks(tasks: Task[]): void
      readProjectMeta(projectId: string): ProjectMeta | null
      writeProjectMeta(projectId: string, meta: ProjectMeta): void
      readProjectsWithTasks(): ProjectMeta[]
      readProjectTasks(): Task[]
      findAllTasks(): Task[]
      findTaskById(taskId: string): { task: Task; source: string } | null
      updateProjectTask(projectId: string, taskId: string, updates: Partial<Task>): boolean
      deleteProjectTask(projectId: string, taskId: string): boolean
      updateTaskInPlace(taskId: string, updates: Partial<Task>): Task | null
    }
    configRepo: {
      getConfig(): OpenClawConfig
      updateConfig(mutator: (config: OpenClawConfig) => OpenClawConfig): OpenClawConfig
      getGatewayConfig(): GatewayConfig
      addAgent(agentId: string, workspaceDir: string, model?: string): void
      removeAgent(agentId: string): void
    }
    deptConfigRepo: {
      load(deptId: string): DepartmentConfig | null
      save(deptId: string, config: DepartmentConfig): void
      updateConfig(deptId: string, mutator: (config: DepartmentConfig) => DepartmentConfig): void
    }
    deptStateRepo: {
      load(deptId: string): DepartmentLoopState
      save(deptId: string, state: DepartmentLoopState): void
    }
    agentMetaRepo: {
      load(agentId: string): AgentMeta | null
      save(agentId: string, meta: AgentMeta): void
    }
    missionRepo: {
      readMission(): string
      readBaseMission(): string
      readDeptMission(deptId: string): string
      writeMission(content: string): void
      writeBaseMission(content: string): void
      writeDeptMission(deptId: string, content: string): void
    }
    projectMetaRepo: {
      readMeta(projectId: string): ProjectMeta | null
      writeMeta(projectId: string, meta: ProjectMeta): void
      updateMeta(projectId: string, mutator: (meta: ProjectMeta) => ProjectMeta): ProjectMeta
      readAll(): Array<{ projectId: string; meta: ProjectMeta }>
      deleteProject(projectId: string): void
    }
    readTemplate(id: string): { id: string; name: string; description: string; emoji: string; category: string; group?: string; hidden?: boolean; hasIdentityFiles: boolean; defaults: { model: string; skills: string[]; peers: string[] } } | null
    getTemplateDir(id: string): string | null
    readTemplateFile(tmplDir: string, filename: string): string | null
  }
  task: {
    checkQualityGate(task: Task, pipelineStep: PipelineStep | null): {
      passed: boolean; errors: string[]; shouldRework: boolean; escalate: boolean
    }
    createPipelineTask(completedTask: Task, pipelineStep: PipelineStep | null, taskTypes?: TaskTypeDefinition[]): Task | null
    createReworkTask(task: Task, errors: string[]): Task
  }
  observe: {
    getBudgetSummary(): {
      company: { dailyLimit: number; used: number; ratio: number }
      departments: Record<string, { limit: number; used: number; ratio: number }>
    }
    loadCompanyBudget(): CompanyBudget
    saveCompanyBudget(config: CompanyBudget): void
    queryCosts(opts?: { date?: string; from?: string; to?: string; source?: string }): {
      entries: CostEntry[]
      totalCost: number
      totalInputTokens: number
      totalOutputTokens: number
    }
    getDailySummary(days?: number): DailyCostSummary[]
  }
  common: {
    loadState(): AutopilotState
    saveState(state: AutopilotState): void
    validateBudgetConfig(config: unknown): { valid: boolean; errors: string[] }
    agentService: {
      createAgent(body: Record<string, unknown>, hooks?: Record<string, Function>): Promise<{ ok: boolean; id?: string; deployed?: boolean; restarted?: boolean; hasIdentityFiles?: boolean; error?: string; status?: number }>
      updateAgent(body: Record<string, unknown>, hooks?: Record<string, Function>): Promise<{ ok: boolean; error?: string; status?: number }>
      deleteAgent(id: string): Promise<{ ok: boolean; archivedTo: string | null }>
    }
  }
}
