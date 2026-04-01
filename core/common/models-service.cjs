'use strict'
/**
 * ModelsService — models.json ↔ openclaw.json 同步 + 模型配置业务逻辑
 *
 * 从 ui/src/app/api/models/route.ts 下沉至 core/
 *
 * 依赖注入：惰性 require configRepo、modelsRepo、authProfilesRepo
 */

const logger = require('./logger.cjs')

// Lazy requires to avoid circular dependencies
let _configRepo
function getConfigRepo() {
  if (!_configRepo) _configRepo = require('../repo/config.cjs').configRepo
  return _configRepo
}

let _authProfilesRepo
function getAuthProfilesRepo() {
  if (!_authProfilesRepo) _authProfilesRepo = require('../repo/auth-profiles-repo.cjs').authProfilesRepo
  return _authProfilesRepo
}

/**
 * 解析环境变量引用 ${VAR_NAME}
 * @param {string} value
 * @param {Record<string, string>} [envVars]
 * @returns {string}
 */
function resolveEnvVar(value, envVars) {
  const env = envVars || process.env
  return value.replace(/\$\{(\w+)\}/g, (_, name) => env[name] || '')
}

/**
 * 将 models.json 配置同步到 openclaw.json
 *
 * @param {object} modelsConfig - models.json 内容 { providers, default }
 * @param {Array<{id: string, builtin?: boolean, catalogModels?: Array}>} [providerDefs] - UI 层 PROVIDERS 定义（可选，用于 builtin 过滤和 catalogModel 补全）
 */
function syncOpenClawConfig(modelsConfig, providerDefs) {
  try {
    getConfigRepo().updateConfig((ocConfig) => {
      // Ensure structure exists
      if (!ocConfig.models) ocConfig.models = {}
      const models = ocConfig.models
      if (!models.providers) models.providers = {}
      if (!ocConfig.agents) ocConfig.agents = {}
      const agents = ocConfig.agents
      if (!agents.defaults) agents.defaults = {}
      const defaults = agents.defaults
      if (!ocConfig.plugins) ocConfig.plugins = {}
      const plugins = ocConfig.plugins
      if (!plugins.entries) plugins.entries = {}

      const existingProviders = models.providers
      const newProviders = {}

      // Helper to find provider definition
      const findProviderDef = (name) =>
        providerDefs ? providerDefs.find(p => p.id === name) : null

      // 1. Sync models.providers → openclaw.json models.providers
      for (const [providerName, providerConfig] of Object.entries(modelsConfig.providers)) {
        const providerDef = findProviderDef(providerName)
        if (providerDef && providerDef.builtin && !providerConfig.baseUrl) continue

        const existing = existingProviders[providerName] || {}
        const ocProvider = {}

        if (providerConfig.apiKey) ocProvider.apiKey = providerConfig.apiKey
        if (providerConfig.baseUrl) ocProvider.baseUrl = providerConfig.baseUrl
        if (providerConfig.api) ocProvider.api = providerConfig.api

        // Preserve extra provider-level fields from existing config
        for (const [key, val] of Object.entries(existing)) {
          if (key !== 'models' && key !== 'apiKey' && key !== 'baseUrl' && key !== 'api') {
            ocProvider[key] = val
          }
        }

        // Convert models: { alias: modelId } → [{ id, name, ... }]
        const existingModels = Array.isArray(existing.models) ? existing.models : []
        const existingModelMap = new Map()
        for (const m of existingModels) {
          if (m.id) existingModelMap.set(m.id, m)
        }

        const ocModels = []
        for (const [, modelId] of Object.entries(providerConfig.models)) {
          const existingModel = existingModelMap.get(modelId)
          if (existingModel) {
            ocModels.push(existingModel)
          } else {
            const catalogModel = providerDef && providerDef.catalogModels
              ? providerDef.catalogModels.find(m => m.id === modelId)
              : null
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
        defaults.model.primary = `${provider}/${modelId}`
      } else {
        delete defaults.model
      }

      // 3. Build agents.defaults.models — full alias mapping
      const modelsMap = {}
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
      const entries = plugins.entries
      if (modelsConfig.providers['minimax'] || modelsConfig.providers['minimax-portal']) {
        entries['minimax-portal-auth'] = { enabled: true }
      } else {
        delete entries['minimax-portal-auth']
      }

      return ocConfig
    })
  } catch (err) {
    // Non-fatal
    logger.debug('models-service', 'failed to sync openclaw config', { error: err.message })
  }
}

/**
 * 从 auth-profiles.json 按 provider 分组返回认证信息
 * @returns {Record<string, {profileId: string, type: string, hasToken: boolean, tokenPreview: string}>}
 */
function getAuthProfilesByProvider() {
  const file = getAuthProfilesRepo().readProfiles()
  if (!file) return {}
  const result = {}
  for (const [id, entry] of Object.entries(file.profiles || {})) {
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

/**
 * 判断 provider 的认证模式
 * @param {string} providerName
 * @param {object} providerConfig - { apiKey, ... }
 * @param {object} authProfiles - getAuthProfilesByProvider() 的返回值
 * @param {Record<string, string>} envVars
 * @returns {{ mode: 'setup-token'|'oauth'|'env-var'|'config'|'none', detail?: string }}
 */
function resolveAuthMode(providerName, providerConfig, authProfiles, envVars) {
  const profile = authProfiles[providerName]
  if (profile && profile.hasToken) {
    return { mode: profile.type === 'oauth' ? 'oauth' : 'setup-token', detail: profile.tokenPreview }
  }

  const resolvedKey = resolveEnvVar(providerConfig.apiKey, envVars)
  if (resolvedKey) {
    const envVarMatch = providerConfig.apiKey.match(/\$\{(\w+)\}/)
    if (envVarMatch && envVars[envVarMatch[1]]) {
      return { mode: 'env-var', detail: envVarMatch[1] }
    }
    return { mode: 'config' }
  }

  return { mode: 'none' }
}

/**
 * 构建 flat model 列表（供 API 返回）
 * @param {object} config - models.json 内容
 * @param {Record<string, string>} envVars
 * @returns {Array<{ref, provider, alias, modelId, hasApiKey, baseUrl?, isDefault}>}
 */
function buildModelsListForApi(config, envVars) {
  const models = []
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
  return models
}

/**
 * 构建 providers map（供 API 返回，含 auth 信息）
 * @param {object} config - models.json 内容
 * @param {object} authProfiles
 * @param {Record<string, string>} envVars
 * @returns {Record<string, object>}
 */
function buildProvidersForApi(config, authProfiles, envVars) {
  const providers = {}
  for (const [k, v] of Object.entries(config.providers)) {
    const auth = resolveAuthMode(k, v, authProfiles, envVars)
    const profile = authProfiles[k]
    providers[k] = {
      ...v,
      apiKey: v.apiKey,
      hasApiKey: auth.mode !== 'none',
      authMode: auth.mode,
      authDetail: auth.detail,
      hasSetupToken: !!(profile && profile.hasToken),
      setupTokenPreview: (profile && profile.tokenPreview) || null,
      setupTokenProfileId: (profile && profile.profileId) || null,
    }
  }
  return providers
}

/**
 * 应用 mutation 操作到 models config
 * @param {object} config - models.json 内容（会被修改）
 * @param {object} body - { action, ... }
 * @returns {{ ok: boolean, error?: string, status?: number }}
 */
function applyMutation(config, body) {
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
    const { provider, alias, modelId, baseUrl, api } = body
    if (!config.providers[provider]) {
      config.providers[provider] = {
        apiKey: `\${${provider.toUpperCase()}_API_KEY}`,
        ...(baseUrl ? { baseUrl } : {}),
        ...(api ? { api } : {}),
        models: {},
      }
    }
    config.providers[provider].models[alias] = modelId
  } else if (body.action === 'setBaseUrl') {
    const { provider, baseUrl } = body
    if (!config.providers[provider]) {
      config.providers[provider] = { apiKey: `\${${provider.toUpperCase()}_API_KEY}`, models: {} }
    }
    if (baseUrl) {
      config.providers[provider].baseUrl = baseUrl
    } else {
      delete config.providers[provider].baseUrl
    }
  } else if (body.action === 'deleteModel') {
    const { provider, alias } = body
    if (config.providers[provider]) {
      delete config.providers[provider].models[alias]
    }
  } else {
    return { ok: false, error: 'Unknown action', status: 400 }
  }
  return { ok: true }
}

module.exports = {
  resolveEnvVar,
  syncOpenClawConfig,
  getAuthProfilesByProvider,
  resolveAuthMode,
  buildModelsListForApi,
  buildProvidersForApi,
  applyMutation,
}
