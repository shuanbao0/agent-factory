import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/error-logger'
import core from '@/lib/core-bridge'

export const dynamic = 'force-dynamic'

interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  api?: string
  models: Record<string, string>
}

// Known builtin provider defaults
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { provider, modelId } = await req.json()

    if (!provider || !modelId) {
      return NextResponse.json({ error: 'provider and modelId are required' }, { status: 400 })
    }

    const config = core.repo.modelsRepo.readModels() as { providers: Record<string, ProviderConfig> }
    const providerConfig = config.providers[provider]
    const builtinDef = BUILTIN_DEFAULTS[provider]

    // Determine API key
    let apiKey = ''
    if (providerConfig?.apiKey) {
      apiKey = resolveEnvVar(providerConfig.apiKey)
    } else if (builtinDef) {
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
