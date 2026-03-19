'use strict'
/**
 * TaskPrompt — Worker session 提示词构建单元测试
 * （从 core/autopilot/task-prompt.test.cjs 迁移，更新 require 路径）
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('task-prompt', () => {
  it('exports buildTaskPrompt function', () => {
    const mod = require('../../../core/autopilot/task-prompt.cjs')
    assert.ok(typeof mod.buildTaskPrompt === 'function')
  })

  it('buildTaskPrompt includes task ID and name', () => {
    const { buildTaskPrompt } = require('../../../core/autopilot/task-prompt.cjs')
    const task = { id: 'task-abc123', name: '写第一章', type: 'writing', description: '完成第一章的初稿' }
    const prompt = buildTaskPrompt('test-agent', task)
    assert.ok(prompt.includes('task-abc123'))
    assert.ok(prompt.includes('写第一章'))
    assert.ok(prompt.includes('完成第一章的初稿'))
  })

  it('buildTaskPrompt includes quality standard from strategy', () => {
    const { buildTaskPrompt } = require('../../../core/autopilot/task-prompt.cjs')
    const task = { id: 'task-001', name: 'Test', type: 'writing' }
    const prompt = buildTaskPrompt('test-agent', task)
    // writing strategy has minPassingScore: 70
    assert.ok(prompt.includes('70'))
  })

  it('buildTaskPrompt includes rework info when reworkCount > 0', () => {
    const { buildTaskPrompt } = require('../../../core/autopilot/task-prompt.cjs')
    const task = {
      id: 'task-002', name: 'Test', type: 'writing',
      reworkCount: 2,
      quality: {
        peerReview: { feedback: '需要改进情节连贯性' },
        selfCheck: { score: 65 },
      },
    }
    const prompt = buildTaskPrompt('test-agent', task)
    assert.ok(prompt.includes('第 2 次返工'))
    assert.ok(prompt.includes('需要改进情节连贯性'))
    assert.ok(prompt.includes('65'))
  })

  it('buildTaskPrompt omits rework section when reworkCount is 0', () => {
    const { buildTaskPrompt } = require('../../../core/autopilot/task-prompt.cjs')
    const task = { id: 'task-003', name: 'Test', type: 'coding', reworkCount: 0 }
    const prompt = buildTaskPrompt('test-agent', task)
    assert.ok(!prompt.includes('返工信息'))
  })

  it('buildTaskPrompt uses fallback strategy for unknown type', () => {
    const { buildTaskPrompt } = require('../../../core/autopilot/task-prompt.cjs')
    const task = { id: 'task-004', name: 'Test', type: 'unknown-type' }
    const prompt = buildTaskPrompt('test-agent', task)
    // _fallback strategy has minPassingScore: 60
    assert.ok(prompt.includes('60'))
  })

  it('buildTaskPrompt includes execution instructions', () => {
    const { buildTaskPrompt } = require('../../../core/autopilot/task-prompt.cjs')
    const task = { id: 'task-005', name: 'Test' }
    const prompt = buildTaskPrompt('test-agent', task)
    assert.ok(prompt.includes('执行要求'))
    assert.ok(prompt.includes('workspaces/'))
  })
})
