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
        peerReview: { comments: '需要改进情节连贯性' },
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

  // ── buildTaskContext tests ──

  it('exports buildTaskContext function', () => {
    const mod = require('../../../core/autopilot/task-prompt.cjs')
    assert.ok(typeof mod.buildTaskContext === 'function')
  })

  it('buildTaskContext includes summary and quality standards', () => {
    const { buildTaskContext } = require('../../../core/autopilot/task-prompt.cjs')
    const ctx = buildTaskContext('test-agent', '写第一章初稿', { taskType: 'writing' })
    assert.ok(ctx.includes('写第一章初稿'))
    assert.ok(ctx.includes('70'))  // writing minPassingScore
  })

  it('buildTaskContext includes rework feedback when provided', () => {
    const { buildTaskContext } = require('../../../core/autopilot/task-prompt.cjs')
    const ctx = buildTaskContext('test-agent', '修改第一章', {
      taskType: 'writing',
      reworkCount: 1,
      quality: { peerReview: { comments: '情节不连贯' }, selfCheck: { score: 55 } },
    })
    assert.ok(ctx.includes('第 1 次'))
    assert.ok(ctx.includes('情节不连贯'))
    assert.ok(ctx.includes('55'))
  })

  it('buildTaskContext omits rework info when reworkCount is 0', () => {
    const { buildTaskContext } = require('../../../core/autopilot/task-prompt.cjs')
    const ctx = buildTaskContext('test-agent', '普通任务', { reworkCount: 0 })
    assert.ok(!ctx.includes('返工'))
  })

  it('buildTaskContext does not include identity or execution instructions', () => {
    const { buildTaskContext } = require('../../../core/autopilot/task-prompt.cjs')
    const ctx = buildTaskContext('test-agent', '任务摘要')
    assert.ok(!ctx.includes('你的身份'))
    assert.ok(!ctx.includes('执行要求'))
  })
})
