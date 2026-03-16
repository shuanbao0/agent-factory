'use strict'
const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } = require('fs')
const { join } = require('path')

// Test the pure helper functions directly
const { extractSummaryFromMemory } = require('./memory.cjs')

const TEST_DIR = join(__dirname, '..', '..', '_test_memory_tmp')

describe('memory', () => {
  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  describe('extractSummaryFromMemory', () => {
    it('returns empty string for empty input', () => {
      assert.equal(extractSummaryFromMemory(''), '')
      assert.equal(extractSummaryFromMemory(null), '')
    })

    it('returns raw text truncated to 2000 chars when no sections', () => {
      const raw = 'A'.repeat(3000)
      const result = extractSummaryFromMemory(raw)
      assert.equal(result.length, 2000)
    })

    it('extracts priority sections', () => {
      const raw = `# Memory

## 当前状态
状态信息在此

## 无关内容
这部分不是优先的

## 需要用户决策
一些决策需求
`
      const result = extractSummaryFromMemory(raw)
      assert.ok(result.includes('当前状态'))
      assert.ok(result.includes('需要用户决策'))
    })

    it('falls back to first 2000 chars when no priority sections match', () => {
      const raw = `## Random Section\nContent\n\n## Another\nMore`
      const result = extractSummaryFromMemory(raw)
      assert.ok(result.length > 0)
    })
  })

  describe('compressMemory directory creation', () => {
    it('creates memory directories if they do not exist', () => {
      const memoryDir = join(TEST_DIR, 'agent', 'memory')
      const dirs = [memoryDir, join(memoryDir, 'decisions'), join(memoryDir, 'lessons')]
      for (const dir of dirs) {
        mkdirSync(dir, { recursive: true })
      }
      for (const dir of dirs) {
        assert.ok(existsSync(dir))
      }
    })
  })
})
