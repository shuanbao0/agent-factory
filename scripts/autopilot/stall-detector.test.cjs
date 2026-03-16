'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('stall-detector', () => {
  describe('detectStalls logic', () => {
    it('returns empty when history is too short', () => {
      const history = [{ result: 'ok' }, { result: 'ok' }]
      assert.ok(history.length < 3)
    })

    it('detects tasks mentioned in 3+ consecutive cycles', () => {
      const history = [
        { result: 'Working on [task-alpha] and [task-beta]' },
        { result: 'Still working on [task-alpha] and [task-gamma]' },
        { result: 'Continuing [task-alpha] and checking [task-delta]' },
      ]

      const recent = history.slice(-3)
      const taskMentions = {}
      for (const entry of recent) {
        const result = entry.result || ''
        const mentions = result.match(/\[([^\]]+)\]/g) || []
        for (const mention of mentions) {
          const taskRef = mention.replace(/[\[\]]/g, '')
          taskMentions[taskRef] = (taskMentions[taskRef] || 0) + 1
        }
      }

      const stalls = []
      for (const [taskRef, count] of Object.entries(taskMentions)) {
        if (count >= 3) {
          stalls.push({ taskId: taskRef, stalledCycles: count })
        }
      }

      assert.equal(stalls.length, 1)
      assert.equal(stalls[0].taskId, 'task-alpha')
      assert.equal(stalls[0].stalledCycles, 3)
    })

    it('does not report tasks mentioned fewer than 3 times', () => {
      const history = [
        { result: '[task-a] started' },
        { result: '[task-b] started' },
        { result: '[task-c] started' },
      ]

      const recent = history.slice(-3)
      const taskMentions = {}
      for (const entry of recent) {
        const mentions = (entry.result || '').match(/\[([^\]]+)\]/g) || []
        for (const mention of mentions) {
          const taskRef = mention.replace(/[\[\]]/g, '')
          taskMentions[taskRef] = (taskMentions[taskRef] || 0) + 1
        }
      }

      const stalls = Object.entries(taskMentions).filter(([, count]) => count >= 3)
      assert.equal(stalls.length, 0)
    })
  })

  describe('detectDepartmentStall logic', () => {
    it('returns not stalled when history is short', () => {
      const history = [{ result: 'ok' }]
      assert.ok(history.length < 3)
    })

    it('detects identical results as stalled', () => {
      const history = [
        { result: 'Waiting for input from user' },
        { result: 'Waiting for input from user' },
        { result: 'Waiting for input from user' },
      ]

      const recent = history.slice(-3)
      const results = recent.map(h => h.result || '')
      const allSame = results.every(r => r === results[0]) && results[0].length > 0
      assert.ok(allSame)
    })

    it('detects all-error cycles as stalled', () => {
      const history = [
        { result: 'Error: connection timeout' },
        { result: 'Error: gateway unavailable' },
        { result: 'Error: API rate limit' },
      ]

      const recent = history.slice(-3)
      const allErrors = recent.every(h => (h.result || '').startsWith('Error:'))
      assert.ok(allErrors)
    })

    it('returns not stalled when results differ', () => {
      const history = [
        { result: 'Completed task A' },
        { result: 'Completed task B' },
        { result: 'Completed task C' },
      ]

      const recent = history.slice(-3)
      const results = recent.map(h => h.result || '')
      const allSame = results.every(r => r === results[0])
      const allErrors = recent.every(h => (h.result || '').startsWith('Error:'))
      assert.ok(!allSame)
      assert.ok(!allErrors)
    })
  })
})
