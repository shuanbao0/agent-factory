'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { DirectiveBuilder } = require('./directive-builder.cjs')

describe('DirectiveBuilder', () => {
  it('builds minimal directive with header only', () => {
    const result = new DirectiveBuilder()
      .withHeader('[Test Cycle #1]')
      .build()
    assert.ok(result.includes('[Test Cycle #1]'))
  })

  it('builds department directive with role', () => {
    const result = new DirectiveBuilder()
      .withHeader('[Department Loop: novel Cycle #5]')
      .withRole('novel-chief', 'novel')
      .build()
    assert.ok(result.includes('你是 novel-chief，novel 部门主管'))
  })

  it('builds CEO directive with role', () => {
    const result = new DirectiveBuilder()
      .withHeader('[Autopilot Cycle #10]')
      .withCeoRole(10)
      .build()
    assert.ok(result.includes('你是 CEO，这是公司第 10 轮自主运营循环'))
  })

  it('includes memory context sections', () => {
    const result = new DirectiveBuilder()
      .withMemory({
        summary: 'Test summary',
        recentDecisions: 'Decision A',
        departmentStatus: 'All good',
      })
      .build()
    assert.ok(result.includes('## 你的记忆摘要'))
    assert.ok(result.includes('Test summary'))
    assert.ok(result.includes('## 近期重要决策'))
    assert.ok(result.includes('## 各部门最新状态'))
  })

  it('uses fallback memory when no structured context', () => {
    const result = new DirectiveBuilder()
      .withMemory(null, 'Raw memory text')
      .build()
    assert.ok(result.includes('Raw memory text'))
    assert.ok(result.includes('## 你的上次记忆'))
  })

  it('skips memory when both null', () => {
    const result = new DirectiveBuilder()
      .withMemory(null, null)
      .build()
    assert.ok(!result.includes('记忆'))
  })

  it('builds mission with base and dept', () => {
    const result = new DirectiveBuilder()
      .withMission('Base mission text', 'Dept mission text')
      .build()
    assert.ok(result.includes('## 部门使命'))
    assert.ok(result.includes('### 通用准则'))
    assert.ok(result.includes('Base mission text'))
    assert.ok(result.includes('### 本部门使命'))
    assert.ok(result.includes('Dept mission text'))
  })

  it('skips mission when both empty', () => {
    const result = new DirectiveBuilder()
      .withMission('', '')
      .build()
    assert.ok(!result.includes('部门使命'))
  })

  it('builds transitions section with review and failed highlights', () => {
    const transitions = [
      { taskId: 'task-1', taskName: 'Write ch1', agentId: 'writer', from: 'in_progress', to: 'review', reason: 'idle 8m' },
      { taskId: 'task-2', taskName: 'Edit ch0', agentId: 'editor', from: 'assigned', to: 'failed', reason: 'stale 30m' },
    ]
    const result = new DirectiveBuilder()
      .withTransitions(transitions)
      .build()
    assert.ok(result.includes('⚡ 本轮任务自动变化'))
    assert.ok(result.includes('task-1'))
    assert.ok(result.includes('task-2'))
    assert.ok(result.includes('🔔 有 1 个任务等待你确认完成'))
    assert.ok(result.includes('⚠️ 有 1 个任务因长时间无进展被标记为失败'))
  })

  it('skips transitions when empty', () => {
    const result = new DirectiveBuilder()
      .withTransitions([])
      .build()
    assert.ok(!result.includes('自动变化'))
  })

  it('builds dept reports for CEO', () => {
    const result = new DirectiveBuilder()
      .withDeptReports({ novel: 'Novel dept doing great', marketing: 'Marketing active' })
      .build()
    assert.ok(result.includes('## 📊 部门报告'))
    assert.ok(result.includes('### novel 部门'))
    assert.ok(result.includes('### marketing 部门'))
  })

  it('builds escalations for CEO', () => {
    const result = new DirectiveBuilder()
      .withEscalations([{ deptId: 'novel', title: 'Need budget increase' }])
      .build()
    assert.ok(result.includes('🚨 需要CEO决策'))
    assert.ok(result.includes('[novel] Need budget increase'))
  })

  it('full department directive chain', () => {
    const result = new DirectiveBuilder()
      .withHeader('[Department Loop: novel Cycle #3]')
      .withRole('novel-chief', 'novel')
      .withDeptMemory('Previous context here')
      .withMission('Be creative', 'Write novels')
      .withCeoDirectives('Focus on chapter 5')
      .withBudget('Today: 5000/10000 tokens')
      .withTransitions([])
      .withTeamStatus('- writer: 🟢 idle')
      .withTasks('### Novel Project\n- task-1: Write')
      .withKpis('- wordcount: target 5000 words')
      .withActionRequirements('## Action\nDo stuff')
      .build()

    assert.ok(result.includes('[Department Loop: novel Cycle #3]'))
    assert.ok(result.includes('novel-chief'))
    assert.ok(result.includes('Previous context here'))
    assert.ok(result.includes('Be creative'))
    assert.ok(result.includes('Focus on chapter 5'))
    assert.ok(result.includes('5000/10000 tokens'))
    assert.ok(result.includes('writer'))
    assert.ok(result.includes('task-1'))
    assert.ok(result.includes('wordcount'))
    assert.ok(result.includes('Do stuff'))
  })

  it('does not produce triple+ newlines', () => {
    const result = new DirectiveBuilder()
      .withHeader('Header')
      .withSection('')
      .withSection('Content')
      .build()
    assert.ok(!result.includes('\n\n\n'))
  })

  it('dept memory section uses correct heading', () => {
    const result = new DirectiveBuilder()
      .withDeptMemory('Dept head memory')
      .build()
    assert.ok(result.includes('## 你的记忆\nDept head memory'))
  })

  it('withFullMission for CEO', () => {
    const result = new DirectiveBuilder()
      .withFullMission('Company mission statement')
      .build()
    assert.ok(result.includes('## 公司使命\nCompany mission statement'))
  })

  it('withSection adds raw text', () => {
    const result = new DirectiveBuilder()
      .withSection('## Custom Section\nCustom content')
      .build()
    assert.ok(result.includes('## Custom Section\nCustom content'))
  })

  it('skips null/undefined sections gracefully', () => {
    const result = new DirectiveBuilder()
      .withProjectData(null)
      .withStandaloneTasks(undefined)
      .withAgentActivity(null)
      .build()
    assert.strictEqual(result.trim(), '')
  })
})
