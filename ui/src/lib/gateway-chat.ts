/**
 * Gateway Chat Client
 * 
 * 通过 WebSocket 连接内部 OpenClaw Gateway，实现与 Agent 的完整对话。
 * Agent 在 Gateway runtime 中运行，拥有完整工具链（exec、web_search、memory 等），
 * 并可通过 sessions_send/sessions_spawn 与其他 Agent 协作。
 * 
 * 协议流程：
 * 1. WebSocket 连接 → ws://127.0.0.1:{port}
 * 2. 发送 connect frame（带 auth token）→ 收到 hello-ok
 * 3. 发送 chat.send frame → 监听 chat event（delta/final/error）
 * 4. delta event 带增量文本，final event 表示完成
 */
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'

// ── 配置 ─────────────────────────────────────────────────────────
const PROJECT_ROOT = resolve(process.cwd(), '..')
const CONFIG_PATH = resolve(PROJECT_ROOT, 'config/openclaw.json')

interface GatewayConfig {
  port: number
  token: string
}

function loadGatewayConfig(): GatewayConfig {
  const port = parseInt(process.env.AGENT_FACTORY_PORT || '19100')
  const token = process.env.AGENT_FACTORY_TOKEN || 'agent-factory-internal-token-2026'

  // 也尝试从配置文件读取
  if (existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
      return {
        port: config.gateway?.port || port,
        token: config.gateway?.auth?.token || token,
      }
    } catch {}
  }

  return { port, token }
}

// ── 协议帧类型 ───────────────────────────────────────────────────
interface RequestFrame {
  type: 'req'
  id: string
  method: string
  params: Record<string, unknown>
}

interface ResponseFrame {
  type: 'res'
  id: string
  ok: boolean
  payload?: Record<string, unknown>
  error?: { message: string; code?: number }
}

interface EventFrame {
  type: 'event'
  event: string
  payload?: Record<string, unknown>
  seq?: number
}

/** chat event payload — gateway 在 agent 回复时广播 */
interface ChatEventPayload {
  runId: string
  sessionKey: string
  seq: number
  state: 'delta' | 'final' | 'error' | 'aborted'
  message?: {
    role: string
    content: Array<{ type: string; text?: string }>
    timestamp: number
  }
  errorMessage?: string
  usage?: Record<string, unknown>
}

// ── 回调类型 ─────────────────────────────────────────────────────
export interface ChatCallbacks {
  /** 收到增量文本 */
  onDelta?: (text: string) => void
  /** agent 回复完成 */
  onFinal?: (text: string, usage?: Record<string, unknown>) => void
  /** 发生错误 */
  onError?: (error: string) => void
  /** 回复被中止 */
  onAborted?: () => void
}

export interface ChatResult {
  ok: boolean
  reply: string
  error?: string
  usage?: Record<string, unknown>
  runId: string
}

// ── 核心函数：发送消息并等待完整回复 ─────────────────────────────
/**
 * 向指定 agent session 发送消息，通过 WebSocket 等待完整回复。
 * 
 * 流程：
 * 1. 建立 WebSocket 连接
 * 2. 发送 connect 帧进行认证
 * 3. 收到 hello-ok 后发送 chat.send
 * 4. 监听 chat event，收集 delta 文本
 * 5. 收到 final/error 后关闭连接返回结果
 */
export async function sendChatMessage(
  agentId: string,
  message: string,
  callbacks?: ChatCallbacks,
  options?: {
    sessionKey?: string
    timeoutMs?: number
  }
): Promise<ChatResult> {
  const config = loadGatewayConfig()
  const url = `ws://127.0.0.1:${config.port}`
  const sessionKey = options?.sessionKey || `dashboard:${agentId}`
  const timeoutMs = options?.timeoutMs || 120_000
  const idempotencyKey = randomUUID()

  return new Promise((resolve) => {
    let ws: WebSocket | null = null
    let connected = false
    let fullText = ''
    let timer: NodeJS.Timeout | null = null
    let resolved = false
    let runId = idempotencyKey

    // 超时处理
    timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        callbacks?.onError?.('Chat timeout')
        ws?.close()
        resolve({
          ok: false,
          reply: fullText || '',
          error: `Timeout after ${timeoutMs}ms`,
          runId: idempotencyKey,
        })
      }
    }, timeoutMs)

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      timer = null
      try { ws?.close() } catch {}
      ws = null
    }

    const finish = (result: ChatResult) => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve(result)
    }

    try {
      ws = new WebSocket(url, { maxPayload: 25 * 1024 * 1024 })

      ws.on('open', () => {
        // 发送 connect 帧进行认证
        const connectFrame: RequestFrame = {
          type: 'req',
          id: randomUUID(),
          method: 'connect',
          params: {
            minProtocol: 1,
            maxProtocol: 1,
            client: {
              id: 'agent-factory-dashboard',
              displayName: 'Agent Factory Dashboard',
              version: '1.0.0',
              platform: process.platform,
              mode: 'backend',
            },
            caps: [],
            auth: { token: config.token },
            role: 'operator',
            scopes: ['operator.admin', 'operator.read', 'operator.write'],
          },
        }
        ws!.send(JSON.stringify(connectFrame))
      })

      ws.on('message', (data) => {
        let frame: any
        try {
          frame = JSON.parse(data.toString())
        } catch {
          return
        }

        // ── 处理 connect 响应 ──────────────────────────────
        if (frame.type === 'res') {
          const res = frame as ResponseFrame

          // connect 成功 → 发送 chat.send
          if (res.ok && !connected) {
            connected = true

            const chatFrame: RequestFrame = {
              type: 'req',
              id: randomUUID(),
              method: 'chat.send',
              params: {
                sessionKey,
                message,
                idempotencyKey,
              },
            }
            ws!.send(JSON.stringify(chatFrame))
            return
          }

          // connect 失败
          if (!res.ok && !connected) {
            finish({
              ok: false,
              reply: '',
              error: `Gateway connect failed: ${res.error?.message || 'unknown'}`,
              runId: idempotencyKey,
            })
            return
          }

          // chat.send ack — adopt server-assigned runId
          if (res.ok && connected) {
            const ackRunId = (res.payload as Record<string, unknown>)?.runId
            if (ackRunId && typeof ackRunId === 'string') runId = ackRunId
            return
          }
        }

        // ── 处理 connect.challenge event ───────────────────
        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          // 简单认证模式不需要 challenge，但如果有就重发 connect
          return
        }

        // ── 处理 chat event（核心：delta/final/error）──────
        if (frame.type === 'event' && frame.event === 'chat') {
          const payload = frame.payload as ChatEventPayload
          if (!payload || (payload.runId !== runId && payload.sessionKey !== sessionKey)) return

          switch (payload.state) {
            case 'delta': {
              // 提取增量文本
              const deltaText = payload.message?.content
                ?.filter(b => b.type === 'text')
                ?.map(b => b.text || '')
                ?.join('') || ''
              if (deltaText) {
                fullText = deltaText // delta 是累积的完整文本
                callbacks?.onDelta?.(deltaText)
              }
              break
            }

            case 'final': {
              // agent 回复完成
              const finalText = payload.message?.content
                ?.filter(b => b.type === 'text')
                ?.map(b => b.text || '')
                ?.join('') || fullText
              callbacks?.onFinal?.(finalText, payload.usage)
              finish({
                ok: true,
                reply: finalText || fullText,
                usage: payload.usage,
                runId: idempotencyKey,
              })
              break
            }

            case 'error': {
              callbacks?.onError?.(payload.errorMessage || 'Unknown agent error')
              finish({
                ok: false,
                reply: fullText,
                error: payload.errorMessage || 'Agent error',
                runId: idempotencyKey,
              })
              break
            }

            case 'aborted': {
              callbacks?.onAborted?.()
              finish({
                ok: false,
                reply: fullText,
                error: 'Aborted',
                runId: idempotencyKey,
              })
              break
            }
          }
        }
      })

      ws.on('error', (err) => {
        finish({
          ok: false,
          reply: '',
          error: `WebSocket error: ${err.message}`,
          runId: idempotencyKey,
        })
      })

      ws.on('close', (code, reason) => {
        if (!resolved) {
          finish({
            ok: false,
            reply: fullText,
            error: `WebSocket closed (${code}): ${reason?.toString() || ''}`,
            runId: idempotencyKey,
          })
        }
      })

    } catch (err: any) {
      finish({
        ok: false,
        reply: '',
        error: `Connection failed: ${err.message}`,
        runId: idempotencyKey,
      })
    }
  })
}

// ── SSE Streaming 版本 ───────────────────────────────────────────
/**
 * 向指定 agent session 发送消息，通过 SSE 实时推送 delta。
 * 用于 Next.js Route Handler 的 streaming response。
 * 
 * @returns ReadableStream，可直接用于 new Response(stream)
 */
export function createChatStream(
  agentId: string,
  message: string,
  options?: {
    sessionKey?: string
    timeoutMs?: number
  }
): ReadableStream {
  const encoder = new TextEncoder()

  return new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      sendChatMessage(agentId, message, {
        onDelta: (text) => send('delta', { text }),
        onFinal: (text, usage) => {
          send('final', { text, usage })
          controller.close()
        },
        onError: (error) => {
          send('error', { error })
          controller.close()
        },
        onAborted: () => {
          send('aborted', {})
          controller.close()
        },
      }, options).catch((err) => {
        send('error', { error: String(err) })
        controller.close()
      })
    },
  })
}
