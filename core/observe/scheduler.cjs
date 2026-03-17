'use strict'
/**
 * Scheduler — 事件驱动调度器
 *
 * 监听 EventBus 上的任务/质量事件，秒级触发下一步动作，
 * 取代固定 10-30min 轮询等待。
 *
 * 与轮询共存：Scheduler 和 setTimeout 轮询并行运行。
 * 事件触发的 cycle 通过 state.status === 'cycling' 并发锁与轮询互斥。
 * 轮询作为兜底安全网：即使事件丢失，最长 10min 后轮询仍会执行。
 */

const MIN_CYCLE_GAP_MS = 30_000 // 每个部门 30s 内最多触发一次 cycle
const QUALITY_GATE_DELAY_MS = 5_000 // 质量门延迟 5s 后触发

class Scheduler {
  /**
   * @param {Object} deps
   * @param {function(string): Promise<any>} deps.runDepartmentCycle
   * @param {function(string, object): Promise<any>} deps.processQualityGate
   * @param {function(string): object|null} deps.findTaskById
   * @param {object} deps.logger
   */
  constructor({ runDepartmentCycle, processQualityGate, findTaskById, logger }) {
    this._runDepartmentCycle = runDepartmentCycle
    this._processQualityGate = processQualityGate
    this._findTaskById = findTaskById
    this._logger = logger
    this._lastCycleTime = new Map() // deptId → timestamp
    this._pendingTimers = new Set()
    this._disabled = false
  }

  /**
   * 注册事件监听到 EventBus
   * @param {import('./event-bus.cjs').EventBus} bus
   */
  register(bus) {
    bus.on('task.status_changed', (event) => {
      if (this._disabled) return
      const { taskId, department, to } = event

      if (to === 'review') {
        this._scheduleQualityGate(taskId, department)
      } else if (to === 'completed' || to === 'failed') {
        this._scheduleDeptCycle(department, `task_${to}`)
      }
    })

    bus.on('quality.gate_completed', (event) => {
      if (this._disabled) return
      this._scheduleDeptCycle(event.deptId, 'quality_gate_completed')
    })
  }

  /**
   * 去重 + 防抖调度部门循环
   * @param {string} deptId
   * @param {string} reason
   */
  _scheduleDeptCycle(deptId, reason) {
    if (!deptId) return
    const now = Date.now()
    const lastTime = this._lastCycleTime.get(deptId) || 0
    const elapsed = now - lastTime

    if (elapsed < MIN_CYCLE_GAP_MS) {
      this._logger.debug('scheduler', `Debounced cycle for ${deptId} (${reason}), ${MIN_CYCLE_GAP_MS - elapsed}ms remaining`)
      return
    }

    this._lastCycleTime.set(deptId, now)
    this._logger.info('scheduler', `Event-triggered cycle for ${deptId}: ${reason}`)

    // Fire async, don't block
    this._runDepartmentCycle(deptId).catch(err => {
      this._logger.error('scheduler', `Event-triggered cycle failed for ${deptId}`, err)
    })
  }

  /**
   * 延迟触发质量门
   * @param {string} taskId
   * @param {string} deptId
   */
  _scheduleQualityGate(taskId, deptId) {
    if (!taskId || !deptId) return

    const timer = setTimeout(() => {
      this._pendingTimers.delete(timer)
      if (this._disabled) return

      const task = this._findTaskById(taskId)
      if (!task || task.status !== 'review') return

      this._logger.info('scheduler', `Event-triggered quality gate for task ${taskId} in ${deptId}`)
      this._processQualityGate(deptId, task).catch(err => {
        this._logger.error('scheduler', `Event-triggered quality gate failed for task ${taskId}`, err)
      })
    }, QUALITY_GATE_DELAY_MS)

    this._pendingTimers.add(timer)
  }

  /**
   * 优雅关闭，清除所有 pending timers
   */
  disable() {
    this._disabled = true
    for (const timer of this._pendingTimers) {
      clearTimeout(timer)
    }
    this._pendingTimers.clear()
  }
}

module.exports = { Scheduler }
