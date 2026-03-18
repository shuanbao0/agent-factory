import { injectBaseRulesForAgent } from '@/lib/base-rules'
import { restartGateway, getStatus } from '@/lib/gateway-manager'
import { syncSkillSymlinks } from '@/lib/skill-symlinks'
import { logError } from '@/lib/error-logger'
import core from '@/lib/core-bridge'

// ── Hooks (wire UI-layer operations into core service) ───────────

function buildHooks() {
  return {
    onBaseRulesInject: (agentDir: string) => injectBaseRulesForAgent(agentDir),
    onSkillsSync: (id: string, skills: string[]) => syncSkillSymlinks(id, skills),
    onGatewayRestart: () => tryRestartGateway(),
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

export async function deleteAgent(id: string): Promise<{ ok: boolean; restarted?: boolean; archivedTo?: string | null; error?: string; status?: number }> {
  if (!id) {
    return { ok: false, error: 'id is required', status: 400 }
  }
  const result = await core.common.agentService.deleteAgent(id)
  const restarted = await tryRestartGateway()
  return { ...result, restarted }
}

// ── Internal helpers ─────────────────────────────────────────────

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
