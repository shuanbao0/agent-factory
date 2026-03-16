/**
 * core-bridge.ts — CJS↔TS 桥接层
 *
 * Next.js API 路由运行在 Node.js 服务端，可直接 require() CJS 模块。
 * 此文件是 UI 层访问 core/ 的唯一入口。
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const _path = require('path')
const _corePath = _path.resolve(process.cwd(), '..', 'core')
const _core = require(_corePath)

export default _core as {
  repo: {
    taskRepo: {
      normalizeTask(raw: Record<string, unknown>, projectId?: string): Record<string, unknown>
      readStandaloneTasks(): Record<string, unknown>[]
      writeStandaloneTasks(tasks: Record<string, unknown>[]): void
      readProjectMeta(projectId: string): Record<string, unknown> | null
      writeProjectMeta(projectId: string, meta: Record<string, unknown>): void
      readProjectsWithTasks(): Record<string, unknown>[]
      readProjectTasks(): Record<string, unknown>[]
      findAllTasks(): Record<string, unknown>[]
      findTaskById(taskId: string): { task: Record<string, unknown>; source: string } | null
      updateProjectTask(projectId: string, taskId: string, updates: Record<string, unknown>): boolean
      deleteProjectTask(projectId: string, taskId: string): boolean
      updateTaskInPlace(taskId: string, updates: Record<string, unknown>): Record<string, unknown> | null
    }
    configRepo: {
      getConfig(): Record<string, unknown>
      updateConfig(mutator: (config: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown>
      getGatewayConfig(): { port: number; token: string }
      addAgent(agentId: string, workspaceDir: string, model?: string): void
      removeAgent(agentId: string): void
    }
    deptConfigRepo: {
      load(deptId: string): Record<string, unknown> | null
      save(deptId: string, config: Record<string, unknown>): void
      updateConfig(deptId: string, mutator: (config: Record<string, unknown>) => Record<string, unknown>): void
    }
    deptStateRepo: {
      load(deptId: string): Record<string, unknown>
      save(deptId: string, state: Record<string, unknown>): void
    }
    agentMetaRepo: {
      load(agentId: string): Record<string, unknown> | null
      save(agentId: string, meta: Record<string, unknown>): void
    }
    missionRepo: {
      readMission(): string
      readBaseMission(): string
      readDeptMission(deptId: string): string
    }
  }
  task: {
    checkQualityGate(task: Record<string, unknown>, pipelineStep: Record<string, unknown> | null): {
      passed: boolean; errors: string[]; shouldRework: boolean; escalate: boolean
    }
    createPipelineTask(completedTask: Record<string, unknown>, pipelineStep: Record<string, unknown> | null, taskTypes?: Record<string, unknown>[]): Record<string, unknown> | null
    createReworkTask(task: Record<string, unknown>, errors: string[]): Record<string, unknown>
  }
  observe: {
    getBudgetSummary(): {
      company: { dailyLimit: number; used: number; ratio: number }
      departments: Record<string, { limit: number; used: number; ratio: number }>
    }
    loadCompanyBudget(): Record<string, unknown>
    queryCosts(opts?: { date?: string; from?: string; to?: string; source?: string }): {
      entries: Record<string, unknown>[]
      totalCost: number
      totalInputTokens: number
      totalOutputTokens: number
    }
    getDailySummary(days?: number): Array<{
      date: string; source: string; cost: number
      inputTokens: number; outputTokens: number; calls: number
    }>
  }
  common: {
    loadState(): Record<string, unknown>
    saveState(state: Record<string, unknown>): void
  }
}
