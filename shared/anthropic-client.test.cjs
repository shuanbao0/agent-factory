'use strict'
const { describe, it, beforeEach, afterEach, mock } = require('node:test')
const assert = require('node:assert/strict')

// Mock @anthropic-ai/sdk before requiring the module
const mockCreate = mock.fn()

// We need to mock the require of @anthropic-ai/sdk
// Since anthropic-client.cjs uses lazy init, we can mock via Module._cache
const Module = require('module')
const originalResolveFilename = Module._resolveFilename

describe('anthropic-client', () => {
  let sendWithTools, resetClient

  beforeEach(() => {
    // Intercept require('@anthropic-ai/sdk') to return our mock
    Module._resolveFilename = function (request, parent, isMain, options) {
      if (request === '@anthropic-ai/sdk') {
        // Return a fake path that we'll handle
        return '@anthropic-ai/sdk'
      }
      return originalResolveFilename.call(this, request, parent, isMain, options)
    }

    // Pre-populate require cache with mock
    const mockModule = { exports: class MockAnthropic {
      constructor() {}
      get messages() {
        return { create: mockCreate }
      }
    }}
    require.cache['@anthropic-ai/sdk'] = {
      id: '@anthropic-ai/sdk',
      filename: '@anthropic-ai/sdk',
      loaded: true,
      exports: mockModule.exports,
    }

    // Clear and re-require anthropic-client
    const clientPath = require.resolve('./anthropic-client.cjs')
    delete require.cache[clientPath]
    const client = require('./anthropic-client.cjs')
    sendWithTools = client.sendWithTools
    resetClient = client.resetClient
    resetClient()
    mockCreate.mock.resetCalls()
  })

  afterEach(() => {
    Module._resolveFilename = originalResolveFilename
    delete require.cache['@anthropic-ai/sdk']
    resetClient?.()
  })

  it('returns tool calls from API response', async () => {
    mockCreate.mock.mockImplementation(async () => ({
      content: [
        { type: 'tool_use', id: 'tu_1', name: 'assign_task', input: { agentId: 'writer', taskSummary: 'Write ch1' } },
        { type: 'text', text: 'Here is my plan' },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
      model: 'claude-sonnet-4-6',
    }))

    const result = await sendWithTools({
      system: 'test system',
      user: 'test user',
      tools: [],
    })

    assert.equal(result.ok, true)
    assert.equal(result.toolCalls.length, 1)
    assert.equal(result.toolCalls[0].name, 'assign_task')
    assert.equal(result.toolCalls[0].input.agentId, 'writer')
    assert.equal(result.text, 'Here is my plan')
    assert.equal(result.usage.inputTokens, 100)
    assert.equal(result.usage.outputTokens, 50)
  })

  it('returns error on API failure', async () => {
    mockCreate.mock.mockImplementation(async () => {
      throw new Error('API rate limit exceeded')
    })

    const result = await sendWithTools({
      system: 'test',
      user: 'test',
      tools: [],
    })

    assert.equal(result.ok, false)
    assert.equal(result.toolCalls.length, 0)
    assert.match(result.error, /rate limit/)
  })

  it('handles multiple tool calls', async () => {
    mockCreate.mock.mockImplementation(async () => ({
      content: [
        { type: 'tool_use', id: 'tu_1', name: 'assign_task', input: { agentId: 'a', taskSummary: 'T1' } },
        { type: 'tool_use', id: 'tu_2', name: 'complete_task', input: { taskId: 'task-abc' } },
        { type: 'tool_use', id: 'tu_3', name: 'no_action', input: { reason: 'idle' } },
      ],
      usage: { input_tokens: 200, output_tokens: 100 },
      model: 'claude-sonnet-4-6',
    }))

    const result = await sendWithTools({ system: '', user: '', tools: [] })
    assert.equal(result.ok, true)
    assert.equal(result.toolCalls.length, 3)
    assert.equal(result.toolCalls[0].name, 'assign_task')
    assert.equal(result.toolCalls[1].name, 'complete_task')
    assert.equal(result.toolCalls[2].name, 'no_action')
  })

  it('handles response with no tool calls', async () => {
    mockCreate.mock.mockImplementation(async () => ({
      content: [{ type: 'text', text: 'No action needed' }],
      usage: { input_tokens: 50, output_tokens: 10 },
      model: 'claude-sonnet-4-6',
    }))

    const result = await sendWithTools({ system: '', user: '', tools: [] })
    assert.equal(result.ok, true)
    assert.equal(result.toolCalls.length, 0)
    assert.equal(result.text, 'No action needed')
  })
})
