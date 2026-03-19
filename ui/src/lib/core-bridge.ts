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
      readTaskOutput(task: Task): string | null
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
      listDeptIds(): string[]
    }
    deptStateRepo: {
      load(deptId: string): DepartmentLoopState
      save(deptId: string, state: DepartmentLoopState): void
    }
    agentMetaRepo: {
      readMeta(agentId: string): AgentMeta | null
      writeMeta(agentId: string, meta: AgentMeta): void
      updateMeta(agentId: string, mutator: (meta: AgentMeta) => AgentMeta): AgentMeta
      listAllAgentIds(): string[]
      exists(agentId: string): boolean
      readAgentFile(agentId: string, filename: string): string | null
      writeAgentFile(agentId: string, filename: string, content: string): void
      ensureAgentDir(agentId: string, subpath?: string): void
      appendAgentFile(agentId: string, filename: string, content: string): void
      agentFileExists(agentId: string, filename: string): boolean
      agentFileStat(agentId: string, filename: string): { size: number; mtimeMs: number } | null
      listAgentDir(agentId: string, subpath?: string): Array<{ name: string; isFile: boolean; mtime: number }>
      deleteAgentDir(agentId: string): void
      listAgentsByDepartment(deptId: string): string[]
      clearDepartment(deptId: string): number
    }
    missionRepo: {
      readMission(): string
      readBaseMission(): string
      readDeptMission(deptId: string): string
      writeMission(content: string): void
      writeBaseMission(content: string): void
      writeDeptMission(deptId: string, content: string): void
      readDeptReport(deptId: string): string
      readDeptDirectives(deptId: string): string[]
      writeDeptDirectives(deptId: string, directives: string[]): void
      writeDeptReport(deptId: string, content: string): void
    }
    deptRegistryRepo: {
      readAll(): Array<{ id: string; name: string; nameEn: string; emoji: string; order: number; floorColor: Record<string, number>; furniture: Array<{ type: string; count: number }> }>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeAll(departments: any[]): void
    }
    projectMetaRepo: {
      readMeta(projectId: string): ProjectMeta | null
      writeMeta(projectId: string, meta: ProjectMeta): void
      updateMeta(projectId: string, mutator: (meta: ProjectMeta) => ProjectMeta): ProjectMeta
      readAll(): Array<{ projectId: string; meta: ProjectMeta }>
      deleteProject(projectId: string): void
      ensureProjectDirs(projectId: string, subdirs: string[]): void
      writeProjectFile(projectId: string, filename: string, content: string): void
      listProjectIds(): string[]
    }
    sessionRepo: {
      fetchSessionTokens(): { all: number; byAgent: Record<string, number> }
      listStaleSessions(maxDays?: number): Array<{ agentId: string; sessionKey: string; updatedAt: number }>
    }
    modelsRepo: {
      readModels(): { providers: Record<string, { apiKey: string; baseUrl?: string; api?: string; models: Record<string, string> }>; default: string }
      writeModels(config: Record<string, unknown>): void
      ensureDefaults(): void
    }
    authProfilesRepo: {
      readProfiles(): { version: number; profiles: Record<string, { type: string; provider: string; token?: string; email?: string; expiresAt?: number }>; lastGood: Record<string, string>; usageStats: Record<string, unknown> } | null
      writeProfiles(data: Record<string, unknown>): void
      updateProfiles(mutator: (data: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown>
    }
    readTemplate(id: string): { id: string; name: string; description: string; emoji: string; category: string; group?: string; hidden?: boolean; hasIdentityFiles: boolean; defaults: { model: string; skills: string[]; peers: string[] } } | null
    getTemplateDir(id: string): string | null
    readTemplateFile(tmplDir: string, filename: string): string | null
    listTemplates(): Array<{ id: string; name: string; description: string; emoji: string; category: string; group?: string; hidden?: boolean; hasIdentityFiles: boolean; defaults: { model: string; skills: string[]; peers: string[] } }>
    createCustomTemplate(id: string, data: Record<string, unknown>): void
  }
  task: {
    checkQualityGate(task: Task, pipelineStep: PipelineStep | null): {
      passed: boolean; errors: string[]; shouldRework: boolean; escalate: boolean
    }
    createPipelineTask(completedTask: Task, pipelineStep: PipelineStep | null, taskTypes?: TaskTypeDefinition[]): Task | null
    createReworkTask(task: Task, errors: string[]): Task
    deleteBatch(statuses: string[], olderThanDays?: number): { deleted: number }
    cleanupReworks(): { deletedDuplicates: number; closedOrphans: number; total: number }
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
    reactors: {
      registerAll(bus: unknown, opts?: Record<string, unknown>): void
      getAlerts(): Array<{ id: string; type: string; severity: string; ts: string; data: Record<string, unknown> }>
      dismissAlert(alertId: string): void
    }
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
    departmentService: {
      createDepartment(body: Record<string, unknown>): { ok: boolean; id?: string; error?: string; status?: number }
      updateDepartment(id: string, updates: Record<string, unknown>): { ok: boolean; error?: string; status?: number }
      deleteDepartment(id: string): { ok: boolean; clearedAgents?: number; error?: string; status?: number }
    }
    projectService: {
      listProjects(): Array<Record<string, unknown>>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createProject(body: Record<string, unknown>, workflow: any): { ok: boolean; project?: Record<string, unknown>; error?: string; status?: number }
    }
    fileBrowser: {
      listDirectory(baseDir: string, subDir: string): Record<string, unknown>
      getFileContent(baseDir: string, filePath: string, maxSize?: number): Record<string, unknown>
      listAgentWorkspaces(workspacesDir: string, agentIds: string[]): Array<{ agentId: string; fileCount: number; totalSize: number }>
      countDirStats(dir: string, maxDepth?: number): { count: number; size: number }
      ensureWorkspace(agentId: string): void
      archiveWorkspace(agentId: string): string | null
      deleteArchive(dirName: string): void
      listWorkspaces(): Array<{ agentId: string; fileCount: number; totalSize: number }>
      listArchivedWorkspaces(): Array<{ dirName: string; agentId: string; archivedAt: string; fileCount: number; totalSize: number }>
      readWorkspaceFile(agentId: string, filePath: string): { content: string; size?: number } | { error: string }
      writeWorkspaceFile(agentId: string, filePath: string, content: string): void
      pathExists(fullPath: string): boolean
      realPath(fullPath: string): string | null
      copyFile(src: string, dst: string): void
      deleteDir(dir: string): void
    }
    validateAgentId(id: string): { valid: boolean; error?: string }
    validateTaskStatus(status: string): boolean
    sanitizePath(p: string): string | null
    parseSkillMeta(content: string): { name: string; description: string; bins: string[] }
    generateToolsMd(agentId: string, skills: string[], agentDir: string): string
    envManager: {
      readEnv(): Record<string, string>
      writeEnv(vars: Record<string, string>): void
      hasEnvFile(): boolean
    }
    modelsService: {
      resolveEnvVar(value: string, envVars?: Record<string, string>): string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      syncOpenClawConfig(modelsConfig: any, providerDefs?: any[]): void
      getAuthProfilesByProvider(): Record<string, { profileId: string; type: string; hasToken: boolean; tokenPreview: string }>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveAuthMode(providerName: string, providerConfig: any, authProfiles: Record<string, unknown>, envVars: Record<string, string>): { mode: 'setup-token' | 'oauth' | 'env-var' | 'config' | 'none'; detail?: string }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildModelsListForApi(config: any, envVars: Record<string, string>): Array<{ ref: string; provider: string; alias: string; modelId: string; hasApiKey: boolean; baseUrl?: string; isDefault: boolean }>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildProvidersForApi(config: any, authProfiles: Record<string, unknown>, envVars: Record<string, string>): Record<string, unknown>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyMutation(config: any, body: Record<string, unknown>): { ok: boolean; error?: string; status?: number }
    }
    baseRulesInjector: {
      parseBaseRules(raw: string): { agentsRules: string; soulRules: string; reminder: string }
      stripMarkerBlock(content: string, startMarker: string, endMarker: string): string
      injectIntoAgentsMd(content: string, agentsRules: string, reminder: string): string
      injectIntoSoulMd(content: string, soulRules: string): string
      injectBaseRulesForAgent(agentDir: string): void
    }
    skillSymlinks: {
      findBuiltinSkillsDir(): Promise<string | null>
      resolveSkillDir(slug: string): Promise<string | null>
      syncSkillSymlinks(agentId: string, enabledSlugs: string[]): Promise<void>
      listAllSkills(): Promise<Array<{ slug: string; source: string; hasSkillMd: boolean; description: string }>>
    }
    eventRelay: {
      relayEvent(eventType: string, payload: Record<string, unknown>): void
    }
  }
}
