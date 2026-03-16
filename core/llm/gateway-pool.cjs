'use strict'
/**
 * GatewayConnectionPool — OpenClaw Gateway WebSocket 连接池
 *
 * 设计模式：Connection Pool + State Machine + Retry
 *
 * 职责：
 * - 管理到 OpenClaw Gateway 的持久 WebSocket 连接（单连接复用）
 * - 懒连接：首次发送请求时才建立连接
 * - 自动重连：连接断开后指数退避重连
 * - 心跳保活：定时 ping/pong 防止空闲断连
 * - 空闲超时：长时间无请求自动关闭连接，释放资源
 * - chat 消息流式处理：注册 sessionKey 监听器接收 delta/final 事件
 * - 空响应重试：检测到空响应时重置会话并注入记忆上下文重试
 *
 * 内部协议：
 *   1. 连接后发送 connect + token → 收到 hello-ok
 *   2. sendCommand() — 请求-响应模式（sessions.reset 等）
 *   3. sendToAgent() — chat 流式模式（chat.send → delta → final）
 */
const WebSocket = require('ws')
const { randomUUID } = require('crypto')

class GatewayConnectionPool {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.port] - Gateway 端口（不传则从 configRepo 或环境变量读取）
   * @param {string} [opts.token] - 认证 Token
   * @param {number} [opts.idleTimeoutMs=300000] - 空闲超时（默认 5 分钟）
   * @param {number} [opts.heartbeatMs=30000] - 心跳间隔（默认 30 秒）
   */
  constructor({ port, token, idleTimeoutMs = 300000, heartbeatMs = 30000 } = {}) {
    this._port = port
    this._token = token
    this._idleTimeoutMs = idleTimeoutMs
    this._heartbeatMs = heartbeatMs
    this._ws = null                     // WebSocket 实例
    this._connected = false             // 是否已完成握手
    this._connecting = null             // 正在进行的连接 Promise
    this._pendingRequests = new Map()   // requestId → { resolve, reject, timer } 请求-响应路由
    this._chatListeners = new Map()     // sessionKey → { resolve, fullText, handler } 聊天事件路由
    this._idleTimer = null              // 空闲超时定时器
    this._heartbeatTimer = null         // 心跳定时器
    this._reconnectDelay = 1000         // 当前重连延迟（指数增长）
    this._readMemorySummary = null      // 记忆读取回调（空响应重试用）
    this._logger = null                 // 可选日志实例
  }

  /** 设置日志实例 */
  setLogger(logger) { this._logger = logger }

  /** 设置记忆读取回调，用于空响应重试时注入上下文 */
  setMemoryReader(fn) { this._readMemorySummary = fn }

  /**
   * 确保 WebSocket 连接就绪（懒连接 + 自动重连）
   *
   * 连接握手流程：
   *   1. 建立 WebSocket 连接
   *   2. 收到 connect.challenge 事件
   *   3. 发送 connect 请求（含 token、协议版本、角色权限）
   *   4. 收到 connect 响应 → 握手完成
   */
  async _ensureConnected() {
    if (this._connected && this._ws?.readyState === WebSocket.OPEN) return
    if (this._connecting) return this._connecting

    this._connecting = new Promise((resolve, reject) => {
      const config = this._getConfig()
      const ws = new WebSocket(`ws://127.0.0.1:${config.port}`, {
        headers: { Origin: `http://127.0.0.1:${config.port}` }
      })

      // 握手帧：协议版本 3，operator 角色，管理员权限
      const connectFrame = JSON.stringify({
        type: 'req', id: '__connect__', method: 'connect',
        params: {
          minProtocol: 3, maxProtocol: 3,
          client: { id: 'openclaw-control-ui', mode: 'backend', version: '1.0.0', platform: process.platform },
          caps: [],
          auth: { token: config.token },
          role: 'operator',
          scopes: ['operator.admin', 'operator.read', 'operator.write'],
        }
      })

      ws.on('message', (data) => {
        let f
        try { f = JSON.parse(data.toString()) } catch { return }

        // 握手挑战 → 发送连接帧
        if (f.type === 'event' && f.event === 'connect.challenge') {
          ws.send(connectFrame)
          return
        }
        // 握手响应 → 完成连接
        if (f.type === 'res' && f.id === '__connect__') {
          if (f.ok) {
            this._ws = ws
            this._connected = true
            this._connecting = null
            this._reconnectDelay = 1000  // 重置重连延迟
            this._startHeartbeat()
            resolve()
          } else {
            this._connecting = null
            reject(new Error(`Connect failed: ${f.error?.message}`))
          }
          return
        }

        // 路由其他帧到对应处理器
        this._handleFrame(f)
      })

      ws.on('error', (err) => {
        this._connected = false
        this._connecting = null
        reject(err)
      })

      ws.on('close', () => {
        this._connected = false
        this._connecting = null
        this._stopHeartbeat()
        // 如果还有未完成的请求或监听器，触发自动重连
        if (this._pendingRequests.size > 0 || this._chatListeners.size > 0) {
          this._scheduleReconnect()
        }
      })
    })

    return this._connecting
  }

  /**
   * 帧路由：将响应帧分发到对应的请求处理器或聊天监听器
   * @param {object} f - 解析后的 JSON 帧
   */
  _handleFrame(f) {
    // 请求-响应模式：按 requestId 路由
    if (f.type === 'res' && this._pendingRequests.has(f.id)) {
      const pending = this._pendingRequests.get(f.id)
      this._pendingRequests.delete(f.id)
      clearTimeout(pending.timer)
      pending.resolve(f)
      return
    }

    // 聊天事件：按 sessionKey 或 runId 路由
    if (f.type === 'event' && f.event === 'chat') {
      const p = f.payload
      for (const [key, listener] of this._chatListeners) {
        if (p.sessionKey === key || p.runId === listener.runId) {
          listener.handler(p)
          break
        }
      }
    }
  }

  /**
   * 发送请求帧并等待响应
   * @param {string} method - 请求方法
   * @param {object} params - 请求参数
   * @param {number} [timeoutMs=30000] - 超时时间
   * @returns {Promise<object>} 响应帧
   */
  async _request(method, params, timeoutMs = 30000) {
    await this._ensureConnected()
    this._resetIdleTimer()
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingRequests.delete(id)
        reject(new Error(`Timeout ${timeoutMs}ms for ${method}`))
      }, timeoutMs)
      this._pendingRequests.set(id, { resolve, reject, timer })
      this._ws.send(JSON.stringify({ type: 'req', id, method, params }))
    })
  }

  /**
   * 向 Agent 发送消息并等待完整响应
   *
   * 特殊逻辑：空响应重试
   * - 第一次收到空响应 → 重置会话 → 注入记忆上下文 → 重试一次
   * - 重试后仍为空 → 返回错误
   *
   * @param {string} agentId - 目标 Agent ID
   * @param {string} sessionKey - 会话标识（格式: agent:xxx:session）
   * @param {string} message - 消息内容
   * @param {number} [timeoutMs=300000] - 总超时（默认 5 分钟）
   * @returns {Promise<{ok: boolean, text?: string, error?: string, usage?: object}>}
   */
  async sendToAgent(agentId, sessionKey, message, timeoutMs = 300000) {
    await this._ensureConnected()
    this._resetIdleTimer()

    return new Promise((resolve) => {
      let runId = randomUUID()
      let fullText = ''
      let retried = false       // 是否已尝试过空响应重试
      let done = false

      // 总超时定时器
      const timer = setTimeout(() => {
        if (!done) { done = true; cleanup(); resolve({ ok: false, error: `Timeout after ${timeoutMs / 1000}s for agent ${agentId}` }) }
      }, timeoutMs)

      const cleanup = () => {
        clearTimeout(timer)
        this._chatListeners.delete(sessionKey)
      }

      const finish = (result) => {
        if (done) return
        done = true; cleanup(); resolve(result)
      }

      // 注册聊天事件监听器
      this._chatListeners.set(sessionKey, {
        runId,
        handler: (p) => {
          if (p.runId !== runId && p.sessionKey !== sessionKey) return

          if (p.state === 'delta') {
            // 流式增量：提取 text 块内容
            const text = p.message?.content
              ?.filter(b => b.type === 'text')
              ?.map(b => b.text || '')
              ?.join('') || ''
            if (text) fullText = text
          } else if (p.state === 'final') {
            // 最终响应
            const text = p.message?.content
              ?.filter(b => b.type === 'text')
              ?.map(b => b.text || '')
              ?.join('') || fullText

            // ── 空响应重试逻辑 ──
            if (!text.trim() && !retried) {
              retried = true
              this._log('info', `Empty response from ${agentId} on ${sessionKey}, resetting and retrying`)

              // 重置会话后注入记忆上下文重新发送
              const resetId = randomUUID()
              this._pendingRequests.set(resetId, {
                resolve: () => {
                  runId = randomUUID()
                  fullText = ''
                  let retryMsg = message
                  // 注入记忆上下文（如果有的话）
                  if (this._readMemorySummary) {
                    const summary = this._readMemorySummary(agentId)
                    if (summary) {
                      retryMsg = `[Context from previous session]\n${summary}\n\n${message}`
                    }
                  }
                  const listener = this._chatListeners.get(sessionKey)
                  if (listener) listener.runId = runId
                  this._ws.send(JSON.stringify({
                    type: 'req', id: randomUUID(), method: 'chat.send',
                    params: { sessionKey, message: retryMsg, idempotencyKey: runId }
                  }))
                },
                reject: () => finish({ ok: false, error: 'Session reset failed' }),
                timer: setTimeout(() => finish({ ok: false, error: 'Session reset timeout' }), 30000),
              })
              this._ws.send(JSON.stringify({
                type: 'req', id: resetId, method: 'sessions.reset',
                params: { key: sessionKey }
              }))
              return
            }
            // 重试后仍为空 → 返回错误
            if (!text.trim() && retried) {
              this._log('error', `Empty response from ${agentId} after retry`)
              finish({ ok: false, error: 'Empty response after session reset retry', usage: p.usage })
              return
            }
            finish({ ok: true, text, usage: p.usage })
          } else if (p.state === 'error') {
            finish({ ok: false, error: p.errorMessage || 'Agent error' })
          } else if (p.state === 'aborted') {
            finish({ ok: true, text: fullText, aborted: true })
          }
        }
      })

      // 发送 chat.send 请求
      const sendId = randomUUID()
      this._pendingRequests.set(sendId, {
        resolve: (res) => {
          // 更新 runId（Gateway 可能分配不同的 runId）
          if (res.ok && res.payload?.runId) {
            runId = res.payload.runId
            const listener = this._chatListeners.get(sessionKey)
            if (listener) listener.runId = runId
          }
          if (!res.ok) finish({ ok: false, error: `chat.send failed: ${res.error?.message}` })
        },
        reject: (err) => finish({ ok: false, error: err.message }),
        timer: setTimeout(() => {}, timeoutMs), // 由主定时器控制
      })
      this._ws.send(JSON.stringify({
        type: 'req', id: sendId, method: 'chat.send',
        params: { sessionKey, message, idempotencyKey: runId }
      }))
    })
  }

  /**
   * 发送会话命令（compact / reset 等）
   * @param {string} method - 命令方法名
   * @param {object} params - 命令参数
   * @param {number} [timeoutMs=30000] - 超时
   * @returns {Promise<{ok: boolean, payload?: object, error?: string}>}
   */
  async sendCommand(method, params, timeoutMs = 30000) {
    const res = await this._request(method, params, timeoutMs)
    if (res.ok) return { ok: true, payload: res.payload }
    return { ok: false, error: `${method} failed: ${res.error?.message}` }
  }

  // ── 内部方法 ──────────────────────────────────────────────

  /**
   * 获取 Gateway 连接配置
   * 优先级：构造函数参数 > configRepo > 环境变量 > 默认值
   */
  _getConfig() {
    if (this._port && this._token) return { port: this._port, token: this._token }
    try {
      const { configRepo } = require('../repo/config.cjs')  // 懒加载，避免启动时循环依赖
      return configRepo.getGatewayConfig()
    } catch {
      return {
        port: parseInt(process.env.AGENT_FACTORY_PORT || '19100'),
        token: process.env.AGENT_FACTORY_TOKEN || ''
      }
    }
  }

  /** 日志输出（如果设置了 logger） */
  _log(level, msg) {
    if (this._logger) {
      this._logger[level]('gateway-pool', msg)
    }
  }

  /** 启动心跳定时器 */
  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) this._ws.ping()
    }, this._heartbeatMs)
  }

  /** 停止心跳 */
  _stopHeartbeat() { clearInterval(this._heartbeatTimer) }

  /** 重置空闲超时（每次请求时调用） */
  _resetIdleTimer() {
    clearTimeout(this._idleTimer)
    this._idleTimer = setTimeout(() => this.close(), this._idleTimeoutMs)
  }

  /** 指数退避自动重连 */
  _scheduleReconnect() {
    setTimeout(() => {
      this._ensureConnected().catch(() => {
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000)  // 最大 30 秒
        this._scheduleReconnect()
      })
    }, this._reconnectDelay)
  }

  /** 关闭连接并清理所有定时器 */
  close() {
    this._stopHeartbeat()
    clearTimeout(this._idleTimer)
    if (this._ws) { try { this._ws.close() } catch {} }
    this._connected = false
    this._ws = null
  }

  /** 获取连接池状态（用于监控和调试） */
  getStats() {
    return {
      connected: this._connected,
      pendingRequests: this._pendingRequests.size,
      chatListeners: this._chatListeners.size,
    }
  }
}

module.exports = { GatewayConnectionPool }
