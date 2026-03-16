'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { CHIEF_TOOLS, CEO_TOOLS, validateToolInput } = require('./chief-tools.cjs')

describe('chief-tools', () => {
  describe('CHIEF_TOOLS schema', () => {
    it('has 5 tools defined', () => {
      assert.equal(CHIEF_TOOLS.length, 5)
    })

    it('all tools have name, description, input_schema', () => {
      for (const tool of CHIEF_TOOLS) {
        assert.ok(tool.name, `tool missing name`)
        assert.ok(tool.description, `${tool.name} missing description`)
        assert.ok(tool.input_schema, `${tool.name} missing input_schema`)
        assert.equal(tool.input_schema.type, 'object')
      }
    })

    it('assign_task requires agentId and taskSummary', () => {
      const tool = CHIEF_TOOLS.find(t => t.name === 'assign_task')
      assert.deepEqual(tool.input_schema.required, ['agentId', 'taskSummary'])
    })

    it('complete_task requires taskId', () => {
      const tool = CHIEF_TOOLS.find(t => t.name === 'complete_task')
      assert.deepEqual(tool.input_schema.required, ['taskId'])
    })

    it('send_rework requires taskId, agentId, feedback', () => {
      const tool = CHIEF_TOOLS.find(t => t.name === 'send_rework')
      assert.deepEqual(tool.input_schema.required, ['taskId', 'agentId', 'feedback'])
    })

    it('report_progress requires summary', () => {
      const tool = CHIEF_TOOLS.find(t => t.name === 'report_progress')
      assert.deepEqual(tool.input_schema.required, ['summary'])
    })

    it('no_action requires reason', () => {
      const tool = CHIEF_TOOLS.find(t => t.name === 'no_action')
      assert.deepEqual(tool.input_schema.required, ['reason'])
    })
  })

  describe('CEO_TOOLS schema', () => {
    it('has 4 tools defined', () => {
      assert.equal(CEO_TOOLS.length, 4)
    })

    it('issue_directive requires department and directive', () => {
      const tool = CEO_TOOLS.find(t => t.name === 'issue_directive')
      assert.deepEqual(tool.input_schema.required, ['department', 'directive'])
    })

    it('update_priority requires department and newPriority', () => {
      const tool = CEO_TOOLS.find(t => t.name === 'update_priority')
      assert.deepEqual(tool.input_schema.required, ['department', 'newPriority'])
    })

    it('escalate_issue requires issue and severity', () => {
      const tool = CEO_TOOLS.find(t => t.name === 'escalate_issue')
      assert.deepEqual(tool.input_schema.required, ['issue', 'severity'])
    })
  })

  describe('validateToolInput', () => {
    it('validates valid assign_task input', () => {
      const result = validateToolInput('assign_task', {
        agentId: 'novel-writer',
        taskSummary: 'Write chapter 1',
      }, CHIEF_TOOLS)
      assert.equal(result.valid, true)
      assert.equal(result.errors.length, 0)
    })

    it('rejects assign_task missing agentId', () => {
      const result = validateToolInput('assign_task', {
        taskSummary: 'Write chapter 1',
      }, CHIEF_TOOLS)
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('agentId')))
    })

    it('rejects assign_task with empty agentId', () => {
      const result = validateToolInput('assign_task', {
        agentId: '',
        taskSummary: 'Write chapter 1',
      }, CHIEF_TOOLS)
      assert.equal(result.valid, false)
    })

    it('rejects unknown tool', () => {
      const result = validateToolInput('unknown_tool', {}, CHIEF_TOOLS)
      assert.equal(result.valid, false)
      assert.ok(result.errors[0].includes('Unknown tool'))
    })

    it('validates CEO issue_directive', () => {
      const result = validateToolInput('issue_directive', {
        department: 'novel',
        directive: 'Focus on chapter 5',
      }, CEO_TOOLS)
      assert.equal(result.valid, true)
    })

    it('rejects CEO issue_directive missing department', () => {
      const result = validateToolInput('issue_directive', {
        directive: 'Focus on chapter 5',
      }, CEO_TOOLS)
      assert.equal(result.valid, false)
    })
  })
})
