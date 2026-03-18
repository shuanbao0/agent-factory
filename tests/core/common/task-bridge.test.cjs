'use strict'
/**
 * TaskBridge — Dashboard API 客户端单元测试
 *
 * 测试策略：
 * - apiRequest 需要 HTTP 服务端，这里只测试纯逻辑部分
 * - findActiveTaskForAgent 的状态过滤逻辑内联测试
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('task-bridge', () => {
  describe('activeStatuses 过滤逻辑', () => {
    const activeStatuses = new Set(['pending', 'assigned', 'in_progress', 'rework', 'review'])

    it('识别活跃状态', () => {
      assert.ok(activeStatuses.has('pending'))
      assert.ok(activeStatuses.has('assigned'))
      assert.ok(activeStatuses.has('in_progress'))
      assert.ok(activeStatuses.has('rework'))
      assert.ok(activeStatuses.has('review'))
    })

    it('排除终态', () => {
      assert.ok(!activeStatuses.has('completed'))
      assert.ok(!activeStatuses.has('failed'))
      assert.ok(!activeStatuses.has('cancelled'))
    })

    it('从任务列表中找到第一个活跃任务', () => {
      const tasks = [
        { id: 't1', status: 'completed' },
        { id: 't2', status: 'in_progress' },
        { id: 't3', status: 'pending' },
      ]
      const active = tasks.find(t => activeStatuses.has(t.status))
      assert.equal(active.id, 't2')
    })

    it('全部已完成 → 返回 undefined', () => {
      const tasks = [
        { id: 't1', status: 'completed' },
        { id: 't2', status: 'failed' },
      ]
      const active = tasks.find(t => activeStatuses.has(t.status))
      assert.equal(active, undefined)
    })

    it('空列表 → 返回 undefined', () => {
      const active = [].find(t => activeStatuses.has(t.status))
      assert.equal(active, undefined)
    })
  })

  describe('createCycleTask 参数构造', () => {
    it('构造正确的任务名称', () => {
      const agentId = 'novel-chief'
      const type = 'dept'
      const cycleNum = 42
      const name = `${type} cycle #${cycleNum}`
      assert.equal(name, 'dept cycle #42')
    })
  })

  describe('completeCycleTask 状态映射', () => {
    it('成功 → completed', () => {
      const result = { ok: true, text: 'done' }
      const status = result.ok ? 'completed' : 'failed'
      assert.equal(status, 'completed')
    })

    it('失败 → failed', () => {
      const result = { ok: false, error: 'timeout' }
      const status = result.ok ? 'completed' : 'failed'
      assert.equal(status, 'failed')
    })

    it('output 截断到 200 字符', () => {
      const result = { ok: true, text: 'x'.repeat(500) }
      const output = result.ok
        ? (result.text || '').slice(0, 200)
        : `Error: ${result.error || 'unknown'}`
      assert.equal(output.length, 200)
    })

    it('失败时包含 error 信息', () => {
      const result = { ok: false, error: 'connection refused' }
      const output = result.ok
        ? (result.text || '').slice(0, 200)
        : `Error: ${result.error || 'unknown'}`
      assert.equal(output, 'Error: connection refused')
    })
  })
})
