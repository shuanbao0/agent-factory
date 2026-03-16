'use strict'
/**
 * Anthropic Client — thin wrapper over @anthropic-ai/sdk for tool-use calls.
 *
 * Provides a single `sendWithTools()` function that sends a message with tool
 * definitions and returns structured tool calls.  Used by chief-decision-engine
 * to get structured decisions without going through OpenClaw Gateway.
 */

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 4096

/**
 * @typedef {Object} ToolCall
 * @property {string} id       - tool_use block id
 * @property {string} name     - tool name
 * @property {Object} input    - parsed arguments
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} ok
 * @property {ToolCall[]} toolCalls
 * @property {string} text           - concatenated text blocks (if any)
 * @property {Object} [usage]        - { inputTokens, outputTokens }
 * @property {string} [error]
 * @property {string} [model]
 */

let _clientInstance = null

/**
 * Lazy-init Anthropic client.  Reads ANTHROPIC_API_KEY from env.
 * @returns {import('@anthropic-ai/sdk').default}
 */
function getClient() {
  if (_clientInstance) return _clientInstance
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Anthropic = require('@anthropic-ai/sdk')
  _clientInstance = new Anthropic()  // reads ANTHROPIC_API_KEY from env
  return _clientInstance
}

/**
 * Send a message to Anthropic API with tool definitions.
 *
 * @param {Object} opts
 * @param {string} opts.system          - system prompt
 * @param {string} opts.user            - user message content
 * @param {Array}  opts.tools           - tool definitions (Anthropic format)
 * @param {string} [opts.model]         - model id (default: claude-sonnet-4-6)
 * @param {number} [opts.maxTokens]     - max output tokens
 * @param {number} [opts.temperature]   - sampling temperature
 * @returns {Promise<SendResult>}
 */
async function sendWithTools({ system, user, tools, model, maxTokens, temperature }) {
  try {
    const client = getClient()
    const response = await client.messages.create({
      model: model || DEFAULT_MODEL,
      max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
      tools: tools || [],
      ...(temperature !== undefined ? { temperature } : {}),
    })

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
 * Reset the cached client instance (for testing).
 */
function resetClient() {
  _clientInstance = null
}

module.exports = { sendWithTools, resetClient, DEFAULT_MODEL, DEFAULT_MAX_TOKENS }
