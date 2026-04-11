'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { QualityOrchestrator } = require('../../../core/task/quality-orchestrator.cjs')

describe('QualityOrchestrator', () => {
  it('exports QualityOrchestrator class', () => {
    assert.ok(QualityOrchestrator)
    assert.equal(typeof QualityOrchestrator, 'function')
  })

  it('selectReviewer returns null when no candidates', () => {
    const orch = new QualityOrchestrator({
      sendFn: async () => ({ ok: false }),
      readAgentActivity: () => ({}),
      loadDeptConfig: () => ({ agents: ['writer-a'], head: 'chief' }),
    })
    const reviewer = orch.selectReviewer('novel', { assignedAgent: 'writer-a' }, { agents: ['writer-a'], head: 'chief' })
    assert.equal(reviewer, null)
  })

  it('selectReviewer picks most idle candidate', () => {
    const orch = new QualityOrchestrator({
      sendFn: async () => ({ ok: false }),
      readAgentActivity: () => ({
        'writer-b': { idleMins: 5 },
        'writer-c': { idleMins: 20 },
      }),
      loadDeptConfig: () => null,
    })
    const reviewer = orch.selectReviewer('novel',
      { assignedAgent: 'writer-a' },
      { agents: ['writer-a', 'writer-b', 'writer-c'], head: 'chief' }
    )
    assert.equal(reviewer, 'writer-c')
  })

  it('process passes through when no config', async () => {
    const orch = new QualityOrchestrator({
      sendFn: async () => ({ ok: false }),
      loadDeptConfig: () => null,
    })
    const result = await orch.process('unknown', { id: 't1' })
    assert.equal(result.passed, true)
  })

  describe('_requestSelfCheck hard validation', () => {
    function makeOrch({ sendFn, readTaskOutput } = {}) {
      return new QualityOrchestrator({
        sendFn: sendFn || (async () => ({ ok: true, text: 'SCORE: 85\nPASSED: true\nISSUES: none' })),
        readAgentActivity: () => ({}),
        loadDeptConfig: () => ({ id: 'test-dept', head: 'chief', agents: ['writer-a'] }),
        readTaskOutput: readTaskOutput || (() => 'x'.repeat(1000)),
        logger: { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} },
      })
    }

    it('empty task.output fails self-check (regression: phantom tasks could pass)', async () => {
      // Previously: empty `output` skipped hard validation entirely, so LLM
      // would grade a task with no product and often gave high scores.
      const orch = makeOrch()
      const result = await orch._requestSelfCheck('writer-a', { id: 't1', name: 'phantom', output: '' }, 'test-dept')
      assert.equal(result.passed, false)
      assert.equal(result.score, 0)
      assert.match(String(result.checklist[0]), /产出为空/)
    })

    it('missing file path still fails with clear message', async () => {
      const orch = makeOrch({ readTaskOutput: () => null })
      const result = await orch._requestSelfCheck('writer-a',
        { id: 't1', name: 'test', output: '/nope/missing.md' }, 'test-dept')
      assert.equal(result.passed, false)
      assert.equal(result.score, 0)
      assert.match(String(result.checklist[0]), /产出文件不存在/)
    })

    it('short output fails with length message', async () => {
      const orch = makeOrch({ readTaskOutput: () => 'short' })
      const result = await orch._requestSelfCheck('writer-a',
        { id: 't1', name: 'test', output: '/some/file.md' }, 'test-dept')
      assert.equal(result.passed, false)
      assert.equal(result.score, 0)
      assert.match(String(result.checklist[0]), /仅\s*5\s*字符/)
    })

    it('valid multi-path output with good content proceeds to LLM self-check', async () => {
      const orch = makeOrch({
        readTaskOutput: () => 'A'.repeat(800),
        sendFn: async () => ({ ok: true, text: 'SCORE: 92\nPASSED: true\nISSUES: none' }),
      })
      const result = await orch._requestSelfCheck('writer-a',
        { id: 't1', name: 'test', type: 'writing', output: '/a.md, /b.md' }, 'test-dept')
      assert.equal(result.passed, true)
      assert.equal(result.score, 92)
    })
  })
})
