/**
 * Readers — 薄 Facade，委托 core/repo/ 模块
 *
 * API 不变，所有调用方零改动。业务逻辑已下沉到 core/repo/ 层。
 */
const { sessionRepo } = require('../../core/repo/session.cjs')
const { missionRepo } = require('../../core/repo/mission.cjs')
const { taskRepo } = require('../../core/repo/task.cjs')
const { deptConfigRepo } = require('../../core/repo/dept-config.cjs')
const { deptStateRepo } = require('../../core/repo/dept-state.cjs')
const { agentMetaRepo } = require('../../core/repo/agent-meta.cjs')

function readMission() { return missionRepo.readMission() }
function readBaseMission() { return missionRepo.readBaseMission() }
function readWorkspaceFile(agentDir, filename) { return missionRepo.readWorkspaceFile(agentDir, filename) }
function readCeoWorkspaceFile(filename) { return missionRepo.readCeoWorkspaceFile(filename) }
function readProjectTasks() { return taskRepo.readProjectsWithTasks() }
function readStandaloneTasks() { return taskRepo.readStandaloneTasks() }
function readAgentActivity() { return sessionRepo.readAgentActivity() }
function fetchSessionTokens() { return sessionRepo.fetchSessionTokens() }
function readAllDepartmentReports() { return missionRepo.readAllDepartmentReports() }
function readEscalations() { return missionRepo.readEscalations() }
function loadDeptConfig(deptId) { return deptConfigRepo.load(deptId) }
function loadDeptState(deptId) { return deptStateRepo.load(deptId) }
function saveDeptState(deptId, state) { return deptStateRepo.save(deptId, state) }
function readDeptMission(deptId) { return missionRepo.readDeptMission(deptId) }
function getSessionTokenInfo(agentId, sessionKey) { return sessionRepo.getSessionTokenInfo(agentId, sessionKey) }
function readMemorySummary(agentId) { return missionRepo.readMemorySummary(agentId) }
function readAgentMeta(agentId) {
  const meta = agentMetaRepo.readMeta(agentId)
  if (!meta) return null
  return { description: meta.description || '', role: meta.role || agentId, name: meta.name || agentId }
}

/**
 * 判断部门活跃度（供 AdaptiveTimer 使用）
 * @param {string} deptId
 * @returns {'active' | 'idle' | 'budget_constrained'}
 */
function getDeptActivityLevel(deptId) {
  // Check budget first
  try {
    const { checkBudget } = require('../../core/observe/budget.cjs')
    const budget = checkBudget(deptId)
    if (!budget.allowed) return 'budget_constrained'
  } catch { /* proceed without budget check */ }

  // Check if department has active tasks
  const config = loadDeptConfig(deptId)
  if (!config) return 'idle'

  const agents = config.agents || []
  const projects = readProjectTasks()
  const activeStatuses = ['in_progress', 'review', 'rework']

  for (const proj of projects) {
    for (const t of (proj.tasks || [])) {
      if (!activeStatuses.includes(t.status)) continue
      const assignees = [t.assignedAgent, ...(t.assignees || [])]
      if (assignees.some(a => agents.includes(a))) {
        return 'active'
      }
    }
  }

  return 'idle'
}

module.exports = {
  readMission,
  readBaseMission,
  readWorkspaceFile,
  readCeoWorkspaceFile,
  readProjectTasks,
  readStandaloneTasks,
  readAgentActivity,
  fetchSessionTokens,
  readAllDepartmentReports,
  readEscalations,
  loadDeptConfig,
  loadDeptState,
  saveDeptState,
  readDeptMission,
  getSessionTokenInfo,
  readMemorySummary,
  readAgentMeta,
  getDeptActivityLevel,
}
