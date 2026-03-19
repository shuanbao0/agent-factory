'use strict'
/**
 * EventRelay — Dashboard 侧事件发射
 *
 * Dashboard (Next.js) 和 Autopilot 是独立进程，无法共享内存中的 EventBus。
 * 本模块将事件追加到 config/.autopilot-signal 信号文件，
 * Autopilot 的 SignalWatcher 通过 fs.watch 检测并中继到 EventBus。
 */
const { appendFileSync, existsSync, mkdirSync } = require('fs')
const { join, dirname, resolve } = require('path')

const PROJECT_ROOT = resolve(__dirname, '..', '..')
const SIGNAL_FILE = join(PROJECT_ROOT, 'config', '.autopilot-signal')

/**
 * 追加事件行到信号文件
 * @param {string} eventType - 事件类型（如 'task.status_changed'）
 * @param {object} payload - 事件数据
 */
function relayEvent(eventType, payload) {
  try {
    const dir = dirname(SIGNAL_FILE)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const event = {
      type: eventType,
      ts: new Date().toISOString(),
      ...payload,
    }
    appendFileSync(SIGNAL_FILE, JSON.stringify(event) + '\n')
  } catch {
    // Fire-and-forget: signal relay failure should never break the API
  }
}

module.exports = { relayEvent }
