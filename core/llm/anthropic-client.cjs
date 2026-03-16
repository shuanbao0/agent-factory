'use strict'
/**
 * AnthropicClient — Anthropic API 的轻量封装（tool-use 调用）
 *
 * 设计模式：Adapter + Singleton + Circuit Breaker
 *
 * 职责：
 * - 封装 @anthropic-ai/sdk，提供 sendWithTools() 统一接口
 * - 发送带 tool 定义的消息，解析返回的 tool_use 块为结构化数据
 * - 内置熔断器和指数退避重试，应对 API 瞬时故障
 * - 客户端实例懒加载（首次调用时初始化），从环境变量读取 API Key
 *
 * 被 decision-engine.cjs 使用，为 Chief/CEO 决策提供 LLM 能力
 */

const { withRetry, isRetryableError, CircuitBreaker } = require('./retry.cjs')

/** 默认模型 */
const DEFAULT_MODEL = 'claude-sonnet-4-6'
/** 默认最大输出 Token 数 */
const DEFAULT_MAX_TOKENS = 4096

/** 全局共享的熔断器实例（所有 sendWithTools 调用共用） */
const _circuitBreaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 60000 })

/**
 * @typedef {Object} ToolCall
 * @property {string} id    - tool_use 块的唯一 ID
 * @property {string} name  - 工具名称
 * @property {Object} input - 工具输入参数
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} ok           - 是否成功
 * @property {ToolCall[]} toolCalls - 提取的工具调用列表
 * @property {string} text          - 文本内容（text 块拼接）
 * @property {Object} [usage]       - Token 用量 { inputTokens, outputTokens }
 * @property {string} [error]       - 错误信息（失败时）
 * @property {string} [model]       - 实际使用的模型 ID
 */

/** @type {import('@anthropic-ai/sdk').default|null} 懒加载的客户端单例 */
let _clientInstance = null

/**
 * 懒加载 Anthropic SDK 客户端
 * 从环境变量 ANTHROPIC_API_KEY 读取密钥
 */
function getClient() {
  if (_clientInstance) return _clientInstance
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Anthropic = require('@anthropic-ai/sdk')
  _clientInstance = new Anthropic()  // 自动从 ANTHROPIC_API_KEY 环境变量读取
  return _clientInstance
}

/**
 * 发送带 tool 定义的消息到 Anthropic API
 *
 * 流程：熔断器检查 → 指数退避重试 → API 调用 → 解析 tool_use/text 块
 *
 * @param {Object} opts
 * @param {string} opts.system      - 系统提示词
 * @param {string} opts.user        - 用户消息内容
 * @param {Array}  opts.tools       - Anthropic 格式的 tool 定义数组
 * @param {string} [opts.model]     - 模型 ID（默认 claude-sonnet-4-6）
 * @param {number} [opts.maxTokens] - 最大输出 Token
 * @param {number} [opts.temperature] - 采样温度
 * @returns {Promise<SendResult>}
 */
async function sendWithTools({ system, user, tools, model, maxTokens, temperature }) {
  try {
    const response = await _circuitBreaker.execute(() =>
      withRetry(
        () => {
          const client = getClient()
          return client.messages.create({
            model: model || DEFAULT_MODEL,
            max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
            system,
            messages: [{ role: 'user', content: user }],
            tools: tools || [],
            ...(temperature !== undefined ? { temperature } : {}),
          })
        },
        { maxRetries: 3, baseDelayMs: 1000, timeoutMs: 60000, retryOn: isRetryableError }
      )
    )

    // 解析返回内容：提取 tool_use 和 text 块
    const toolCalls = []
    const textParts = []

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input,
        })
      } else if (block.type === 'text') {
        textParts.push(block.text)
      }
    }

    return {
      ok: true,
      toolCalls,
      text: textParts.join('\n'),
      usage: response.usage
        ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
        : undefined,
      model: response.model,
    }
  } catch (err) {
    return {
      ok: false,
      toolCalls: [],
      text: '',
      error: err.message || String(err),
    }
  }
}

/**
 * 重置客户端单例（仅用于测试）
 */
function resetClient() {
  _clientInstance = null
}

module.exports = { sendWithTools, resetClient, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, _circuitBreaker }
