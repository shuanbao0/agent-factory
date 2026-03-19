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

  it('exports extractTaskMemory and loadTaskMemories', () => {
    const mod = require('../../../core/agent/memory.cjs')
    assert.ok(typeof mod.extractTaskMemory === 'function')
    assert.ok(typeof mod.loadTaskMemories === 'function')
  })

  it('extractTaskMemory skips short output', () => {
    const { extractTaskMemory } = require('../../../core/agent/memory.cjs')
    // Should not throw for short/empty input
    extractTaskMemory('test-agent', { id: 'task-1', name: 'Test' }, 'short')
    extractTaskMemory('test-agent', { id: 'task-2', name: 'Test' }, '')
    extractTaskMemory('test-agent', { id: 'task-3', name: 'Test' }, null)
  })

  it('loadTaskMemories returns empty array for non-existent agent', () => {
    const { loadTaskMemories } = require('../../../core/agent/memory.cjs')
    const result = loadTaskMemories('non-existent-agent-xyz')
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 0)
  })

  it('loadTaskMemories respects limit option', () => {
    const { loadTaskMemories } = require('../../../core/agent/memory.cjs')
    const result = loadTaskMemories('non-existent-agent-xyz', { limit: 3 })
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 0)
  })
})
