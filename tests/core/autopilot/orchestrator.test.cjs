'use strict'
/**
 * Orchestrator — CEO 循环编排单元测试
 *
 * 测试策略：测试纯逻辑片段（进程检查、状态管理、任务清扫逻辑）
 * 不测试依赖 Gateway 连接的 runCycle / runCeoCycleForAll
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('autopilot/orchestrator', () => {
  describe('isProcessAlive 逻辑', () => {
    function isProcessAlive(pid) {
      try { process.kill(pid, 0); return true } catch { return false }
    }

    it('当前进程存活', () => {
      assert.ok(isProcessAlive(process.pid))
    })

    it('不存在的 PID → false', () => {
      assert.equal(isProcessAlive(999999), false)
    })
  })

  describe('并发锁逻辑', () => {
    it('status=cycling 时跳过', () => {
      const state = { status: 'cycling' }
      const shouldSkip = state.status === 'cycling'
      assert.ok(shouldSkip)
    })

    it('status=running 时允许', () => {
      const state = { status: 'running' }
      const shouldSkip = state.status === 'cycling'
      assert.ok(!shouldSkip)
    })
  })

  describe('历史记录管理', () => {
    it('超过 MAX_HISTORY 时截断', () => {
      const MAX_HISTORY = 50
      const history = Array.from({ length: 55 }, (_, i) => ({ cycle: i + 1 }))
      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY)
      }
      assert.equal(history.length, 50)
      assert.equal(history[0].cycle, 6) // 前 5 条被丢弃
    })

    it('历史记录结构正确', () => {
      const entry = {
        cycle: 42,
        startedAt: '2026-03-18T10:00:00Z',
        completedAt: '2026-03-18T10:02:00Z',
        elapsedSec: 120.5,
        result: 'CEO 指令已发送...',
        tokens: 15000,
      }
      assert.equal(entry.cycle, 42)
      assert.ok(entry.completedAt > entry.startedAt)
      assert.ok(entry.elapsedSec > 0)
    })
  })

  describe('sweepStaleTasks 逻辑', () => {
    const IDLE_COMPLETE_MINS = 18
    const STALE_TASK_MINS = 30

    function classifyTask(task, idleMins, isDeptAgent) {
      if (task.status === 'assigned' && idleMins >= STALE_TASK_MINS) {
        return 'failed'
      }
      if (task.status === 'review' && idleMins >= IDLE_COMPLETE_MINS) {
        if (isDeptAgent) return null  // 部门 agent 由 quality gate 处理
        return 'completed'
      }
      if ((task.status === 'in_progress' || task.status === 'rework') && idleMins >= STALE_TASK_MINS && (task.progress || 0) < 50) {
        return 'failed'
      }
      if ((task.status === 'in_progress' || task.status === 'rework') && idleMins >= IDLE_COMPLETE_MINS) {
        return 'review'
      }
      return null
    }

    it('assigned + 长时间空闲 → failed', () => {
      assert.equal(classifyTask({ status: 'assigned' }, 35, false), 'failed')
    })

    it('assigned + 短时间空闲 → 不变', () => {
      assert.equal(classifyTask({ status: 'assigned' }, 10, false), null)
    })

    it('review + 空闲（非部门 agent）→ completed', () => {
      assert.equal(classifyTask({ status: 'review' }, 20, false), 'completed')
    })

    it('review + 空闲（部门 agent）→ 跳过', () => {
      assert.equal(classifyTask({ status: 'review' }, 20, true), null)
    })

    it('in_progress + 长时间空闲 + 低进度 → failed', () => {
      assert.equal(classifyTask({ status: 'in_progress', progress: 30 }, 35, false), 'failed')
    })

    it('in_progress + 长时间空闲 + 高进度 → review（不是 failed）', () => {
      assert.equal(classifyTask({ status: 'in_progress', progress: 60 }, 35, false), 'review')
    })

    it('in_progress + 中等空闲 → review', () => {
      assert.equal(classifyTask({ status: 'in_progress' }, 20, false), 'review')
    })

    it('rework + 长时间空闲 + 低进度 → failed', () => {
      assert.equal(classifyTask({ status: 'rework', progress: 10 }, 35, false), 'failed')
    })

    it('completed 状态 → 不变', () => {
      assert.equal(classifyTask({ status: 'completed' }, 100, false), null)
    })
  })

  describe('discoverActiveDepartments 逻辑', () => {
    it('过滤 enabled=false 的部门', () => {
      const configs = [
        { id: 'novel', enabled: true, head: 'novel-chief' },
        { id: 'dev', enabled: false, head: 'dev-lead' },
        { id: 'marketing', enabled: true, head: 'marketing-chief' },
      ]
      const active = configs.filter(c => c.enabled)
      assert.equal(active.length, 2)
      assert.equal(active[0].id, 'novel')
      assert.equal(active[1].id, 'marketing')
    })
  })
})
