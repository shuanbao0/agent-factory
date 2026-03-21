/**
 * POST /api/agents/:id/chat
 *
 * 通过 child_process 调用独立 node 脚本，绕过 Next.js webpack 对 ws 模块的兼容问题。
 * 脚本通过宿主机 OpenClaw Gateway WebSocket 发送 chat.send，以 SSE 流式输出事件。
 */
import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import { resolve } from 'path'
import { logError } from '@/lib/error-logger'

export const dynamic = 'force-dynamic'

const SCRIPT_PATH = resolve(process.cwd(), 'scripts/gateway-chat.js')

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  let message: string
  try {
    const body = await req.json()
    message = body.message?.trim()
  } catch {
    return new Response(
      'event: error\ndata: {"error":"invalid request body"}\n\n',
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  if (!message) {
    return new Response(
      'event: error\ndata: {"error":"message is required"}\n\n',
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  const sessionKey = `agent:${id}:main`
  const chatInput = JSON.stringify({ sessionKey, message })

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      const proc = spawn('node', [SCRIPT_PATH], {
        env: { ...process.env, CHAT_INPUT: chatInput },
      })

      proc.stdout.on('data', (chunk: Buffer) => {
        controller.enqueue(enc.encode(chunk.toString()))
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        console.error('[chat]', chunk.toString().trim())
      })

      const cleanup = () => {
        try { proc.kill() } catch (err) { logError('agent-chat/kill-proc', err) }
      }

      const timeout = setTimeout(() => {
        controller.enqueue(enc.encode('event: error\ndata: {"error":"Gateway timeout"}\n\n'))
        cleanup()
        controller.close()
      }, 125_000)

      proc.on('close', () => {
        clearTimeout(timeout)
        controller.close()
      })

      proc.on('error', (err: Error) => {
        clearTimeout(timeout)
        controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`))
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
