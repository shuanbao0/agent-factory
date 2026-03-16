'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { checkQualityGate, runValidator, createPipelineTask, createReworkTask } = require('../../../core/task/quality-validator.cjs')

describe('QualityValidator', () => {
  describe('checkQualityGate', () => {
    it('passes when no pipeline step', () => {
      const result = checkQualityGate({ type: 'coding' }, null)
      assert.equal(result.passed, true)
    })

    it('passes when no gate config and no quality data', () => {
      const result = checkQualityGate({ type: 'coding' }, { from: 'coding', to: 'review' })
      assert.equal(result.passed, true)
    })

    it('fails when selfCheck required but missing', () => {
      const result = checkQualityGate(
        { type: 'coding' },
        { from: 'coding', to: 'review', qualityGate: { requireSelfCheck: true } }
      )
      assert.equal(result.passed, false)
      assert.ok(result.errors.some(e => e.includes('Self-check not performed')))
      assert.equal(result.shouldRework, true)
    })

    it('fails when selfCheck score below minimum', () => {
      const result = checkQualityGate(
        { type: 'coding', quality: { selfCheck: { passed: true, score: 50 } } },
        { from: 'coding', to: 'review', qualityGate: { requireSelfCheck: true, minScore: 75 } }
      )
      assert.equal(result.passed, false)
      assert.ok(result.errors.some(e => e.includes('below minimum')))
    })

    it('trusts async gate when headApproval.passed is true', () => {
      const result = checkQualityGate(
        { type: 'coding', quality: { selfCheck: { passed: true, score: 50 }, headApproval: { passed: true } } },
        { from: 'coding', to: 'review', qualityGate: { requireSelfCheck: true, minScore: 75 } }
      )
      assert.equal(result.passed, true)
    })

    it('escalates when reworkCount exceeds maxReworks', () => {
      const result = checkQualityGate(
        { type: 'coding', reworkCount: 3 },
        { from: 'coding', to: 'review', qualityGate: { requireSelfCheck: true, maxReworks: 3 } }
      )
      assert.equal(result.passed, false)
      assert.equal(result.escalate, true)
      assert.equal(result.shouldRework, false)
    })
  })

  describe('runValidator', () => {
    it('wordCount passes when output is long enough', () => {
      const errors = runValidator('wordCount', { output: 'a'.repeat(600) }, { min: 500 })
      assert.equal(errors.length, 0)
    })

    it('wordCount fails when output is too short', () => {
      const errors = runValidator('wordCount', { output: 'short' }, { min: 500 })
      assert.equal(errors.length, 1)
      assert.ok(errors[0].includes('too short'))
    })

    it('similarity detects repeated blocks', () => {
      const block = 'a'.repeat(100)
      const errors = runValidator('similarity', { output: block.repeat(10) }, { maxRepeatRatio: 0.3, minBlockSize: 100 })
      assert.ok(errors.length > 0)
    })

    it('unknown validator returns empty', () => {
      const errors = runValidator('nonexistent', {}, {})
      assert.equal(errors.length, 0)
    })
  })

  describe('createPipelineTask', () => {
    it('creates task with correct fields', () => {
      const task = createPipelineTask(
        { id: 't1', name: 'Chapter 1', type: 'coding', projectId: 'novel', priority: 'P1', assignees: ['writer'], assignedAgent: 'writer' },
        { from: 'coding', to: 'review' },
        [{ value: 'review', labelEn: 'Review' }]
      )
      assert.ok(task)
      assert.equal(task.name, 'Review: Chapter 1')
      assert.equal(task.type, 'review')
      assert.equal(task.projectId, 'novel')
      assert.equal(task.status, 'pending')
      assert.deepEqual(task.dependencies, ['t1'])
    })

    it('returns null when no type', () => {
      assert.equal(createPipelineTask({ id: 't1' }, { from: 'x', to: 'y' }, []), null)
    })
  })

  describe('createReworkTask', () => {
    it('creates rework with incremented count', () => {
      const task = createReworkTask(
        { id: 't1', name: 'Task', priority: 'P1', assignees: ['a'], reworkCount: 1, type: 'coding' },
        ['Error 1']
      )
      assert.ok(task.id.startsWith('task-'))
      assert.equal(task.name, '[Rework] Task')
      assert.equal(task.reworkCount, 2)
      assert.equal(task.reworkFromId, 't1')
    })
  })
})
