'use strict'
/**
 * DepartmentLoop — 部门循环逻辑单元测试
 * （从 core/autopilot/department-loop.test.cjs 迁移，更新 require 路径）
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('department-loop', () => {
  // sessionResetCooldowns removed — Chief sessions are now stateless (killed after each cycle)

  describe('gateErrorCounts Map cleanup', () => {
    it('removes stale error entries', () => {
      const gateErrorCounts = new Map()
      const ERROR_TTL = 86400_000 // 24h

      gateErrorCounts.set('task-old', { count: 3, lastError: Date.now() - 172800_000 })
      gateErrorCounts.set('task-new', { count: 1, lastError: Date.now() - 1000 })

      const now = Date.now()
      for (const [key, entry] of gateErrorCounts) {
        if (now - (entry.lastError || 0) > ERROR_TTL) gateErrorCounts.delete(key)
      }

      assert.equal(gateErrorCounts.size, 1)
      assert.ok(gateErrorCounts.has('task-new'))
      assert.ok(!gateErrorCounts.has('task-old'))
    })
  })

  describe('parseTaskAssignments logic', () => {
    it('extracts agent-task pairs from structured text', () => {
      const text = `[状态总结]
一切正常

[任务分配]
- novel-writer: 继续写第三章 (peer-send 已发送)
- novel-editor：检查第二章质量

[下一步]
等待结果`

      const match = text.match(/\[任务分配\]\s*\n([\s\S]*?)(?=\n\[|$)/)
      assert.ok(match)
      const lines = match[1].split('\n')
      const assignments = []
      for (const line of lines) {
        const m = line.match(/^[-*]\s*(\S+?)[:\uff1a]\s*(.+?)(?:\s*[\(\uff08].*[\)\uff09])?\s*$/)
        if (m) {
          assignments.push({ agentId: m[1], summary: m[2] })
        }
      }

      assert.equal(assignments.length, 2)
      assert.equal(assignments[0].agentId, 'novel-writer')
      assert.ok(assignments[0].summary.includes('继续写第三章'))
      assert.equal(assignments[1].agentId, 'novel-editor')
    })

    it('returns empty array for text without assignment section', () => {
      const text = 'No assignments here'
      const match = text.match(/\[任务分配\]\s*\n([\s\S]*?)(?=\n\[|$)/)
      assert.equal(match, null)
    })
  })

  describe('noResponseCounts accumulation (dual-session)', () => {
    it('accumulates and resets no-response counts', () => {
      const noResponseCounts = new Map()
      const MAX_NO_RESPONSE_COUNT = 2

      const count1 = (noResponseCounts.get('agent-a') || 0) + 1
      noResponseCounts.set('agent-a', count1)
      assert.equal(count1, 1)
      assert.ok(count1 < MAX_NO_RESPONSE_COUNT)

      const count2 = (noResponseCounts.get('agent-a') || 0) + 1
      noResponseCounts.set('agent-a', count2)
      assert.equal(count2, 2)
      assert.ok(count2 >= MAX_NO_RESPONSE_COUNT)

      noResponseCounts.delete('agent-a')
      assert.equal(noResponseCounts.get('agent-a'), undefined)
    })

    it('tracks counts independently per agent', () => {
      const noResponseCounts = new Map()

      noResponseCounts.set('agent-a', 1)
      noResponseCounts.set('agent-b', 2)

      assert.equal(noResponseCounts.get('agent-a'), 1)
      assert.equal(noResponseCounts.get('agent-b'), 2)
    })
  })

  describe('isDualSessionEnabled', () => {
    it('returns true by default (dual-session is on by default)', () => {
      const { isDualSessionEnabled } = require('../../../core/autopilot/constants.cjs')
      const result = isDualSessionEnabled('random-dept')
      assert.equal(result, true)
    })

    it('strips **bold** markdown from agent IDs', () => {
      const text = `[任务分配]
- **novel-writer**: 继续写第三章
- **novel-editor**：校对第二章`

      const match = text.match(/\[任务分配\]\s*\n([\s\S]*?)(?=\n\[|$)/)
      assert.ok(match)
      const lines = match[1].split('\n')
      const assignments = []
      for (const line of lines) {
        const m = line.match(/^[-*]\s*(\S+?)[:\uff1a]\s*(.+?)(?:\s*[\(\uff08].*[\)\uff09])?\s*$/)
        if (m) {
          const agentId = m[1].replace(/\*+/g, '')
          assignments.push({ agentId, summary: m[2] })
        }
      }

      assert.equal(assignments.length, 2)
      assert.equal(assignments[0].agentId, 'novel-writer')
      assert.equal(assignments[1].agentId, 'novel-editor')
    })
  })
})
