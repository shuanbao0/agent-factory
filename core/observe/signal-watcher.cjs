'use strict'
/**
 * SignalWatcher — 跨进程事件中继（fs.watch 方案）
 *
 * Dashboard (Next.js) 和 Autopilot 是独立进程，无法共享内存中的 EventBus。
 * Dashboard 写事件行到 config/.autopilot-signal → SignalWatcher 通过 fs.watch
 * 检测变更 → 读取新行 → bus.fire() 中继到 EventBus。
 *
 * 信号文件格式：每行一个 JSON 对象 { type, ...payload }
 */
const { existsSync, readFileSync, writeFileSync, watchFile, unwatchFile, mkdirSync } = require('fs')
const { join, dirname } = require('path')

const CONFIG_DIR = join(require('path').resolve(__dirname, '..', '..'), 'config')
const SIGNAL_FILE = join(CONFIG_DIR, '.autopilot-signal')

class SignalWatcher {
  /**
   * @param {import('./event-bus.cjs').EventBus} bus
   * @param {object} logger
   */
  constructor(bus, logger) {
    this._bus = bus
    this._logger = logger
    this._lastSize = 0
    this._watching = false
  }

  /**
   * 开始监听信号文件
   */
  start() {
    // Ensure signal file exists
    const dir = dirname(SIGNAL_FILE)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    if (!existsSync(SIGNAL_FILE)) writeFileSync(SIGNAL_FILE, '')

    this._lastSize = this._getFileSize()
    this._watching = true

    // Use fs.watchFile (polling-based, reliable across platforms)
    watchFile(SIGNAL_FILE, { interval: 1000 }, () => {
      if (!this._watching) return
      this._processNewLines()
    })

    this._logger.info('signal-watcher', `Watching ${SIGNAL_FILE}`)
  }

  /**
   * 停止监听
   */
  stop() {
    this._watching = false
    try {
      unwatchFile(SIGNAL_FILE)
    } catch { /* ignore */ }
    this._logger.info('signal-watcher', 'Stopped')
  }

  /**
   * 读取并处理新增行
   */
  _processNewLines() {
    try {
      const content = readFileSync(SIGNAL_FILE, 'utf-8')
      const currentSize = Buffer.byteLength(content, 'utf-8')

      if (currentSize <= this._lastSize) {
        this._lastSize = currentSize
        return
      }

      // Parse all lines and fire events for new ones
      const lines = content.trim().split('\n').filter(Boolean)
      // Approximate: process lines from where we left off
      const allLines = content.split('\n')
      let bytesProcessed = 0
      for (const line of allLines) {
        bytesProcessed += Buffer.byteLength(line + '\n', 'utf-8')
        if (bytesProcessed <= this._lastSize) continue
        if (!line.trim()) continue

        try {
          const event = JSON.parse(line.trim())
          if (event.type) {
            this._logger.debug('signal-watcher', `Relaying event: ${event.type}`)
            this._bus.fire(event.type, event)
          }
        } catch {
          // Skip malformed lines
        }
      }

      this._lastSize = currentSize

      // Clear signal file to prevent infinite growth (keep empty)
      writeFileSync(SIGNAL_FILE, '')
      this._lastSize = 0
    } catch (err) {
      this._logger.debug('signal-watcher', `Error processing signal file: ${err.message}`)
    }
  }

  /**
   * @returns {number}
   */
  _getFileSize() {
    try {
      return Buffer.byteLength(readFileSync(SIGNAL_FILE, 'utf-8'), 'utf-8')
    } catch {
      return 0
    }
  }
}

module.exports = { SignalWatcher, SIGNAL_FILE }
