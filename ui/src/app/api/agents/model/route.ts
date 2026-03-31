import { NextRequest, NextResponse } from 'next/server'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('id')
  if (!agentId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // DB-first, fallback to filesystem
  try {
    const agent = core.db.agentQueries.findAgentById(agentId)
    if (agent) return NextResponse.json({ model: (agent as Record<string, unknown>).model || null })
  } catch { /* DB unavailable */ }

  const meta = core.repo.agentMetaRepo.readMeta(agentId)
  return NextResponse.json({ model: meta?.model || null })
}

/**
 * Resolve alias ref (e.g. "anthropic/opus") to full Gateway model ID
 * (e.g. "anthropic/claude-opus-4-6") using models.json
 */
function resolveModelRef(ref: string): string {
  if (!ref) return ref
  const [provider, alias] = ref.split('/')
  if (!provider || !alias) return ref
  try {
    const config = core.repo.modelsRepo.readModels() as Record<string, unknown>
    const providers = config.providers as Record<string, { models?: Record<string, string> }> | undefined
    const providerConfig = providers?.[provider]
    const modelId = providerConfig?.models?.[alias]
    if (modelId) return `${provider}/${modelId}`
  } catch { /* fallback to original ref */ }
  return ref
}

export async function PUT(req: NextRequest) {
  try {
    const { agentId, model } = await req.json()
    if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })

    // 1. Update agent.json metadata (store alias ref for UI display)
    core.repo.agentMetaRepo.updateMeta(agentId, (meta) => {
      if (model) {
        return { ...meta, model }
      }
      const updated = { ...meta }
      delete updated.model
      return updated
    })

    // 2. Resolve alias ref to full model ID for Gateway
    const gatewayModel = model ? resolveModelRef(model) : null

    // 3. Sync to openclaw.json so Gateway actually uses the new model
    core.repo.configRepo.updateConfig((config: Record<string, unknown>) => {
      const agents = config.agents as Record<string, unknown> | undefined
      const list = (agents?.list || []) as Array<Record<string, unknown>>
      const entry = list.find((a) => a.id === agentId)
      if (entry) {
        if (gatewayModel) {
          entry.model = { primary: gatewayModel }
        } else {
          delete entry.model
        }
      }
      return config
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
