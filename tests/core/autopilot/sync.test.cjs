'use strict'
/**
 * Sync — 项目状态同步单元测试
 * （从 core/autopilot/sync.test.cjs 迁移）
 */
const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync, readFileSync, rmSync } = require('fs')
const { join } = require('path')

const TEST_DIR = join(__dirname, '..', '..', '..', '_test_sync_tmp')

describe('sync', () => {
  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }) } catch {}
  })

  describe('project status detection logic', () => {
    it('detects all tasks completed → status=completed', () => {
      const meta = {
        status: 'in-progress',
        currentPhase: 1,
        totalPhases: 3,
        tasks: [
          { id: 't1', status: 'completed' },
          { id: 't2', status: 'completed' },
        ],
      }

      const allDone = meta.tasks.length > 0 && meta.tasks.every(t => t.status === 'completed')
      const anyRunning = meta.tasks.some(t => t.status === 'in_progress')

      if (allDone) {
        meta.status = 'completed'
        meta.currentPhase = meta.totalPhases || meta.currentPhase
      }

      assert.equal(meta.status, 'completed')
      assert.equal(meta.currentPhase, 3)
    })

    it('detects any task in_progress → status=in-progress', () => {
      const meta = {
        status: 'planning',
        tasks: [
          { id: 't1', status: 'completed' },
          { id: 't2', status: 'in_progress' },
        ],
      }

      const allDone = meta.tasks.length > 0 && meta.tasks.every(t => t.status === 'completed')
      const anyRunning = meta.tasks.some(t => t.status === 'in_progress')

      if (allDone) meta.status = 'completed'
      else if (anyRunning) meta.status = 'in-progress'

      assert.equal(meta.status, 'in-progress')
    })

    it('keeps status when no tasks match criteria', () => {
      const meta = {
        status: 'planning',
        tasks: [
          { id: 't1', status: 'pending' },
        ],
      }

      const allDone = meta.tasks.length > 0 && meta.tasks.every(t => t.status === 'completed')
      const anyRunning = meta.tasks.some(t => t.status === 'in_progress')

      if (allDone) meta.status = 'completed'
      else if (anyRunning) meta.status = 'in-progress'

      assert.equal(meta.status, 'planning')
    })
  })

  describe('blocker extraction logic', () => {
    it('extracts blockers from CEO memory', () => {
      const memory = `# Memory

## 🚨 需要用户决策
- 需要确认预算
- 需要选择技术栈
- 需要审批方案

## 其他内容
不相关
`
      const blockers = []
      const blockerMatch = memory.match(/## 🚨 需要用户决策\n([\s\S]*?)(?=\n## |\n$|$)/)
      if (blockerMatch) {
        const lines = blockerMatch[1].trim().split('\n')
        for (const line of lines) {
          const cleaned = line.replace(/^[-*]\s*/, '').trim()
          if (cleaned.length > 0) blockers.push(cleaned)
        }
      }

      assert.equal(blockers.length, 3)
      assert.equal(blockers[0], '需要确认预算')
      assert.equal(blockers[1], '需要选择技术栈')
    })

    it('returns empty array when no blocker section', () => {
      const memory = '# Memory\n## Summary\nAll good'
      const blockers = []
      const blockerMatch = memory.match(/## 🚨 需要用户决策\n([\s\S]*?)(?=\n## |\n$|$)/)
      if (blockerMatch) {
        const lines = blockerMatch[1].trim().split('\n')
        for (const line of lines) {
          const cleaned = line.replace(/^[-*]\s*/, '').trim()
          if (cleaned.length > 0) blockers.push(cleaned)
        }
      }
      assert.equal(blockers.length, 0)
    })
  })
})
