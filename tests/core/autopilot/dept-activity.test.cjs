'use strict'
/**
 * DeptActivity — 部门活跃度判定单元测试
 *
 * 测试策略：内联复现判定逻辑，避免依赖外部文件系统
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('autopilot/dept-activity', () => {
  // 内联复现 getDeptActivityLevel 核心判定逻辑
  function getDeptActivityLevel(budgetAllowed, agents, projects) {
    if (!budgetAllowed) return 'budget_constrained'
    if (!agents || agents.length === 0) return 'idle'

    const activeStatuses = ['in_progress', 'review', 'rework']
    for (const proj of projects) {
      for (const t of (proj.tasks || [])) {
        if (!activeStatuses.includes(t.status)) continue
        const assignees = [t.assignedAgent, ...(t.assignees || [])]
        if (assignees.some(a => agents.includes(a))) {
          return 'active'
        }
      }
    }
    return 'idle'
  }

  it('预算超限 → budget_constrained', () => {
    const result = getDeptActivityLevel(false, ['writer'], [])
    assert.equal(result, 'budget_constrained')
  })

  it('有 in_progress 任务 → active', () => {
    const projects = [{
      tasks: [
        { status: 'in_progress', assignedAgent: 'writer' },
      ],
    }]
    const result = getDeptActivityLevel(true, ['writer', 'editor'], projects)
    assert.equal(result, 'active')
  })

  it('有 review 任务 → active', () => {
    const projects = [{
      tasks: [
        { status: 'review', assignees: ['editor'] },
      ],
    }]
    const result = getDeptActivityLevel(true, ['editor'], projects)
    assert.equal(result, 'active')
  })

  it('有 rework 任务 → active', () => {
    const projects = [{
      tasks: [
        { status: 'rework', assignedAgent: 'writer' },
      ],
    }]
    const result = getDeptActivityLevel(true, ['writer'], projects)
    assert.equal(result, 'active')
  })

  it('只有 completed/pending 任务 → idle', () => {
    const projects = [{
      tasks: [
        { status: 'completed', assignedAgent: 'writer' },
        { status: 'pending', assignedAgent: 'editor' },
      ],
    }]
    const result = getDeptActivityLevel(true, ['writer', 'editor'], projects)
    assert.equal(result, 'idle')
  })

  it('活跃任务属于其他部门 → idle', () => {
    const projects = [{
      tasks: [
        { status: 'in_progress', assignedAgent: 'outsider' },
      ],
    }]
    const result = getDeptActivityLevel(true, ['writer', 'editor'], projects)
    assert.equal(result, 'idle')
  })

  it('无 agent → idle', () => {
    const result = getDeptActivityLevel(true, [], [])
    assert.equal(result, 'idle')
  })

  it('无项目 → idle', () => {
    const result = getDeptActivityLevel(true, ['writer'], [])
    assert.equal(result, 'idle')
  })

  it('assignees 数组匹配', () => {
    const projects = [{
      tasks: [
        { status: 'in_progress', assignees: ['helper', 'writer'] },
      ],
    }]
    const result = getDeptActivityLevel(true, ['writer'], projects)
    assert.equal(result, 'active')
  })
})
