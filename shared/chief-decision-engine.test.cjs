'use strict'
const { describe, it, beforeEach, afterEach, mock } = require('node:test')
const assert = require('node:assert/strict')

// We'll mock sendWithTools at the module level
let mockSendWithTools

describe('chief-decision-engine', () => {
  let makeChiefDecision, makeCeoDecision
  const mockLogger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn(),
    debug: mock.fn(),
  }

  beforeEach(() => {
    // Reset mocks
    mockLogger.info.mock.resetCalls()
    mockLogger.warn.mock.resetCalls()
    mockLogger.error.mock.resetCalls()
    mockLogger.debug.mock.resetCalls()

    // Mock anthropic-client
    mockSendWithTools = mock.fn()
    const clientPath = require.resolve('./anthropic-client.cjs')
    delete require.cache[clientPath]
    require.cache[clientPath] = {
      id: clientPath,
      filename: clientPath,
      loaded: true,
      exports: { sendWithTools: mockSendWithTools, resetClient: () => {} },
    }

    // Re-require decision engine
    const enginePath = require.resolve('./chief-decision-engine.cjs')
    delete require.cache[enginePath]
    const engine = require('./chief-decision-engine.cjs')
    makeChiefDecision = engine.makeChiefDecision
    makeCeoDecision = engine.makeCeoDecision
  })

  afterEach(() => {
    const clientPath = require.resolve('./anthropic-client.cjs')
    delete require.cache[clientPath]
    const enginePath = require.resolve('./chief-decision-engine.cjs')
    delete require.cache[enginePath]
  })

  describe('makeChiefDecision', () => {
    it('returns structured decisions from tool calls', async () => {
      mockSendWithTools.mock.mockImplementation(async () => ({
        ok: true,
        toolCalls: [
          { id: 'tu_1', name: 'assign_task', input: { agentId: 'novel-writer', taskSummary: 'Write ch1' } },
          { id: 'tu_2', name: 'complete_task', input: { taskId: 'task-abc123' } },
        ],
        text: '',
        usage: { inputTokens: 500, outputTokens: 200 },
        model: 'claude-sonnet-4-6',
      }))

      const result = await makeChiefDecision('test directive', 'novel', { logger: mockLogger })

      assert.equal(result.ok, true)
      assert.equal(result.decisions.length, 2)
      assert.equal(result.decisions[0].tool, 'assign_task')
      assert.equal(result.decisions[0].input.agentId, 'novel-writer')
      assert.equal(result.decisions[1].tool, 'complete_task')
      assert.equal(result.decisions[1].input.taskId, 'task-abc123')
    })

    it('handles no_action decision', async () => {
      mockSendWithTools.mock.mockImplementation(async () => ({
        ok: true,
        toolCalls: [
          { id: 'tu_1', name: 'no_action', input: { reason: 'All agents busy' } },
        ],
        text: '',
        usage: { inputTokens: 300, outputTokens: 50 },
      }))

      const result = await makeChiefDecision('test directive', 'novel', { logger: mockLogger })

      assert.equal(result.ok, true)
      assert.equal(result.decisions.length, 1)
      assert.equal(result.decisions[0].tool, 'no_action')
      assert.equal(result.decisions[0].input.reason, 'All agents busy')
    })

    it('filters out invalid tool calls', async () => {
      mockSendWithTools.mock.mockImplementation(async () => ({
        ok: true,
        toolCalls: [
          { id: 'tu_1', name: 'assign_task', input: { taskSummary: 'no agentId!' } }, // missing agentId
          { id: 'tu_2', name: 'complete_task', input: { taskId: 'task-ok' } }, // valid
        ],
        text: '',
        usage: { inputTokens: 300, outputTokens: 100 },
      }))

      const result = await makeChiefDecision('test', 'novel', { logger: mockLogger })

      assert.equal(result.ok, true)
      assert.equal(result.decisions.length, 1) // only the valid one
      assert.equal(result.decisions[0].tool, 'complete_task')
      // Should have logged a warning for the invalid one
      assert.ok(mockLogger.warn.mock.calls.length > 0)
    })

    it('returns error when API fails', async () => {
      mockSendWithTools.mock.mockImplementation(async () => ({
        ok: false,
        toolCalls: [],
        text: '',
        error: 'Network timeout',
      }))

      const result = await makeChiefDecision('test', 'novel', { logger: mockLogger })

      assert.equal(result.ok, false)
      assert.equal(result.decisions.length, 0)
      assert.match(result.error, /Network timeout/)
    })

    it('includes usage and model in result', async () => {
      mockSendWithTools.mock.mockImplementation(async () => ({
        ok: true,
        toolCalls: [],
        text: 'status ok',
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: 'claude-sonnet-4-6',
      }))

      const result = await makeChiefDecision('test', 'novel', { logger: mockLogger })

      assert.equal(result.ok, true)
      assert.equal(result.usage.inputTokens, 1000)
      assert.equal(result.model, 'claude-sonnet-4-6')
      assert.equal(result.text, 'status ok')
    })
  })

  describe('makeCeoDecision', () => {
    it('returns CEO decisions', async () => {
      mockSendWithTools.mock.mockImplementation(async () => ({
        ok: true,
        toolCalls: [
          { id: 'tu_1', name: 'issue_directive', input: { department: 'novel', directive: 'Speed up' } },
          { id: 'tu_2', name: 'escalate_issue', input: { issue: 'Budget exceeded', severity: 'high' } },
        ],
        text: '',
        usage: { inputTokens: 800, outputTokens: 300 },
      }))

      const result = await makeCeoDecision('test', { logger: mockLogger })

      assert.equal(result.ok, true)
      assert.equal(result.decisions.length, 2)
      assert.equal(result.decisions[0].tool, 'issue_directive')
      assert.equal(result.decisions[1].tool, 'escalate_issue')
    })

    it('handles CEO no_action', async () => {
      mockSendWithTools.mock.mockImplementation(async () => ({
        ok: true,
        toolCalls: [
          { id: 'tu_1', name: 'no_action', input: { reason: 'Everything nominal' } },
        ],
        text: '',
        usage: { inputTokens: 200, outputTokens: 30 },
      }))

      const result = await makeCeoDecision('test', { logger: mockLogger })

      assert.equal(result.ok, true)
      assert.equal(result.decisions.length, 1)
      assert.equal(result.decisions[0].tool, 'no_action')
    })
  })
})
