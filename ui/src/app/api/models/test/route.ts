import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/error-logger'
import { PROVIDERS } from '@/lib/providers'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  api?: string
  models: Record<string, string>
}

// Known builtin provider defaults (for non-builtin direct API testing)
const BUILTIN_DEFAULTS: Record<string, { baseUrl: string; api: string; envKey: string }> = {
  anthropic: { baseUrl: 'https://api.anthropic.com', api: 'anthropic-messages', envKey: 'ANTHROPIC_API_KEY' },
  openai: { baseUrl: 'https://api.openai.com', api: 'openai-completions', envKey: 'OPENAI_API_KEY' },
  deepseek: { baseUrl: 'https://api.deepseek.com', api: 'openai-completions', envKey: 'DEEPSEEK_API_KEY' },
}

function resolveEnvVar(value: string): string {
  let envVars: Record<string, string> = {}
  try { envVars = core.common.envManager.readEnv() } catch (err) { logError('models-test/read-env', err) }
  return core.common.modelsService.resolveEnvVar(value, { ...envVars, ...process.env as Record<string, string> })
}

/** Check if provider uses setup-token auth (stored in auth-profiles, handled by Gateway internally) */
function getSetupToken(provider: string): string | null {
  const authProfiles = core.common.modelsService.getAuthProfilesByProvider()
  const profile = authProfiles[provider]
  if (!profile?.hasToken) return null
  const profilesData = core.repo.authProfilesRepo.readProfiles()
  if (!profilesData) return null
  for (const entry of Object.values(profilesData.profiles || {})) {
    const e = entry as { provider: string; token?: string }
    if (e.provider === provider && e.token) return e.token
  }
  return null
}

async function testAnthropicMessages(baseUrl: string, apiKey: string, modelId: string): Promise<{ success: boolean; error?: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (res.ok) return { success: true }

  const data = await res.json().catch(() => ({}))
  const msg = data?.error?.message || data?.message || `HTTP ${res.status}`
  return { success: false, error: msg }
}

async function testOpenAICompletions(baseUrl: string, apiKey: string, modelId: string): Promise<{ success: boolean; error?: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (res.ok) return { success: true }

  const data = await res.json().catch(() => ({}))
  const msg = data?.error?.message || data?.message || `HTTP ${res.status}`
  return { success: false, error: msg }
}

/**
 * For builtin providers using setup-token auth, test via Gateway chat.send
 * (Gateway handles auth-profiles internally, setup tokens cannot call API directly)
 */
async function testViaGateway(_provider: string, _modelId: string): Promise<{ success: boolean; error?: string }> {
  const gwPort = process.env.AGENT_FACTORY_PORT || '19100'
  const gwToken = process.env.AGENT_FACTORY_TOKEN || 'agent-factory-internal-token-2026'

  // Use a temporary session to test the model via Gateway
  const { gwCallAsync } = await import('@/lib/gateway-client')
  try {
    const result = await gwCallAsync('health', {}, 5000) as { ok?: boolean }
    if (!result) {
      return { success: false, error: 'Gateway not responding' }
    }
  } catch {
    return { success: false, error: 'Gateway not running — cannot test setup-token models' }
  }

  // Gateway is healthy and has the setup token — test by sending a minimal chat
  // Use the gateway-chat subprocess to avoid ws/webpack issues
  const { execFileSync } = await import('child_process')
  const { resolve } = await import('path')

  const chatScript = resolve(core.common.paths.PROJECT_ROOT, 'ui/scripts/gateway-chat.js')
  // Pick the first available agent to create a test session
  const ocConfig = core.repo.configRepo.getConfig()
  const agents = ocConfig?.agents?.agents || []
  const firstAgent = Object.keys(agents)[0]
  if (!firstAgent) {
    return { success: false, error: 'No agents configured — cannot test via Gateway' }
  }

  const sessionKey = `agent:${firstAgent}:model-test-${Date.now()}`
  try {
    const env = {
      ...process.env,
      CHAT_INPUT: JSON.stringify({ sessionKey, message: 'Reply with just "ok"' }),
      AGENT_FACTORY_PORT: gwPort,
      AGENT_FACTORY_TOKEN: gwToken,
    }
    const output = execFileSync('node', [chatScript], {
      timeout: 30000,
      encoding: 'utf-8',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Parse SSE output
    if (output.includes('event: final') || output.includes('event: delta')) {
      return { success: true }
    }
    // Extract error
    const errorMatch = output.match(/event: error\ndata: (.+)/)
    if (errorMatch) {
      const errData = JSON.parse(errorMatch[1])
      return { success: false, error: errData.error || 'Gateway test failed' }
    }
    return { success: false, error: 'No response from Gateway' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: `Gateway test failed: ${msg.slice(0, 200)}` }
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { provider, modelId } = await req.json()

    if (!provider || !modelId) {
      return NextResponse.json({ error: 'provider and modelId are required' }, { status: 400 })
    }

    const config = core.repo.modelsRepo.readModels() as { providers: Record<string, ProviderConfig> }
    const providerConfig = config.providers[provider]
    const builtinDef = BUILTIN_DEFAULTS[provider]
    const providerDef = PROVIDERS.find(p => p.id === provider)

    // Check if this provider uses setup-token auth (handled by Gateway, not direct API)
    const setupToken = getSetupToken(provider)
    if (setupToken && providerDef?.builtin) {
      // Setup tokens are managed by Gateway internally — test via Gateway
      const result = await testViaGateway(provider, modelId)
      if (result.success) {
        return NextResponse.json({ success: true, message: 'Model test passed (via Gateway)' })
      } else {
        return NextResponse.json({ error: result.error || 'Test failed' }, { status: 500 })
      }
    }

    // Direct API test for non-setup-token providers
    let apiKey = ''
    if (providerConfig?.apiKey) {
      apiKey = resolveEnvVar(providerConfig.apiKey)
    }
    if (!apiKey && builtinDef) {
      let envVars: Record<string, string> = {}
      try { envVars = core.common.envManager.readEnv() } catch (err) { logError('models-test/read-env', err) }
      apiKey = envVars[builtinDef.envKey] || process.env[builtinDef.envKey] || ''
    }

    if (!apiKey) {
      return NextResponse.json({ error: `No API key configured for provider "${provider}"` }, { status: 400 })
    }

    // Determine base URL and API protocol
    const baseUrl = providerConfig?.baseUrl || builtinDef?.baseUrl
    const apiProtocol = providerConfig?.api || builtinDef?.api || 'anthropic-messages'

    if (!baseUrl) {
      return NextResponse.json({ error: `No base URL for provider "${provider}"` }, { status: 400 })
    }

    // Test the model with a direct API call
    let result: { success: boolean; error?: string }

    if (apiProtocol === 'openai-completions' || apiProtocol === 'openai') {
      result = await testOpenAICompletions(baseUrl, apiKey, modelId)
    } else {
      // Default to anthropic-messages
      result = await testAnthropicMessages(baseUrl, apiKey, modelId)
    }

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Model test passed' })
    } else {
      return NextResponse.json({ error: result.error || 'Test failed' }, { status: 500 })
    }
  } catch (e: unknown) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      return NextResponse.json({ error: 'Test request timeout (15s)' }, { status: 408 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
