'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { DirectiveBuilder } = require('../../core/llm/directive-builder.cjs')

describe('DirectiveBuilder', () => {
  it('empty builder builds a string', () => {
    const result = new DirectiveBuilder().build()
    assert.equal(typeof result, 'string')
  })

  it('withHeader sets header in output', () => {
    const result = new DirectiveBuilder().withHeader('# Test Header').build()
    assert.ok(result.includes('# Test Header'))
  })

  it('withRole adds role section', () => {
    const result = new DirectiveBuilder().withRole('agent-a', 'Dev Dept').build()
    assert.ok(result.includes('agent-a'))
    assert.ok(result.includes('Dev Dept'))
  })

  it('withCeoRole adds CEO role with cycle reference', () => {
    const result = new DirectiveBuilder().withCeoRole(5).build()
    assert.ok(result.includes('CEO'))
    assert.ok(result.includes('5'))
  })

  it('withMemory adds memory section', () => {
    const result = new DirectiveBuilder().withMemory({ summary: 'test memory' }).build()
    assert.ok(result.includes('test memory'))
  })

  it('withMission adds mission section with both parts', () => {
    const result = new DirectiveBuilder().withMission('base mission', 'dept mission').build()
    assert.ok(result.includes('base mission'))
    assert.ok(result.includes('dept mission'))
  })

  it('withTasks adds task section', () => {
    const result = new DirectiveBuilder().withTasks('- task1\n- task2').build()
    assert.ok(result.includes('task1'))
    assert.ok(result.includes('task2'))
  })

  it('withBudget adds budget section', () => {
    const result = new DirectiveBuilder().withBudget('remaining: 5000 tokens').build()
    assert.ok(result.includes('remaining: 5000 tokens'))
  })

  it('chaining multiple methods produces combined output', () => {
    const result = new DirectiveBuilder()
      .withHeader('# Header')
      .withRole('agent-x', 'Dept-Y')
      .withTasks('- do something')
      .withBudget('10k tokens')
      .build()
    assert.ok(result.includes('# Header'))
    assert.ok(result.includes('agent-x'))
    assert.ok(result.includes('do something'))
    assert.ok(result.includes('10k tokens'))
  })

  it('withDeptReports adds department reports', () => {
    const result = new DirectiveBuilder()
      .withDeptReports({ novel: 'Chapter 3 done', quant: 'Backtest passed' })
      .build()
    assert.ok(result.includes('novel'))
    assert.ok(result.includes('Chapter 3 done'))
    assert.ok(result.includes('quant'))
  })

  it('withSection adds arbitrary section', () => {
    const result = new DirectiveBuilder().withSection('## Custom\nArbitrary content').build()
    assert.ok(result.includes('## Custom'))
    assert.ok(result.includes('Arbitrary content'))
  })

  it('build is idempotent (calling twice returns same result)', () => {
    const builder = new DirectiveBuilder()
      .withHeader('# Cycle 10')
      .withRole('ceo', 'HQ')
      .withTasks('- review')
    const first = builder.build()
    const second = builder.build()
    assert.equal(first, second)
  })
})
