'use strict'
const { canTransition, transition } = require('./task-state-machine.cjs')

class TaskService {
  /**
   * @param {object} deps
   * @param {function} deps.updateTaskStatus
   */
  constructor(deps) {
    this._updateTaskStatus = deps.updateTaskStatus
  }

  /**
   * Safe state transition — validate + persist.
   */
  async transitionTask(agentId, taskId, task, newStatus, reason, extras) {
    const result = transition(task, newStatus, { actor: 'autopilot', reason, extras })
    if (!result.ok) return result
    await this._updateTaskStatus(agentId, taskId, newStatus, extras)
    return result
  }
}

module.exports = { TaskService }
