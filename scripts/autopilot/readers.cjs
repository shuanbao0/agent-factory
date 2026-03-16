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
}
