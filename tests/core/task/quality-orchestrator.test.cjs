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
})
