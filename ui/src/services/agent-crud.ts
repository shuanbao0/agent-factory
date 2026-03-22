import { injectBaseRulesForAgent } from '@/lib/base-rules'
import { restartGateway, getStatus } from '@/lib/gateway-manager'
import { gwCallAsync } from '@/lib/gateway-client'
import { syncSkillSymlinks } from '@/lib/skill-symlinks'
import { logError } from '@/lib/error-logger'
import core from '@/lib/core-bridge'

// ── Hooks (wire UI-layer operations into core service) ───────────

function buildHooks() {
  return {
    onBaseRulesInject: (agentDir: string) => injectBaseRulesForAgent(agentDir),
    onSkillsSync: (id: string, skills: string[]) => syncSkillSymlinks(id, skills),
    onGatewaySync: (action: string, id: string, agentDir?: string, model?: string) =>
      syncAgentToGateway(action as 'create' | 'update' | 'delete', id, agentDir, model),
  }
}

// ── Public API ───────────────────────────────────────────────────

export async function createAgent(body: {
  id: string
  templateId?: string
  name: string
  description?: string
  model?: string
  skills?: string[]
  peers?: string[]
  systemPrompt?: string
  department?: string
}): Promise<{ ok: boolean; id?: string; deployed?: boolean; restarted?: boolean; hasIdentityFiles?: boolean; error?: string; status?: number }> {
  return core.common.agentService.createAgent(body, buildHooks())
}

export async function updateAgent(body: {
  id: string
  name?: string
  description?: string
  model?: string
  skills?: string[]
  peers?: string[]
  systemPrompt?: string
  department?: string
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  return core.common.agentService.updateAgent(body, buildHooks())
}

export async function deleteAgent(id: string): Promise<{ ok: boolean; synced?: boolean; archivedTo?: string | null; error?: string; status?: number }> {
  if (!id) {
    return { ok: false, error: 'id is required', status: 400 }
  }
  const result = await core.common.agentService.deleteAgent(id)
  const synced = await syncAgentToGateway('delete', id)
  return { ...result, synced }
}

// ── Internal helpers ─────────────────────────────────────────────

/**
 * 通过 WebSocket API 同步 Agent 到 Gateway 内存（替代重启）
 * 降级：WebSocket 调用失败时自动回退到重启 Gateway
 */
async function syncAgentToGateway(
  action: 'create' | 'update' | 'delete',
  id: string,
  agentDir?: string,
  model?: string
): Promise<boolean> {
  try {
    const status = await getStatus()
    if (status.status !== 'running') return false

    if (action === 'create') {
      await gwCallAsync('agents.create', { name: id, workspace: agentDir })
      if (model) await gwCallAsync('agents.update', { agentId: id, model })
    } else if (action === 'update') {
      const params: Record<string, unknown> = { agentId: id }
      if (model) params.model = model
      if (agentDir) params.workspace = agentDir
      await gwCallAsync('agents.update', params)
    } else if (action === 'delete') {
      await gwCallAsync('agents.delete', { agentId: id, deleteFiles: false })
    }
    return true
  } catch (err) {
    logError('agents-api/gateway-sync', err)
    return tryRestartGateway()
  }
}

export async function tryRestartGateway(): Promise<boolean> {
  try {
    const status = await getStatus()
    if (status.status === 'running') {
      const result = await restartGateway()
      return result.ok
    }
  } catch (err) { logError('agents-api/restart-gateway', err) }
  return false
}

export function readOpenlawConfig(): Record<string, any> {
  return core.repo.configRepo.getConfig() as Record<string, any>
}
