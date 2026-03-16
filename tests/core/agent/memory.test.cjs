'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('MemoryManager', () => {
  it('exports expected functions', () => {
    const mod = require('../../../core/agent/memory.cjs')
    assert.ok(typeof mod.buildMemoryContext === 'function')
    assert.ok(typeof mod.compressMemory === 'function')
    assert.ok(typeof mod.compressMemoryByRole === 'function')
    assert.ok(typeof mod.extractSummaryFromMemory === 'function')
    assert.ok(typeof mod.extractDecisionEntry === 'function')
    assert.ok(typeof mod.buildSummaryFromResponse === 'function')
  })

  it('extractSummaryFromMemory returns empty for null', () => {
    const { extractSummaryFromMemory } = require('../../../core/agent/memory.cjs')
    assert.equal(extractSummaryFromMemory(null), '')
    assert.equal(extractSummaryFromMemory(''), '')
  })

  it('extractSummaryFromMemory extracts priority sections', () => {
    const { extractSummaryFromMemory } = require('../../../core/agent/memory.cjs')
    const raw = '# Memory\n\n## 当前状态\nAll good\n\n## Other\nStuff\n\n## 关键进展\nBig progress'
    const result = extractSummaryFromMemory(raw)
    assert.ok(result.includes('当前状态'))
    assert.ok(result.includes('关键进展'))
  })

  it('extractDecisionEntry returns null for short response', () => {
    const { extractDecisionEntry } = require('../../../core/agent/memory.cjs')
    assert.equal(extractDecisionEntry('hi', '10:00'), null)
    assert.equal(extractDecisionEntry(null, '10:00'), null)
  })

  it('buildSummaryFromResponse returns null for short response', () => {
    const { buildSummaryFromResponse } = require('../../../core/agent/memory.cjs')
    assert.equal(buildSummaryFromResponse('hi', '2026-03-16'), null)
  })
})
