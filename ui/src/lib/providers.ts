// --- Auth Method Types ---
export type AuthMethodApiKey = { type: 'apiKey'; envKey: string; placeholder: string; label?: string }
export type AuthMethodApiKeyPair = { type: 'apiKeyPair'; fields: { envKey: string; label: string; placeholder: string; required?: boolean }[] }
export type AuthMethodSetupToken = { type: 'setupToken'; provider: string; command: string; tokenPrefix: string }
export type AuthMethodOAuth = { type: 'oauth'; provider: string; desc: string; descZh: string }
export type AuthMethodBaseUrl = { type: 'baseUrl'; envKey: string; placeholder: string; defaultValue: string; label?: string }

export type AuthMethod = AuthMethodApiKey | AuthMethodApiKeyPair | AuthMethodSetupToken | AuthMethodOAuth | AuthMethodBaseUrl

export interface CatalogModel {
  id: string
  name: string
  alias: string
  reasoning?: boolean
  input?: ('text' | 'image')[]
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number }
  contextWindow?: number
  maxTokens?: number
}

export interface ProviderDef {
  id: string
  name: string
  desc: string
  color: string
  api?: string          // API protocol: "anthropic-messages" | "openai-completions" | "ollama" | etc.
  baseUrl?: string      // Fixed base URL for custom providers
  builtin?: boolean     // true = OpenClaw handles natively, don't write to models.providers
  catalogModels?: CatalogModel[]
  authMethods: AuthMethod[]
}

export const PROVIDERS: ProviderDef[] = [
  // ─── Tier 1: Built-in Providers (managed by OpenClaw natively) ───
  {
    id: 'anthropic',
    name: 'Anthropic',
    desc: 'Claude Opus / Sonnet / Haiku',
    color: 'bg-orange-500/20 text-orange-400',
    builtin: true,
    catalogModels: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', alias: 'opus', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 32000 },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', alias: 'sonnet', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 16000 },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', alias: 'sonnet-45', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 16000 },
      { id: 'claude-haiku', name: 'Claude Haiku', alias: 'haiku', reasoning: false, input: ['text', 'image'], contextWindow: 200000, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-...' },
      { type: 'setupToken', provider: 'anthropic', command: 'claude setup-token', tokenPrefix: 'sk-ant-oat01-' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    desc: 'GPT-4o / o1 / o3',
    color: 'bg-green-500/20 text-green-400',
    builtin: true,
    catalogModels: [
      { id: 'gpt-4o', name: 'GPT-4o', alias: 'gpt4o', reasoning: false, input: ['text', 'image'], contextWindow: 128000, maxTokens: 16384 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', alias: 'gpt4o-mini', reasoning: false, input: ['text', 'image'], contextWindow: 128000, maxTokens: 16384 },
      { id: 'o1', name: 'o1', alias: 'o1', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 100000 },
      { id: 'o3-mini', name: 'o3 Mini', alias: 'o3-mini', reasoning: true, input: ['text'], contextWindow: 200000, maxTokens: 100000 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'OPENAI_API_KEY', placeholder: 'sk-...' },
      { type: 'setupToken', provider: 'openai', command: 'openclaw setup-token openai', tokenPrefix: 'sk-oat-' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    desc: '多模型聚合路由',
    color: 'bg-purple-500/20 text-purple-400',
    builtin: true,
    authMethods: [
      { type: 'apiKey', envKey: 'OPENROUTER_API_KEY', placeholder: 'sk-or-...' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    desc: '本地模型 (Llama / Qwen / Gemma)',
    color: 'bg-gray-500/20 text-gray-400',
    builtin: true,
    authMethods: [
      { type: 'baseUrl', envKey: 'OLLAMA_BASE_URL', placeholder: 'http://localhost:11434', defaultValue: 'http://localhost:11434', label: 'Ollama Base URL' },
    ],
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    desc: '通过 Copilot 代理访问模型',
    color: 'bg-slate-500/20 text-slate-400',
    builtin: true,
    authMethods: [
      { type: 'setupToken', provider: 'github-copilot', command: 'openclaw setup-token github-copilot', tokenPrefix: 'ghu_' },
    ],
  },

  // ─── Tier 2: Custom Providers (need baseUrl + api in openclaw.json) ───
  {
    id: 'deepseek',
    name: 'DeepSeek',
    desc: 'DeepSeek V3 / R1',
    color: 'bg-blue-500/20 text-blue-400',
    baseUrl: 'https://api.deepseek.com',
    api: 'openai-completions',
    catalogModels: [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', alias: 'deepseek-v3', reasoning: false, input: ['text'], contextWindow: 64000, maxTokens: 8192 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', alias: 'deepseek-r1', reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'DEEPSEEK_API_KEY', placeholder: 'sk-...' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    desc: 'MiniMax M2.7 / M2.5 / M2.1 / VL',
    color: 'bg-pink-500/20 text-pink-400',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    api: 'anthropic-messages',
    catalogModels: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', alias: 'M2.7', reasoning: true, input: ['text'], cost: { input: 12, output: 48, cacheRead: 1.5, cacheWrite: 6 }, contextWindow: 204800, maxTokens: 16384 },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed', alias: 'M2.7-highspeed', reasoning: true, input: ['text'], cost: { input: 12, output: 48, cacheRead: 1.5, cacheWrite: 6 }, contextWindow: 204800, maxTokens: 16384 },
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', alias: 'M2.5', reasoning: true, input: ['text'], cost: { input: 12, output: 48, cacheRead: 1.5, cacheWrite: 6 }, contextWindow: 200000, maxTokens: 16384 },
      { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 Highspeed', alias: 'M2.5-highspeed', reasoning: true, input: ['text'], cost: { input: 12, output: 48, cacheRead: 1.5, cacheWrite: 6 }, contextWindow: 200000, maxTokens: 16384 },
      { id: 'MiniMax-M2.1', name: 'MiniMax M2.1', alias: 'M2.1', reasoning: false, input: ['text'], cost: { input: 15, output: 60, cacheRead: 2, cacheWrite: 10 }, contextWindow: 200000, maxTokens: 8192 },
      { id: 'MiniMax-M2.1-highspeed', name: 'MiniMax M2.1 Highspeed', alias: 'M2.1-highspeed', reasoning: false, input: ['text'], cost: { input: 15, output: 60, cacheRead: 2, cacheWrite: 10 }, contextWindow: 200000, maxTokens: 8192 },
      { id: 'MiniMax-VL-01', name: 'MiniMax VL-01 (Vision)', alias: 'VL-01', reasoning: false, input: ['text', 'image'], cost: { input: 15, output: 60, cacheRead: 2, cacheWrite: 10 }, contextWindow: 200000, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'MINIMAX_API_KEY', placeholder: 'sk-...' },
      { type: 'oauth', provider: 'minimax', desc: 'MiniMax Coding Plan OAuth', descZh: 'MiniMax Coding Plan OAuth 授权' },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot (月之暗面)',
    desc: 'Kimi K2.5 / K2 系列',
    color: 'bg-violet-500/20 text-violet-400',
    baseUrl: 'https://api.moonshot.ai/v1',
    api: 'openai-completions',
    catalogModels: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5', alias: 'k2.5', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 256000, maxTokens: 8192 },
      { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', alias: 'k2-thinking', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 256000, maxTokens: 8192 },
      { id: 'kimi-k2-thinking-turbo', name: 'Kimi K2 Thinking Turbo', alias: 'k2-thinking-turbo', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 256000, maxTokens: 8192 },
      { id: 'kimi-k2-0905-preview', name: 'Kimi K2 Preview', alias: 'k2-preview', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 256000, maxTokens: 8192 },
      { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo Preview', alias: 'k2-turbo', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 256000, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'MOONSHOT_API_KEY', placeholder: 'sk-...', label: 'Moonshot API Key' },
      { type: 'apiKey', envKey: 'KIMI_CODE_API_KEY', placeholder: 'sk-...', label: 'Kimi Code API Key (alternative)' },
    ],
  },
  {
    id: 'venice',
    name: 'Venice.ai',
    desc: '隐私优先 AI 平台 (多模型)',
    color: 'bg-cyan-500/20 text-cyan-400',
    baseUrl: 'https://api.venice.ai/api/v1',
    api: 'openai-completions',
    catalogModels: [
      { id: 'deepseek-v3.2', name: 'DeepSeek V3.2', alias: 'deepseek-v3.2', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
      { id: 'qwen3-235b-a22b-thinking-2507', name: 'Qwen3 235B Thinking', alias: 'qwen3-thinking', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
      { id: 'qwen3-235b-a22b-instruct-2507', name: 'Qwen3 235B Instruct', alias: 'qwen3-instruct', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', alias: 'llama-3.3', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
      { id: 'hermes-3-llama-3.1-405b', name: 'Hermes 3 Llama 405B', alias: 'hermes-405b', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
      { id: 'mistral-31-24b', name: 'Mistral 31 24B (Vision)', alias: 'mistral-31', reasoning: false, input: ['text', 'image'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'VENICE_API_KEY', placeholder: 'vapi_...' },
    ],
  },
  {
    id: 'qwen',
    name: 'Qwen (通义千问)',
    desc: 'Qwen Coder / Vision',
    color: 'bg-indigo-500/20 text-indigo-400',
    baseUrl: 'https://portal.qwen.ai/v1',
    api: 'openai-completions',
    catalogModels: [
      { id: 'coder-model', name: 'Qwen Coder', alias: 'coder', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
      { id: 'vision-model', name: 'Qwen Vision', alias: 'vision', reasoning: false, input: ['text', 'image'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'QWEN_API_KEY', placeholder: 'sk-...' },
      { type: 'oauth', provider: 'qwen', desc: 'Free OAuth via Alibaba Cloud', descZh: '通过阿里云免费 OAuth 授权' },
    ],
  },
  {
    id: 'glm',
    name: 'GLM (智谱)',
    desc: 'GLM-5 / GLM-4.7 多模态',
    color: 'bg-emerald-500/20 text-emerald-400',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    api: 'openai-completions',
    catalogModels: [
      { id: 'glm-5', name: 'GLM-5', alias: 'glm5', reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 8192 },
      { id: 'glm-4.7', name: 'GLM-4.7', alias: 'glm47', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'ZAI_API_KEY', placeholder: 'sk-...' },
    ],
  },
  {
    id: 'qianfan',
    name: 'Qianfan (百度千帆)',
    desc: 'ERNIE-Bot / DeepSeek',
    color: 'bg-red-500/20 text-red-400',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    api: 'openai-completions',
    catalogModels: [
      { id: 'deepseek-v3.2', name: 'DeepSeek V3.2', alias: 'deepseek', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 98304, maxTokens: 32768 },
      { id: 'ernie-5.0-thinking-preview', name: 'ERNIE 5.0 Thinking', alias: 'ernie5', reasoning: true, input: ['text', 'image'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 119000, maxTokens: 64000 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'QIANFAN_API_KEY', placeholder: 'sk-...' },
    ],
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi (小米)',
    desc: 'MiMo V2 Flash',
    color: 'bg-amber-500/20 text-amber-400',
    baseUrl: 'https://api.xiaomimimo.com/anthropic',
    api: 'anthropic-messages',
    catalogModels: [
      { id: 'mimo-v2-flash', name: 'MiMo V2 Flash', alias: 'mimo', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'XIAOMI_API_KEY', placeholder: 'sk-...' },
    ],
  },

  // ─── Tier 3: Aggregator / Cloud Providers ───
  {
    id: 'together',
    name: 'Together AI',
    desc: '开源模型推理平台',
    color: 'bg-teal-500/20 text-teal-400',
    baseUrl: 'https://api.together.xyz/v1',
    api: 'openai-completions',
    catalogModels: [
      { id: 'moonshotai/Kimi-K2.5', name: 'Kimi K2.5', alias: 'kimi-k2.5', reasoning: true, input: ['text', 'image'], cost: { input: 0.5, output: 2.8, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 32768 },
      { id: 'zai-org/GLM-4.7', name: 'GLM-4.7', alias: 'glm-4.7', reasoning: false, input: ['text'], cost: { input: 0.45, output: 2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 202752, maxTokens: 8192 },
      { id: 'deepseek-ai/DeepSeek-V3.1', name: 'DeepSeek V3.1', alias: 'deepseek-v3.1', reasoning: false, input: ['text'], cost: { input: 0.6, output: 1.25, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', alias: 'deepseek-r1', reasoning: true, input: ['text'], cost: { input: 3, output: 7, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', alias: 'llama-3.3-70b', reasoning: false, input: ['text'], cost: { input: 0.88, output: 0.88, cacheRead: 0, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 8192 },
      { id: 'meta-llama/Llama-4-Scout-17B', name: 'Llama 4 Scout 17B', alias: 'llama-4-scout', reasoning: false, input: ['text', 'image'], cost: { input: 0.18, output: 0.59, cacheRead: 0, cacheWrite: 0 }, contextWindow: 524288, maxTokens: 8192 },
      { id: 'meta-llama/Llama-4-Maverick', name: 'Llama 4 Maverick', alias: 'llama-4-maverick', reasoning: false, input: ['text', 'image'], cost: { input: 0.27, output: 0.85, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1048576, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'TOGETHER_API_KEY', placeholder: 'sk-...' },
    ],
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    desc: 'NVIDIA 推理微服务',
    color: 'bg-lime-500/20 text-lime-400',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    api: 'openai-completions',
    catalogModels: [
      { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B', alias: 'nemotron-70b', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 4096 },
      { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', alias: 'llama-3.3', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 4096 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'NVIDIA_API_KEY', placeholder: 'nvapi-...' },
    ],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    desc: '开源模型推理路由',
    color: 'bg-yellow-500/20 text-yellow-400',
    baseUrl: 'https://router.huggingface.co/v1',
    api: 'openai-completions',
    catalogModels: [
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', alias: 'deepseek-r1', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
      { id: 'deepseek-ai/DeepSeek-V3.1', name: 'DeepSeek V3.1', alias: 'deepseek-v3.1', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B', alias: 'llama-3.3', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'HF_TOKEN', placeholder: 'hf_...' },
    ],
  },
  {
    id: 'synthetic',
    name: 'Synthetic',
    desc: '开源模型 Anthropic 协议代理',
    color: 'bg-fuchsia-500/20 text-fuchsia-400',
    baseUrl: 'https://api.synthetic.new/anthropic',
    api: 'anthropic-messages',
    catalogModels: [
      { id: 'hf:MiniMaxAI/MiniMax-M2.1', name: 'MiniMax M2.1', alias: 'minimax-m2.1', reasoning: false, input: ['text'], contextWindow: 192000, maxTokens: 65536 },
      { id: 'hf:moonshotai/Kimi-K2-Thinking', name: 'Kimi K2 Thinking', alias: 'kimi-k2-thinking', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 8192 },
      { id: 'hf:zai-org/GLM-4.7', name: 'GLM-4.7', alias: 'glm-4.7', reasoning: false, input: ['text'], contextWindow: 198000, maxTokens: 128000 },
      { id: 'hf:deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2', alias: 'deepseek-v3.2', reasoning: false, input: ['text'], contextWindow: 159000, maxTokens: 8192 },
      { id: 'hf:Qwen3-VL-235B', name: 'Qwen3 VL 235B', alias: 'qwen3-vl', reasoning: false, input: ['text', 'image'], contextWindow: 128000, maxTokens: 8192 },
      { id: 'hf:zai-org/GLM-5', name: 'GLM-5', alias: 'glm-5', reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 8192 },
    ],
    authMethods: [
      { type: 'apiKey', envKey: 'SYNTHETIC_API_KEY', placeholder: 'sk-...' },
    ],
  },
  {
    id: 'vllm',
    name: 'vLLM',
    desc: '本地 vLLM 推理服务',
    color: 'bg-stone-500/20 text-stone-400',
    baseUrl: 'http://127.0.0.1:8000/v1',
    api: 'openai-completions',
    authMethods: [
      { type: 'baseUrl', envKey: 'VLLM_BASE_URL', placeholder: 'http://127.0.0.1:8000/v1', defaultValue: 'http://127.0.0.1:8000/v1', label: 'vLLM Base URL' },
    ],
  },

  // ─── Tier 4: Special / Cloud Gateway ───
  {
    id: 'bedrock',
    name: 'AWS Bedrock',
    desc: 'Claude / Titan / Llama via AWS',
    color: 'bg-yellow-500/20 text-yellow-400',
    builtin: true,
    authMethods: [
      {
        type: 'apiKeyPair', fields: [
          { envKey: 'AWS_ACCESS_KEY_ID', label: 'Access Key ID', placeholder: 'AKIA...', required: true },
          { envKey: 'AWS_SECRET_ACCESS_KEY', label: 'Secret Access Key', placeholder: 'wJalr...', required: true },
          { envKey: 'AWS_REGION', label: 'Region', placeholder: 'us-east-1', required: false },
        ],
      },
    ],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare AI Gateway',
    desc: 'AI Gateway 代理 + 缓存',
    color: 'bg-orange-600/20 text-orange-300',
    authMethods: [
      {
        type: 'apiKeyPair', fields: [
          { envKey: 'CLOUDFLARE_API_KEY', label: 'API Key', placeholder: 'sk-...', required: true },
          { envKey: 'CLOUDFLARE_ACCOUNT_ID', label: 'Account ID', placeholder: 'abc123...', required: true },
          { envKey: 'CLOUDFLARE_GATEWAY_ID', label: 'Gateway ID', placeholder: 'my-gateway', required: true },
        ],
      },
    ],
  },
]
