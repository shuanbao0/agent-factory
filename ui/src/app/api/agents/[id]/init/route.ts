/**
 * POST /api/agents/:id/init
 *
 * 让 agent 用自己的模型生成 IDENTITY.md 和 SOUL.md。
 * 通过 OpenClaw Gateway 向 agent 发送初始化 prompt，
 * agent 读取 AGENTS.md 后自行写入个性化的身份文件。
 *
 * 返回 SSE 流（和 /chat 相同格式），方便前端显示进度。
 */
import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import { resolve } from 'path'
import { existsSync } from 'fs'
import { logError } from '@/lib/error-logger'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

const SCRIPT_PATH = resolve(process.cwd(), 'scripts/runtime/gateway-chat.js')

const INIT_PROMPT = `你好！请按以下步骤完成初始化，**不需要征求确认，直接执行**：

1. 读取工作目录中的 AGENTS.md，了解自己的角色和职责
2. 根据角色内容，重新生成个性化的 IDENTITY.md，格式如下：
   \`\`\`
   # IDENTITY.md - Who Am I?

   - **Name:** [根据角色取一个有个性的名字]
   - **Creature:** [选一种体现你角色特质的生物，比如"工程师猫头鹰"、"研究员狐狸"]
   - **Vibe:** [2-3个形容你工作风格的词，例如"精准、高效、严谨"]
   - **Emoji:** [一个代表你角色的emoji]
   \`\`\`
3. 根据角色职责，重新生成个性化的 SOUL.md，写3-5条**针对你具体工作**的行为准则
4. 将两个文件写入工作目录

完成后简短告知已完成初始化。`

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  // Check agent exists
  if (!core.repo.agentMetaRepo.exists(id)) {
    return new Response(
      'event: error\ndata: {"error":"Agent not found"}\n\n',
      { status: 404, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  // Check script exists
  if (!existsSync(SCRIPT_PATH)) {
    return new Response(
      'event: error\ndata: {"error":"Gateway script not found"}\n\n',
      { status: 500, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  // Build agent name hint from AGENTS.md
  let agentHint = ''
  const agentsMd = core.repo.agentMetaRepo.readAgentFile(id, 'AGENTS.md')
  if (agentsMd) {
    const match = agentsMd.match(/^# AGENTS\.md — (.+)$/m)
    if (match) agentHint = ` (你是 ${match[1].trim()})`
  }

  const sessionKey = `agent:${id}:main`
  const message = INIT_PROMPT + agentHint
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
        console.error('[init]', chunk.toString().trim())
      })

      const timeout = setTimeout(() => {
        controller.enqueue(enc.encode('event: error\ndata: {"error":"Init timeout"}\n\n'))
        try { proc.kill() } catch (err) { logError('agent-init/kill-proc', err) }
        controller.close()
      }, 180_000)

      proc.on('close', () => {
        clearTimeout(timeout)
        controller.close()
      })

      proc.on('error', (err: Error) => {
        clearTimeout(timeout)
        controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`))
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
