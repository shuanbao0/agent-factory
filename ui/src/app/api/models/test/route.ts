import { NextRequest, NextResponse } from 'next/server'
import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'
import { logError } from '@/lib/error-logger'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const MODELS_PATH = resolve(PROJECT_ROOT, 'config/models.json')
const ENV_PATH = resolve(PROJECT_ROOT, '.env')

interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  api?: string
  models: Record<string, string>
}

function readModels(): { providers: Record<string, ProviderConfig> } {
  if (!existsSync(MODELS_PATH)) {
    return { providers: {} }
  }
  return JSON.parse(readFileSync(MODELS_PATH, 'utf-8'))
}

// Read .env file to get environment variables
function readEnvFile(): Record<string, string> {
  const vars: Record<string, string> = {}
  if (!existsSync(ENV_PATH)) return vars
  try {
    const lines = readFileSync(ENV_PATH, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
    }
  } catch (err) { logError('models-test/read-env-file', err) }
  return vars
}

// Resolve env var references like ${VAR_NAME} from .env file and process.env
function resolveEnvVar(value: string): string {
  const envVars = readEnvFile()
  return value.replace(/\$\{(\w+)\}/g, (_, name) => envVars[name] || process.env[name] || '')
}

// Known builtin provider defaults
const BUILTIN_DEFAULTS: Record<string, { baseUrl: string; api: string; envKey: string }> = {
  anthropic: { baseUrl: 'https://api.anthropic.com', api: 'anthropic-messages', envKey: 'ANTHROPIC_API_KEY' },
  openai: { baseUrl: 'https://api.openai.com', api: 'openai-completions', envKey: 'OPENAI_API_KEY' },
  deepseek: { baseUrl: 'https://api.deepseek.com', api: 'openai-completions', envKey: 'DEEPSEEK_API_KEY' },
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

    const config = readModels()
    const providerConfig = config.providers[provider]
    const builtinDef = BUILTIN_DEFAULTS[provider]

    // Determine API key
    let apiKey = ''
    if (providerConfig?.apiKey) {
      apiKey = resolveEnvVar(providerConfig.apiKey)
    } else if (builtinDef) {
      const envVars = readEnvFile()
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
