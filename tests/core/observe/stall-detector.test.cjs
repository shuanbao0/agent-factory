'use strict'
/**
 * StallDetector — 停滞检测单元测试
 *
 * 测试策略：内联复现检测逻辑，验证任务/部门级停滞判定
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('stall-detector', () => {
  describe('detectStalls 逻辑', () => {
    // 内联复现 detectStalls 核心算法
    function detectStalls(history) {
      const stalls = []
      if (history.length < 3) return stalls

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

      for (const [taskRef, count] of Object.entries(taskMentions)) {
        if (count >= 3) {
          stalls.push({
            taskId: taskRef,
            taskName: taskRef,
            stalledCycles: count,
            suggestion: 'Task mentioned in 3+ consecutive cycles. Consider: reassigning, splitting into subtasks, or changing approach.',
          })
        }
      }
      return stalls
    }

    it('检测到连续 3 轮提及的任务 → 标记为停滞', () => {
      const history = [
        { result: '处理 [task-001] 进度缓慢' },
        { result: '继续 [task-001] 遇到阻塞' },
        { result: '[task-001] 仍未解决' },
      ]
      const stalls = detectStalls(history)
      assert.equal(stalls.length, 1)
      assert.equal(stalls[0].taskId, 'task-001')
      assert.equal(stalls[0].stalledCycles, 3)
    })

    it('不同任务被提及 → 不报停滞', () => {
      const history = [
        { result: '[task-001] ok' },
        { result: '[task-002] ok' },
        { result: '[task-003] ok' },
      ]
      const stalls = detectStalls(history)
      assert.equal(stalls.length, 0)
    })

    it('历史不足 3 轮 → 返回空', () => {
      const history = [
        { result: '[task-001]' },
        { result: '[task-001]' },
      ]
      const stalls = detectStalls(history)
      assert.equal(stalls.length, 0)
    })

    it('只看最近 3 轮', () => {
      const history = [
        { result: '[task-old]' },
        { result: '[task-old]' },
        { result: '[task-old]' },
        { result: '[task-new] started' },
        { result: '[task-new] working' },
        { result: '[task-new] done' },
      ]
      const stalls = detectStalls(history)
      // task-new 出现 3 次
      assert.equal(stalls.length, 1)
      assert.equal(stalls[0].taskId, 'task-new')
    })

    it('result 为空 → 不崩溃', () => {
      const history = [
        { result: '' },
        { result: '' },
        { result: '' },
      ]
      const stalls = detectStalls(history)
      assert.equal(stalls.length, 0)
    })
  })

  describe('detectDepartmentStall 逻辑', () => {
    function detectDepartmentStall(history) {
      if (history.length < 3) return { stalled: false }

      const recent = history.slice(-3)
      const results = recent.map(h => h.result || '')
      if (results.every(r => r === results[0]) && results[0].length > 0) {
        return { stalled: true, reason: `Last 3 cycles produced identical results: "${results[0].slice(0, 100)}..."` }
      }
      if (recent.every(h => (h.result || '').startsWith('Error:'))) {
        return { stalled: true, reason: 'Last 3 cycles all resulted in errors' }
      }
      return { stalled: false }
    }

    it('连续 3 轮相同结果 → 停滞', () => {
      const history = [
        { result: '无进展' },
        { result: '无进展' },
        { result: '无进展' },
      ]
      const result = detectDepartmentStall(history)
      assert.equal(result.stalled, true)
      assert.ok(result.reason.includes('identical results'))
    })

    it('连续 3 轮错误 → 停滞', () => {
      const history = [
        { result: 'Error: connection failed' },
        { result: 'Error: timeout' },
        { result: 'Error: 503' },
      ]
      const result = detectDepartmentStall(history)
      assert.equal(result.stalled, true)
      assert.ok(result.reason.includes('errors'))
    })

    it('正常运行 → 不停滞', () => {
      const history = [
        { result: '完成任务 A' },
        { result: '开始任务 B' },
        { result: '任务 B 进行中' },
      ]
      const result = detectDepartmentStall(history)
      assert.equal(result.stalled, false)
    })

    it('历史不足 3 轮 → 不停滞', () => {
      const result = detectDepartmentStall([{ result: 'ok' }])
      assert.equal(result.stalled, false)
    })

    it('3 轮空结果 → 不停滞（空字符串不触发 identical）', () => {
      const history = [
        { result: '' },
        { result: '' },
        { result: '' },
      ]
      const result = detectDepartmentStall(history)
      assert.equal(result.stalled, false)
    })
  })
})
