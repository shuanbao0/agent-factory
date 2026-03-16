/**
 * Task Bridge — 薄 Facade，委托 core/common/task-bridge
 */
const coreBridge = require('../../core/common/task-bridge.cjs')

module.exports = {
  createCycleTask: coreBridge.createCycleTask,
  completeCycleTask: coreBridge.completeCycleTask,
  createWorkTask: coreBridge.createWorkTask,
  updateTaskStatus: coreBridge.updateTaskStatus,
  findActiveTaskForAgent: coreBridge.findActiveTaskForAgent,
}
