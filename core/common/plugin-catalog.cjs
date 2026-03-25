'use strict'
/**
 * plugin-catalog.cjs — 读取 openclaw 内置插件目录
 *
 * 直接从 openclaw dist/manifest-registry-*.js 文件解析插件元数据，
 * 避免 spawn CLI 进程（CLI 需 50 秒，文件读取 < 0.2 秒）。
 * 按类别分组后缓存到进程生命周期。
 */
const { readdirSync, readFileSync } = require('fs')
const { resolve, dirname, join } = require('path')
const { existsSync } = require('fs')
const paths = require('./paths.cjs')
const logger = require('./logger.cjs')

let _cache = null

// --- Category classification ---

const GATEWAY_IDS = new Set([
  'openrouter', 'amazon-bedrock', 'github-copilot', 'copilot-proxy',
  'cloudflare-ai-gateway', 'vercel-ai-gateway', 'modelstudio',
  'opencode', 'opencode-go', 'sglang', 'vllm',
])

const SEARCH_IDS = new Set(['brave', 'duckduckgo', 'exa', 'tavily'])
const WEB_IDS = new Set(['firecrawl'])
const VOICE_IDS = new Set(['elevenlabs', 'deepgram', 'voice-call', 'talk-voice'])
const IMAGE_IDS = new Set(['fal'])

// Plugins that run locally / don't need API keys
const NO_KEY_NEEDED = new Set([
  'ollama', 'vllm', 'sglang', 'opencode', 'opencode-go',
  'copilot-proxy', 'duckduckgo', 'memory-core',
])

// Known env var fallbacks for plugins that need API keys
const KNOWN_ENV_VARS = {
  // LLM providers
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  'minimax-portal-auth': ['MINIMAX_API_KEY'],
  kimi: ['MOONSHOT_API_KEY', 'KIMI_CODE_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY'],
  byteplus: ['BYTEPLUS_API_KEY'],
  chutes: ['CHUTES_API_KEY'],
  huggingface: ['HF_TOKEN'],
  kilocode: ['KILOCODE_API_KEY'],
  qwen: ['QWEN_API_KEY'],
  zhipu: ['ZAI_API_KEY'],
  qianfan: ['QIANFAN_API_KEY'],
  xiaomi: ['XIAOMI_API_KEY'],
  venice: ['VENICE_API_KEY'],
  // Gateways / aggregators
  openrouter: ['OPENROUTER_API_KEY'],
  together: ['TOGETHER_API_KEY'],
  nvidia: ['NVIDIA_API_KEY'],
  synthetic: ['SYNTHETIC_API_KEY'],
  'cloudflare-ai-gateway': ['CLOUDFLARE_API_KEY'],
  'amazon-bedrock': ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  // Search / web / voice
  brave: ['BRAVE_API_KEY'],
  firecrawl: ['FIRECRAWL_API_KEY'],
  tavily: ['TAVILY_API_KEY'],
  exa: ['EXA_API_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY'],
  deepgram: ['DEEPGRAM_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  fal: ['FAL_API_KEY'],
  // Memory
  'memory-lancedb': ['OPENAI_API_KEY'],
}

/** Extract env var names from uiHints help text (e.g. "fallback: BRAVE_API_KEY env var") */
function extractEnvVarsFromHints(uiHints) {
  if (!uiHints || typeof uiHints !== 'object') return []
  const vars = new Set()
  const envRe = /\b([A-Z][A-Z0-9_]{2,}_(?:KEY|TOKEN|SECRET))\b|\$\{([A-Z][A-Z0-9_]+)\}/g
  for (const hint of Object.values(uiHints)) {
    const help = hint && hint.help
    if (!help) continue
    let m
    while ((m = envRe.exec(help)) !== null) {
      vars.add(m[1] || m[2])
    }
    const placeholder = hint && hint.placeholder
    if (placeholder && /^\$\{/.test(placeholder)) {
      const inner = placeholder.replace(/^\$\{|\}$/g, '')
      if (inner) vars.add(inner)
    }
  }
  return [...vars]
}

const CATEGORY_ORDER = [
  'memory', 'search', 'web', 'voice', 'image',
  'providers', 'gateway', 'channels', 'tools',
]

function classifyPlugin(p) {
  if (p.kind === 'memory') return 'memory'
  if (SEARCH_IDS.has(p.id)) return 'search'
  if (WEB_IDS.has(p.id)) return 'web'
  if (VOICE_IDS.has(p.id) || (p.speechProviderIds && p.speechProviderIds.length > 0)) return 'voice'
  if (IMAGE_IDS.has(p.id) || (p.imageGenerationProviderIds && p.imageGenerationProviderIds.length > 0)) return 'image'
  if (p.channelIds && p.channelIds.length > 0) return 'channels'
  if (GATEWAY_IDS.has(p.id)) return 'gateway'
  if (p.providerIds && p.providerIds.length > 0) return 'providers'
  return 'tools'
}

// --- Find openclaw dist dir ---

function findOpenClawDist() {
  let dir = paths.PROJECT_ROOT
  for (let i = 0; i < 10; i++) {
    const distDir = join(dir, 'node_modules', 'openclaw', 'dist')
    if (existsSync(distDir)) return distDir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

// --- Read plugin metadata from dist file ---

function readBundledMetadata() {
  const distDir = findOpenClawDist()
  if (!distDir) {
    logger.warn('plugin-catalog', 'openclaw dist dir not found')
    return []
  }

  // Find manifest-registry-*.js
  let registryFile = null
  try {
    const files = readdirSync(distDir)
    registryFile = files.find(f => f.startsWith('manifest-registry-') && f.endsWith('.js'))
  } catch {
    logger.warn('plugin-catalog', 'Failed to scan openclaw dist dir')
    return []
  }

  if (!registryFile) {
    logger.warn('plugin-catalog', 'manifest-registry file not found in openclaw dist')
    return []
  }

  let content
  try {
    content = readFileSync(join(distDir, registryFile), 'utf-8')
  } catch (err) {
    logger.warn('plugin-catalog', 'Failed to read manifest registry', { error: err.message })
    return []
  }

  // Extract BUNDLED_PLUGIN_METADATA array
  const match = content.match(/BUNDLED_PLUGIN_METADATA\s*=\s*(\[[\s\S]*?\n\]);/)
  if (!match) {
    logger.warn('plugin-catalog', 'Failed to extract BUNDLED_PLUGIN_METADATA from registry file')
    return []
  }

  try {
    const fn = new Function('return ' + match[1])
    return fn()
  } catch (err) {
    logger.warn('plugin-catalog', 'Failed to parse BUNDLED_PLUGIN_METADATA', { error: err.message })
    return []
  }
}

// --- Map raw metadata to plugin info ---

function mapPlugin(raw) {
  const m = raw.manifest || {}
  const id = m.id || raw.idHint || ''
  const schema = m.configSchema || {}
  const hasProps = schema.properties && Object.keys(schema.properties).length > 0
  const uiHints = m.uiHints || m.configUiHints || null
  const hasHints = uiHints && Object.keys(uiHints).length > 0

  // Extract provider/channel info from manifest
  const providerIds = m.providers || []
  const channelIds = m.channels || []
  const pkg = raw.packageManifest || {}
  const channelFromPkg = pkg.channel ? [pkg.channel.id] : []

  return {
    id,
    name: raw.packageDescription || raw.packageName || id,
    description: raw.packageDescription || '',
    version: raw.packageVersion || '',
    kind: m.kind || null,
    enabled: false,
    status: 'disabled',
    category: '', // filled later
    configJsonSchema: hasProps ? schema : null,
    configUiHints: hasHints ? uiHints : null,
    providerIds,
    channelIds: channelIds.length > 0 ? channelIds : channelFromPkg,
    webSearchProviderIds: [],
    speechProviderIds: [],
    imageGenerationProviderIds: [],
    envVars: [
      ...new Set([
        ...(KNOWN_ENV_VARS[id] || []),
        ...extractEnvVarsFromHints(uiHints),
        // Auto-infer API key env var for provider/gateway plugins without explicit mapping
        ...(!KNOWN_ENV_VARS[id] && !NO_KEY_NEEDED.has(id) && (providerIds.length > 0 || GATEWAY_IDS.has(id))
          ? [`${id.toUpperCase().replace(/-/g, '_')}_API_KEY`]
          : []),
      ]),
    ],
  }
}

// --- Main API ---

function getPluginCatalog() {
  if (_cache) return _cache

  const rawMetadata = readBundledMetadata()
  const plugins = rawMetadata.map(mapPlugin).filter(p => p.id)

  // Classify
  for (const p of plugins) {
    p.category = classifyPlugin(p)
  }

  // Group by category
  const grouped = {}
  for (const cat of CATEGORY_ORDER) grouped[cat] = []
  for (const p of plugins) {
    if (!grouped[p.category]) grouped[p.category] = []
    grouped[p.category].push(p)
  }

  const categories = CATEGORY_ORDER
    .filter(cat => grouped[cat] && grouped[cat].length > 0)
    .map(cat => ({
      id: cat,
      plugins: grouped[cat].sort((a, b) => a.id.localeCompare(b.id)),
    }))

  _cache = { categories, plugins }
  return _cache
}

function invalidateCache() {
  _cache = null
}

module.exports = { getPluginCatalog, invalidateCache }
