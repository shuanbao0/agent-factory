'use strict'
/**
 * EventBus — 轻量级事件总线（发布-订阅）
 *
 * 设计模式：Observer / Pub-Sub（扩展 Node.js EventEmitter）
 *
 * 职责：
 * - 提供 fire() 方法发射带时间戳的结构化事件
 * - 可选将事件持久化到 SQLite events 表
 * - 错误隔离：监听器错误和持久化错误都会被吞掉，绝不影响主流程
 *
 * 使用方式：
 *   eventBus.fire('cycle.start', { deptId: 'novel', cycleNum: 42 })
 *   eventBus.on('cost.tracked', (event) => { ... })
 *
 * Reactor 通过 bus.on() 注册监听器实现响应式处理
 */
const { EventEmitter } = require('events')

let _logger
function getLogger() {
  if (!_logger) _logger = require('../common/logger.cjs')
  return _logger
}

class EventBus extends EventEmitter {
  /**
   * @param {Object} [opts]
   * @param {boolean} [opts.persist=false] - 是否将事件持久化到 DB
   */
  constructor(opts = {}) {
    super()
    this._persist = opts.persist || false
  }

  /**
   * 发射结构化事件
   *
   * fire-and-forget 语义：
   * - 监听器抛错 → 吞掉，保护主流程
   * - 持久化失败 → 吞掉，保护主流程
   *
   * @param {string} eventType - 点分事件名（如 'cycle.start', 'cost.tracked', 'alert.cost_exceeded'）
   * @param {Object} payload - 事件数据（会自动添加 type 和 ts 字段）
   */
  fire(eventType, payload = {}) {
    const event = {
      type: eventType,
      ts: new Date().toISOString(),
      ...payload,
    }

    // 触发监听器（吞掉错误）
    try {
      super.emit(eventType, event)
    } catch (err) {
      getLogger().debug('event-bus', 'Listener error', { eventType, error: err.message })
    }

    // 可选：持久化到 DB（吞掉错误）
    if (this._persist) {
      try {
        const { insertEvent } = require('../db/queries/event-queries.cjs')
        insertEvent(event)
      } catch (err) {
        getLogger().debug('event-bus', 'Event persist failed', { eventType, error: err.message })
      }
    }
  }

  /**
   * 获取指定事件的监听器数量（便于调试和验证 Reactor 注册）
   * @param {string} eventType
   * @returns {number}
   */
  listenerCount(eventType) {
    return super.listenerCount(eventType)
  }
}

/** 全局单例（启用持久化），供 Autopilot 运行时使用 */
const eventBus = new EventBus({ persist: true })

module.exports = { EventBus, eventBus }
