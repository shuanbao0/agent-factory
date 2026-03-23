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
    assert.ok(typeof mod.extractStructuredLeaderMemory === 'function')
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

  describe('extractStructuredLeaderMemory', () => {
    it('parses Chief structured output format', () => {
      const { extractStructuredLeaderMemory } = require('../../../core/agent/memory.cjs')
      const response = `让我分析当前项目状态。Sprint 2 需要优先完成基础设施。

[任务分配]
- ios-developer: 完成 Sprint 2 基础设施
- apple-designer: 设计 UI 原型

[任务完成]
- task-abc: 已完成

[进展汇报]
- Sprint 1 已全部完成
- 团队效率良好

[阻塞项]
- ios-developer 响应延迟`

      const result = extractStructuredLeaderMemory(response)
      assert.ok(result.reasoning.includes('Sprint 2'))
      assert.ok(result.assignments.includes('ios-developer'))
      assert.ok(result.assignments.includes('apple-designer'))
      assert.ok(result.progress.includes('Sprint 1'))
      assert.ok(result.blockers.includes('响应延迟'))
      assert.ok(result.completions.includes('task-abc'))
    })

    it('returns reasoning only for unstructured responses', () => {
      const { extractStructuredLeaderMemory } = require('../../../core/agent/memory.cjs')
      const response = '这是一段没有结构化格式的普通响应文本，包含一些分析和建议。'
      const result = extractStructuredLeaderMemory(response)
      assert.ok(result.reasoning.includes('普通响应文本'))
      assert.equal(result.assignments, '')
      assert.equal(result.progress, '')
      assert.equal(result.blockers, '')
    })

    it('returns empty fields for null/empty input', () => {
      const { extractStructuredLeaderMemory } = require('../../../core/agent/memory.cjs')
      const result = extractStructuredLeaderMemory(null)
      assert.equal(result.reasoning, '')
      assert.equal(result.assignments, '')
    })

    it('skips sections with "无" content', () => {
      const { extractStructuredLeaderMemory } = require('../../../core/agent/memory.cjs')
      const response = `分析完成。
[任务分配]
- agent-a: 写代码
[阻塞项]
- 无`
      const result = extractStructuredLeaderMemory(response)
      assert.ok(result.assignments.includes('agent-a'))
      assert.equal(result.blockers, '')
    })
  })

  it('extractDecisionEntry uses structured extraction for leader responses', () => {
    const { extractDecisionEntry } = require('../../../core/agent/memory.cjs')
    const response = `项目分析：需要加速开发进度。

[任务分配]
- dev-agent: 完成核心功能开发
[任务完成]
- 无
[进展汇报]
- 项目进入第二阶段
[阻塞项]
- 无`
    const entry = extractDecisionEntry(response, '10:30:00')
    assert.ok(entry.includes('#### 10:30:00'))
    assert.ok(entry.includes('加速开发进度'))
    assert.ok(entry.includes('分配:'))
    assert.ok(entry.includes('dev-agent'))
    assert.ok(entry.length <= 1510) // 1500 + header
  })

  it('buildSummaryFromResponse uses structured extraction', () => {
    const { buildSummaryFromResponse } = require('../../../core/agent/memory.cjs')
    const response = `当前状况良好，团队协作顺畅。

[任务分配]
- agent-a: 任务1
[任务完成]
- 无
[进展汇报]
- 完成了核心模块开发
- 测试覆盖率达到 80%
[阻塞项]
- 无`
    const summary = buildSummaryFromResponse(response, '2026-03-23')
    assert.ok(summary.includes('Last updated: 2026-03-23'))
    assert.ok(summary.includes('团队协作顺畅'))
    assert.ok(summary.includes('进展:'))
    assert.ok(summary.includes('核心模块开发'))
  })
})
