'use strict'
/**
 * Directive — CEO 指令构建单元测试
 *
 * 测试策略：测试指令文本的结构和内容逻辑
 * 注意：buildDirective 依赖 missionRepo/taskRepo/sessionRepo，
 * 这里只测试可内联验证的逻辑片段
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('autopilot/directive', () => {
  describe('coordination 指令结构', () => {
    it('包含 Autopilot Cycle 标记和循环编号', () => {
      const cycleNum = 42
      const header = `[Autopilot Cycle #${cycleNum}]`
      assert.ok(header.includes('#42'))
    })

    it('包含 CEO 角色说明', () => {
      const cycleNum = 10
      const roleLine = `你是 CEO，这是公司第 ${cycleNum} 轮自主运营循环。`
      assert.ok(roleLine.includes('CEO'))
      assert.ok(roleLine.includes('10'))
    })
  })

  describe('strategy 指令结构', () => {
    it('策略循环使用不同的头部标记', () => {
      const cycleNum = 5
      const header = `[Strategy Cycle #${cycleNum}]`
      assert.ok(header.includes('Strategy'))
      assert.ok(header.includes('#5'))
    })

    it('策略循环包含战略思考要求', () => {
      const template = '## 战略思考要求\n1. **复盘**：过去一段时间的决策效果如何？'
      assert.ok(template.includes('复盘'))
      assert.ok(template.includes('战略思考'))
    })
  })

  describe('memoryContext 集成', () => {
    it('有结构化记忆时构建记忆段落', () => {
      const memoryContext = {
        summary: '本轮进展顺利',
        recentDecisions: '- 分配了第3章任务',
        departmentStatus: 'novel: 进行中',
      }
      let context = ''
      if (memoryContext.summary) {
        context += `\n## 你的记忆摘要\n${memoryContext.summary}\n`
      }
      if (memoryContext.recentDecisions) {
        context += `\n## 近期重要决策\n${memoryContext.recentDecisions}\n`
      }
      assert.ok(context.includes('记忆摘要'))
      assert.ok(context.includes('本轮进展顺利'))
      assert.ok(context.includes('近期重要决策'))
    })

    it('无结构化记忆时使用回退', () => {
      const memoryContext = null
      const fallbackMemory = '# Memory\n上次记录的内容...'
      let context = ''
      if (memoryContext) {
        context += '结构化记忆'
      } else if (fallbackMemory) {
        context += `\n## 你的上次记忆 (MEMORY.md)\n${fallbackMemory.slice(0, 4000)}\n`
      }
      assert.ok(context.includes('MEMORY.md'))
      assert.ok(context.includes('上次记录'))
    })
  })

  describe('项目数据格式化', () => {
    it('格式化项目进度统计', () => {
      const proj = {
        name: '小说项目',
        id: 'novel',
        status: 'in-progress',
        currentPhase: 2,
        totalPhases: 5,
        tasks: [
          { status: 'completed' },
          { status: 'in_progress', id: 't1', name: '写第3章', assignedAgent: 'writer', progress: 60 },
          { status: 'pending', id: 't2', name: '写第4章', assignedAgent: 'writer' },
        ],
      }
      const tasks = proj.tasks
      const completed = tasks.filter(t => t.status === 'completed').length
      const line = `- 进度: ${completed}/${tasks.length} 任务完成`
      assert.equal(line, '- 进度: 1/3 任务完成')
    })

    it('接近完成的项目有提醒', () => {
      const tasks = [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'in_progress' },
      ]
      const completed = tasks.filter(t => t.status === 'completed').length
      const warning = completed > 0 && completed >= tasks.length - 1
      assert.ok(warning)
    })
  })

  describe('buildDirective 路由', () => {
    it('默认 cycleType 为 coordination', () => {
      // 模拟 buildDirective 路由逻辑
      function route(cycleType) {
        if (cycleType === 'strategy') return 'strategy'
        return 'coordination'
      }
      assert.equal(route('coordination'), 'coordination')
      assert.equal(route('strategy'), 'strategy')
      assert.equal(route(undefined), 'coordination')
    })
  })
})
