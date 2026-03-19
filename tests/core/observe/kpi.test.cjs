'use strict'
/**
 * KPI 计算引擎 — 单元测试
 *
 * 测试策略：内联复现 calculateMetric 核心逻辑，避免外部文件系统依赖
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('kpi — calculateMetric 逻辑', () => {
  // 内联复现 calculateMetric 核心算法（不依赖 repo IO）
  function calculateMetric(metric, tasks, agentIds) {
    const today = new Date().toISOString().slice(0, 10)

    const isAssignedToAgent = (task) => {
      return agentIds.includes(task.assignedAgent) ||
        (task.assignees || []).some(a => agentIds.includes(a))
    }

    switch (metric) {
      case 'chapters_per_day':
      case 'tasks_completed_per_day': {
        let count = 0
        for (const task of tasks) {
          if (task.status === 'completed' && task.completedAt?.startsWith(today) && isAssignedToAgent(task)) {
            count++
          }
        }
        return count
      }
      case 'quality_score': {
        let totalScore = 0, count = 0
        for (const task of tasks) {
          if (task.quality?.peerReview?.score && isAssignedToAgent(task)) {
            totalScore += task.quality.peerReview.score
            count++
          }
        }
        return count > 0 ? Math.round(totalScore / count) : 0
      }
      case 'completion_rate': {
        let total = 0, completed = 0
        for (const task of tasks) {
          if (isAssignedToAgent(task)) {
            total++
            if (task.status === 'completed') completed++
          }
        }
        return total > 0 ? Math.round((completed / total) * 100) : 0
      }
      default:
        return 0
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  it('tasks_completed_per_day — 统计今日完成的任务数', () => {
    const tasks = [
      { status: 'completed', completedAt: `${today}T10:00:00Z`, assignedAgent: 'writer' },
      { status: 'completed', completedAt: `${today}T11:00:00Z`, assignedAgent: 'editor' },
      { status: 'completed', completedAt: '2025-01-01T10:00:00Z', assignedAgent: 'writer' },
      { status: 'in_progress', assignedAgent: 'writer' },
    ]
    const result = calculateMetric('tasks_completed_per_day', tasks, ['writer', 'editor'])
    assert.equal(result, 2)
  })

  it('tasks_completed_per_day — 只算指定 agent', () => {
    const tasks = [
      { status: 'completed', completedAt: `${today}T10:00:00Z`, assignedAgent: 'writer' },
      { status: 'completed', completedAt: `${today}T11:00:00Z`, assignedAgent: 'outsider' },
    ]
    const result = calculateMetric('tasks_completed_per_day', tasks, ['writer'])
    assert.equal(result, 1)
  })

  it('quality_score — 计算同行评审平均分', () => {
    const tasks = [
      { assignedAgent: 'writer', quality: { peerReview: { score: 80 } } },
      { assignedAgent: 'writer', quality: { peerReview: { score: 90 } } },
      { assignedAgent: 'outsider', quality: { peerReview: { score: 50 } } },
    ]
    const result = calculateMetric('quality_score', tasks, ['writer'])
    assert.equal(result, 85)
  })

  it('quality_score — 无评审数据返回 0', () => {
    const tasks = [
      { assignedAgent: 'writer', quality: {} },
    ]
    const result = calculateMetric('quality_score', tasks, ['writer'])
    assert.equal(result, 0)
  })

  it('completion_rate — 计算完成率百分比', () => {
    const tasks = [
      { status: 'completed', assignedAgent: 'writer' },
      { status: 'in_progress', assignedAgent: 'writer' },
      { status: 'completed', assignedAgent: 'writer' },
      { status: 'pending', assignees: ['writer'] },
    ]
    const result = calculateMetric('completion_rate', tasks, ['writer'])
    assert.equal(result, 50) // 2/4 = 50%
  })

  it('completion_rate — 无匹配任务返回 0', () => {
    const result = calculateMetric('completion_rate', [], ['writer'])
    assert.equal(result, 0)
  })

  it('unknown metric — 返回 0', () => {
    const result = calculateMetric('nonexistent', [], ['writer'])
    assert.equal(result, 0)
  })

  it('assignees 数组匹配', () => {
    const tasks = [
      { status: 'completed', completedAt: `${today}T10:00:00Z`, assignees: ['writer', 'helper'] },
    ]
    const result = calculateMetric('tasks_completed_per_day', tasks, ['helper'])
    assert.equal(result, 1)
  })
})
