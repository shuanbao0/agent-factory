import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

/**
 * GET /api/messages
 *
 * 从 SQLite messages 表查询 Agent 通信记录。
 *
 * Query params:
 *   agents=a,b       → 过滤指定 agent 的消息
 *   projectId=xxx    → 过滤项目关联 agent 的消息
 *   type=directive   → 过滤消息类型
 *   channel=peer-send → 过滤通道
 *   full=1           → 增加 content 截断长度
 *   limit=200        → 返回条数
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const full = params.get('full') === '1'
    const contentLimit = full ? 5000 : 500
    const limit = parseInt(params.get('limit') || '200') || 200
    const messageType = params.get('type') || undefined
    const channel = params.get('channel') || undefined

    // 解析 agent 过滤
    let agentId: string | undefined
    const agentsParam = params.get('agents')
    const projectIdParam = params.get('projectId')

    if (projectIdParam) {
      // 从项目元数据获取关联 agent
      try {
        const meta = core.repo.projectMetaRepo.readMeta(projectIdParam) as Record<string, unknown> | null
        if (meta && Array.isArray(meta.assignedAgents) && meta.assignedAgents.length > 0) {
          agentId = (meta.assignedAgents as string[])[0]
        }
      } catch { /* skip */ }
    } else if (agentsParam) {
      // 支持单个 agent 过滤（多 agent 用第一个）
      agentId = agentsParam.split(',')[0]?.trim() || undefined
    }

    const result = core.db.messageQueries.queryMessages({
      agentId,
      messageType,
      channel,
      limit,
    })

    // 截断 content
    const messages = result.messages.map((msg: Record<string, unknown>) => ({
      ...msg,
      id: `msg-${msg.id}`,
      timestamp: msg.ts,
      fromAgent: msg.fromAgent || (msg.direction === 'request' ? 'system' : msg.agentId),
      toAgent: msg.direction === 'request' ? msg.agentId : (msg.fromAgent || 'system'),
      content: msg.content
        ? (msg.content as string).length > contentLimit
          ? (msg.content as string).slice(0, contentLimit) + '...'
          : msg.content
        : '',
    }))

    return NextResponse.json({
      messages,
      total: result.total,
      source: 'db',
    })
  } catch (e) {
    return NextResponse.json(
      { error: String(e), messages: [], total: 0, source: 'error' },
      { status: 502 }
    )
  }
}
