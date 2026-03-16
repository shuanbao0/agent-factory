'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('department-loop', () => {
  describe('sessionResetCooldowns Map cleanup', () => {
    it('removes expired cooldown entries', () => {
      const sessionResetCooldowns = new Map()
      const COOLDOWN_TTL = 3600_000 // 1h

      // Add an expired entry (2 hours ago)
      sessionResetCooldowns.set('agent:test:main', Date.now() - 7200_000)
      // Add a recent entry (30 seconds ago)
      sessionResetCooldowns.set('agent:test:other', Date.now() - 30_000)

      // Cleanup
      const now = Date.now()
      for (const [key, ts] of sessionResetCooldowns) {
        if (now - ts > COOLDOWN_TTL) sessionResetCooldowns.delete(key)
      }

      assert.equal(sessionResetCooldowns.size, 1)
      assert.ok(sessionResetCooldowns.has('agent:test:other'))
      assert.ok(!sessionResetCooldowns.has('agent:test:main'))
    })

    it('preserves all entries within TTL', () => {
      const sessionResetCooldowns = new Map()
      const COOLDOWN_TTL = 3600_000

      sessionResetCooldowns.set('a', Date.now() - 1000)
      sessionResetCooldowns.set('b', Date.now() - 2000)

      const now = Date.now()
      for (const [key, ts] of sessionResetCooldowns) {
        if (now - ts > COOLDOWN_TTL) sessionResetCooldowns.delete(key)
      }

      assert.equal(sessionResetCooldowns.size, 2)
    })
  })

  describe('gateErrorCounts Map cleanup', () => {
    it('removes stale error entries', () => {
      const gateErrorCounts = new Map()
      const ERROR_TTL = 86400_000 // 24h

      // Add a stale entry (2 days ago)
      gateErrorCounts.set('task-old', { count: 3, lastError: Date.now() - 172800_000 })
      // Add a recent entry
      gateErrorCounts.set('task-new', { count: 1, lastError: Date.now() - 1000 })

      // Cleanup
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
