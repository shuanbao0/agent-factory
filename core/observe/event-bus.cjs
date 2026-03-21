'use strict'
/**
 * EventBus — 轻量级事件总线（发布-订阅）
 *
 * 设计模式：Observer / Pub-Sub（扩展 Node.js EventEmitter）
 *
 * 职责：
 * - 提供 fire() 方法发射带时间戳的结构化事件
 * - 可选将事件持久化到 JSONL 文件（config/autopilot-events.jsonl）
 * - 错误隔离：监听器错误和持久化错误都会被吞掉，绝不影响主流程
 *
 * 使用方式：
 *   eventBus.fire('cycle.start', { deptId: 'novel', cycleNum: 42 })
 *   eventBus.on('cost.tracked', (event) => { ... })
 *
 * Reactor 通过 bus.on() 注册监听器实现响应式处理
 */
const { EventEmitter } = require('events')
const { appendFileSync, existsSync, mkdirSync } = require('fs')
const { dirname } = require('path')
const { EVENTS_FILE } = require('../common/paths.cjs')

class EventBus extends EventEmitter {
  /**
   * @param {Object} [opts]
   * @param {boolean} [opts.persist=false] - 是否将事件写入 JSONL 文件
   * @param {string} [opts.filePath] - 自定义事件文件路径
   */
  constructor(opts = {}) {
    super()
    this._persist = opts.persist || false
    this._filePath = opts.filePath || EVENTS_FILE
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
    } catch {
      // 监听器错误 — 吞掉以保护主流程
    }

    // 可选：持久化到 JSONL（吞掉错误）
    if (this._persist) {
      try {
        const dir = dirname(this._filePath)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        appendFileSync(this._filePath, JSON.stringify(event) + '\n')
      } catch {
        // 持久化错误 — 吞掉
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
