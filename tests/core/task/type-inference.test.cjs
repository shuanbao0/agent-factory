'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  inferTaskType,
  inferFromSummary,
  inferFromTemplate,
} = require('../../../core/task/type-inference.cjs')

describe('type-inference', () => {

  describe('inferFromSummary', () => {
    it('detects coding keywords (zh)', () => {
      assert.equal(inferFromSummary('请开发用户登录接口'), 'coding')
      assert.equal(inferFromSummary('修复首页bug'), 'coding')
      assert.equal(inferFromSummary('重构数据层代码'), 'coding')
    })

    it('detects coding keywords (en)', () => {
      assert.equal(inferFromSummary('implement the API endpoint'), 'coding')
      assert.equal(inferFromSummary('fix the login bug'), 'coding')
    })

    it('detects writing keywords', () => {
      assert.equal(inferFromSummary('写第三章内容'), 'writing')
      assert.equal(inferFromSummary('续写上一节的故事'), 'writing')
      assert.equal(inferFromSummary('撰写项目总结报告'), 'writing')
    })

    it('detects research keywords', () => {
      assert.equal(inferFromSummary('调研竞品功能'), 'research')
      assert.equal(inferFromSummary('研究市场趋势'), 'research')
    })

    it('detects analysis keywords', () => {
      assert.equal(inferFromSummary('分析Q1销售数据'), 'analysis')
      assert.equal(inferFromSummary('评估项目风险'), 'analysis')
    })

    it('detects design keywords', () => {
      assert.equal(inferFromSummary('设计系统架构方案'), 'design')
      assert.equal(inferFromSummary('design the system architecture'), 'design')
    })

    it('detects marketing keywords', () => {
      assert.equal(inferFromSummary('策划营销推广方案'), 'marketing')
      assert.equal(inferFromSummary('plan a marketing campaign'), 'marketing')
    })

    it('detects tutorial keywords', () => {
      assert.equal(inferFromSummary('编写入门教程'), 'tutorial')
      assert.equal(inferFromSummary('create a beginner guide'), 'tutorial')
    })

    it('detects operations keywords', () => {
      assert.equal(inferFromSummary('制定运营流程'), 'operations')
      assert.equal(inferFromSummary('审批合规检查'), 'operations')
    })

    it('detects finance keywords', () => {
      assert.equal(inferFromSummary('核算本月成本'), 'finance')
      assert.equal(inferFromSummary('prepare budget report'), 'finance')
    })

    it('detects creative types', () => {
      assert.equal(inferFromSummary('构建世界观设定'), 'worldbuilding')
      assert.equal(inferFromSummary('完善角色设计和人物设定'), 'character')
      assert.equal(inferFromSummary('规划第二卷情节大纲'), 'plotting')
    })

    it('returns null for unrecognized summary', () => {
      assert.equal(inferFromSummary('请处理这个任务'), null)
      assert.equal(inferFromSummary(''), null)
      assert.equal(inferFromSummary(null), null)
    })
  })

  describe('inferFromTemplate', () => {
    it('maps tech templates to coding', () => {
      assert.equal(inferFromTemplate('backend'), 'coding')
      assert.equal(inferFromTemplate('frontend'), 'coding')
      assert.equal(inferFromTemplate('tester'), 'coding')
    })

    it('maps novel templates to writing types', () => {
      assert.equal(inferFromTemplate('novel-writer'), 'writing')
      assert.equal(inferFromTemplate('worldbuilder'), 'worldbuilding')
      assert.equal(inferFromTemplate('character-designer'), 'character')
      assert.equal(inferFromTemplate('plot-architect'), 'plotting')
      assert.equal(inferFromTemplate('style-editor'), 'editing')
    })

    it('maps research templates', () => {
      assert.equal(inferFromTemplate('researcher'), 'research')
      assert.equal(inferFromTemplate('ai-researcher'), 'research')
    })

    it('maps marketing templates', () => {
      assert.equal(inferFromTemplate('marketing'), 'marketing')
      assert.equal(inferFromTemplate('content-creator'), 'marketing')
    })

    it('maps finance templates', () => {
      assert.equal(inferFromTemplate('accountant'), 'finance')
      assert.equal(inferFromTemplate('cfo'), 'finance')
    })

    it('returns null for unknown template', () => {
      assert.equal(inferFromTemplate('unknown-agent'), null)
      assert.equal(inferFromTemplate(null), null)
    })
  })

  describe('inferTaskType', () => {
    it('summary keywords take priority over template', () => {
      // Agent is a writer but summary says "分析数据"
      const meta = { templateId: 'novel-writer', role: 'novel-writer' }
      assert.equal(inferTaskType('分析Q1销售数据', meta), 'analysis')
    })

    it('falls back to template when summary has no keywords', () => {
      const meta = { templateId: 'backend', role: 'backend' }
      assert.equal(inferTaskType('处理这个需求', meta), 'coding')
    })

    it('falls back to role when no templateId', () => {
      const meta = { role: 'novel-writer' }
      assert.equal(inferTaskType('处理这个需求', meta), 'writing')
    })

    it('returns dept-work when nothing matches', () => {
      assert.equal(inferTaskType('做这件事', {}), 'dept-work')
      assert.equal(inferTaskType('做这件事', null), 'dept-work')
      assert.equal(inferTaskType('做这件事'), 'dept-work')
    })
  })
})
