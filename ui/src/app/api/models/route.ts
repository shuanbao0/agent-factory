import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { restartGateway, getStatus } from '@/lib/gateway-manager'
import { PROVIDERS } from '@/lib/providers'
import { logError } from '@/lib/error-logger'
import core from '@/lib/core-bridge'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const MODELS_PATH = resolve(PROJECT_ROOT, 'config/models.json')
const MODELS_DEFAULT_PATH = resolve(PROJECT_ROOT, 'config/models.default.json')
const OPENCLAW_CONFIG_PATH = resolve(PROJECT_ROOT, 'config/openclaw.json')
const OPENCLAW_DEFAULT_PATH = resolve(PROJECT_ROOT, 'config/openclaw.default.json')
const STATE_DIR = resolve(PROJECT_ROOT, '.openclaw-state')
const AUTH_PROFILES_PATH = resolve(STATE_DIR, 'agents/main/agent/auth-profiles.json')

/** Copy from .default.json template if runtime file doesn't exist */
function ensureConfigFiles() {
  if (!existsSync(MODELS_PATH) && existsSync(MODELS_DEFAULT_PATH)) {
    copyFileSync(MODELS_DEFAULT_PATH, MODELS_PATH)
  }
  if (!existsSync(OPENCLAW_CONFIG_PATH) && existsSync(OPENCLAW_DEFAULT_PATH)) {
    copyFileSync(OPENCLAW_DEFAULT_PATH, OPENCLAW_CONFIG_PATH)
  }
}

export const dynamic = 'force-dynamic'

interface ProviderConfig {
  apiKey: string
  baseUrl?: string
  api?: string       // e.g. "anthropic-messages"
  models: Record<string, string>
}

interface ModelsConfig {
  providers: Record<string, ProviderConfig>
  default: string
}

function readModels(): ModelsConfig {
  ensureConfigFiles()
  if (!existsSync(MODELS_PATH)) {
    return { providers: {}, default: '' }
  }
  return JSON.parse(readFileSync(MODELS_PATH, 'utf-8'))
}

async function writeModelsAndSync(config: ModelsConfig) {
  writeFileSync(MODELS_PATH, JSON.stringify(config, null, 2) + '\n')
  syncOpenClawConfig(config)
  // If Gateway is running, auto-restart to pick up changes
  try {
    const status = await getStatus()
    if (status.status === 'running') {
      await restartGateway()
    }
  } catch {
    // Non-fatal: gateway restart failure shouldn't block the config write
  }
}

function syncOpenClawConfig(modelsConfig: ModelsConfig) {
  try {
    core.repo.configRepo.updateConfig((ocConfig: Record<string, unknown>) => {
      // Ensure structure exists
      if (!ocConfig.models) ocConfig.models = {}
      const models = ocConfig.models as Record<string, unknown>
      if (!models.providers) models.providers = {}
      if (!ocConfig.agents) ocConfig.agents = {}
      const agents = ocConfig.agents as Record<string, unknown>
      if (!agents.defaults) agents.defaults = {}
      const defaults = agents.defaults as Record<string, unknown>
      if (!ocConfig.plugins) ocConfig.plugins = {}
      const plugins = ocConfig.plugins as Record<string, unknown>
      if (!plugins.entries) plugins.entries = {}

      const existingProviders = models.providers as Record<string, any>
      const newProviders: Record<string, any> = {}

      // 1. Sync models.providers → openclaw.json models.providers
      //    Skip builtin providers (OpenClaw handles them natively)
      for (const [providerName, providerConfig] of Object.entries(modelsConfig.providers)) {
        const providerDef = PROVIDERS.find(p => p.id === providerName)
        if (providerDef?.builtin) continue // Don't write builtin providers to models.providers

        const existing = existingProviders[providerName] || {}
        const ocProvider: Record<string, any> = {}

        // Copy provider-level fields
        if (providerConfig.apiKey) ocProvider.apiKey = providerConfig.apiKey
        if (providerConfig.baseUrl) ocProvider.baseUrl = providerConfig.baseUrl
        if (providerConfig.api) ocProvider.api = providerConfig.api

        // Preserve extra provider-level fields from existing config (e.g. custom settings)
        for (const [key, val] of Object.entries(existing)) {
          if (key !== 'models' && key !== 'apiKey' && key !== 'baseUrl' && key !== 'api') {
            ocProvider[key] = val
          }
        }

        // Convert models: { alias: modelId } (object) → [{ id, name, ... }] (array)
        const existingModels = Array.isArray(existing.models) ? existing.models : []
        const existingModelMap = new Map<string, any>()
        for (const m of existingModels) {
          if (m.id) existingModelMap.set(m.id, m)
        }

        const ocModels: any[] = []
        for (const [, modelId] of Object.entries(providerConfig.models)) {
          const existingModel = existingModelMap.get(modelId)
          if (existingModel) {
            ocModels.push(existingModel)
          } else {
            const catalogModel = providerDef?.catalogModels?.find(m => m.id === modelId)
            if (catalogModel) {
              ocModels.push({
                id: catalogModel.id,
                name: catalogModel.name,
                reasoning: catalogModel.reasoning ?? false,
                input: catalogModel.input ?? ['text'],
                cost: catalogModel.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: catalogModel.contextWindow ?? 128000,
                maxTokens: catalogModel.maxTokens ?? 8192,
              })
            } else {
              ocModels.push({ id: modelId, name: modelId })
            }
          }
        }
        ocProvider.models = ocModels
        newProviders[providerName] = ocProvider
      }

      models.providers = newProviders

      // 2. Sync agents.defaults.model.primary from default ref
      if (modelsConfig.default) {
        const [provider, alias] = modelsConfig.default.split('/')
        const providerConfig = modelsConfig.providers[provider]
        const modelId = providerConfig?.models?.[alias] || alias
        if (!defaults.model) defaults.model = {}
        ;(defaults.model as Record<string, unknown>).primary = `${provider}/${modelId}`
      } else {
        delete defaults.model
      }

      // 3. Build agents.defaults.models — full alias mapping (including builtin providers)
      const modelsMap: Record<string, { alias: string }> = {}
      for (const [providerName, providerConfig] of Object.entries(modelsConfig.providers)) {
        for (const [alias, modelId] of Object.entries(providerConfig.models)) {
          modelsMap[`${providerName}/${modelId}`] = { alias }
        }
      }
      if (Object.keys(modelsMap).length > 0) {
        defaults.models = modelsMap
      } else {
        delete defaults.models
      }

      // 4. Auto-manage plugins based on provider presence
      const entries = plugins.entries as Record<string, unknown>
      if (modelsConfig.providers['minimax'] || modelsConfig.providers['minimax-portal']) {
        entries['minimax-portal-auth'] = { enabled: true }
      } else {
        delete entries['minimax-portal-auth']
      }

      return ocConfig
    })
  } catch {
    // Non-fatal
  }
}

// Resolve env var references like ${VAR_NAME}
// Accepts optional envVars map that includes manually parsed .env file values
function resolveEnvVar(value: string, envVars?: Record<string, string>): string {
  const env = envVars || (process.env as Record<string, string>)
  return value.replace(/\$\{(\w+)\}/g, (_, name) => env[name] || '')
}

// ── Auth Profiles ──────────────────────────────────────────────
// Reads the OpenClaw auth-profiles.json to detect Setup Token / OAuth auth
// per provider. This lets the UI show a unified auth status on each provider card.

interface AuthProfileEntry {
  type: string       // 'token' | 'oauth' | 'api-key'
  provider: string
  token?: string
  email?: string
  expiresAt?: number
}

interface AuthProfilesFile {
  version: number
  profiles: Record<string, AuthProfileEntry>
  lastGood: Record<string, string>
  usageStats: Record<string, unknown>
}

function readAuthProfiles(): AuthProfilesFile | null {
  if (!existsSync(AUTH_PROFILES_PATH)) return null
  try {
    return JSON.parse(readFileSync(AUTH_PROFILES_PATH, 'utf-8'))
  } catch { return null }
}

/** Returns per-provider auth info from auth-profiles.json */
function getAuthProfilesByProvider(): Record<string, {
  profileId: string
  type: string          // 'token' | 'oauth'
  hasToken: boolean
  tokenPreview: string
}> {
  const file = readAuthProfiles()
  if (!file) return {}
  const result: Record<string, { profileId: string; type: string; hasToken: boolean; tokenPreview: string }> = {}
  for (const [id, entry] of Object.entries(file.profiles)) {
    const token = entry.token || ''
    result[entry.provider] = {
      profileId: id,
      type: entry.type || 'token',
      hasToken: !!token,
      tokenPreview: token ? `${token.slice(0, 12)}...${token.slice(-4)}` : '',
    }
  }
  return result
}

/** Determine auth mode for a provider: which method is actually providing credentials.
 *  Priority: auth-profile (token/oauth) > env var > config apiKey template */
function resolveAuthMode(
  providerName: string,
  providerConfig: ProviderConfig,
  authProfiles: ReturnType<typeof getAuthProfilesByProvider>,
  envVars: Record<string, string>,
): { mode: 'setup-token' | 'oauth' | 'env-var' | 'config' | 'none'; detail?: string } {
  // 1. Auth profile (highest priority)
  const profile = authProfiles[providerName]
  if (profile?.hasToken) {
    return { mode: profile.type === 'oauth' ? 'oauth' : 'setup-token', detail: profile.tokenPreview }
  }

  // 2. Environment variable (use combined envVars which includes parsed .env file)
  const resolvedKey = resolveEnvVar(providerConfig.apiKey, envVars)
  if (resolvedKey) {
    // Check if it came from an actual env var (not just a literal in config)
    const envVarMatch = providerConfig.apiKey.match(/\$\{(\w+)\}/)
    if (envVarMatch && envVars[envVarMatch[1]]) {
      return { mode: 'env-var', detail: envVarMatch[1] }
    }
    // Literal key in config
    return { mode: 'config' }
  }

  return { mode: 'none' }
}

/** Read .env file to check which env vars are set */
function readEnvFile(): Record<string, string> {
  const envPath = resolve(PROJECT_ROOT, '.env')
  const vars: Record<string, string> = {}
  if (!existsSync(envPath)) return vars
  try {
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
    }
  } catch (err) { logError('models-api/read-env-file', err) }
  return vars
}

export async function GET() {
  const config = readModels()
  const authProfiles = getAuthProfilesByProvider()
  const envVars = { ...readEnvFile(), ...process.env as Record<string, string> }

  // Build flat model list with resolved info (mask API keys)
  const models: Array<{
    ref: string
    provider: string
    alias: string
    modelId: string
    hasApiKey: boolean
    baseUrl?: string
    isDefault: boolean
  }> = []

  for (const [providerName, provider] of Object.entries(config.providers)) {
    const resolvedKey = resolveEnvVar(provider.apiKey, envVars)
    for (const [alias, modelId] of Object.entries(provider.models)) {
      models.push({
        ref: `${providerName}/${alias}`,
        provider: providerName,
        alias,
        modelId,
        hasApiKey: resolvedKey.length > 0,
        baseUrl: provider.baseUrl,
        isDefault: config.default === `${providerName}/${alias}`,
      })
    }
  }

  // Build providers map with unified auth info
  const providers = Object.fromEntries(
    Object.entries(config.providers).map(([k, v]) => {
      const auth = resolveAuthMode(k, v, authProfiles, envVars)
      const profile = authProfiles[k]
      return [k, {
        ...v,
        apiKey: v.apiKey,
        hasApiKey: auth.mode !== 'none',
        // Unified auth info
        authMode: auth.mode,          // 'setup-token' | 'oauth' | 'env-var' | 'config' | 'none'
        authDetail: auth.detail,      // e.g. token preview or env var name
        // Setup token specific
        hasSetupToken: !!profile?.hasToken,
        setupTokenPreview: profile?.tokenPreview || null,
        setupTokenProfileId: profile?.profileId || null,
      }]
    })
  )

  return NextResponse.json({
    providers,
    models,
    default: config.default,
    // Also return orphan auth profiles (providers with token but not in models.json)
    orphanAuthProfiles: Object.fromEntries(
      Object.entries(authProfiles)
        .filter(([provider]) => !config.providers[provider])
        .map(([provider, info]) => [provider, {
          profileId: info.profileId,
          type: info.type,
          hasToken: info.hasToken,
          tokenPreview: info.tokenPreview,
        }])
    ),
  })
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const config = readModels()

    if (body.action === 'setDefault' && body.ref) {
      config.default = body.ref
    } else if (body.action === 'upsertProvider') {
      const { name, apiKey, baseUrl, api, models } = body.provider
      config.providers[name] = {
        apiKey: apiKey || `\${${name.toUpperCase()}_API_KEY}`,
        ...(baseUrl ? { baseUrl } : {}),
        ...(api ? { api } : {}),
        models: models || {},
      }
    } else if (body.action === 'deleteProvider' && body.name) {
      delete config.providers[body.name]
      // If default was from deleted provider, reset
      if (config.default.startsWith(body.name + '/')) {
        const first = Object.entries(config.providers)[0]
        if (first) {
          const firstModel = Object.keys(first[1].models)[0]
          config.default = `${first[0]}/${firstModel}`
        } else {
          config.default = ''
        }
      }
    } else if (body.action === 'addModel') {
      const { provider, alias, modelId } = body
      if (config.providers[provider]) {
        config.providers[provider].models[alias] = modelId
      }
    } else if (body.action === 'deleteModel') {
      const { provider, alias } = body
      if (config.providers[provider]) {
        delete config.providers[provider].models[alias]
      }
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    await writeModelsAndSync(config)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
