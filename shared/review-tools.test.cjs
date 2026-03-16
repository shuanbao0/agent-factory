'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  SELF_CHECK_TOOLS, PEER_REVIEW_TOOLS, HEAD_APPROVAL_TOOLS,
  parseReviewToolCall,
} = require('./review-tools.cjs')

describe('review-tools', () => {
  describe('SELF_CHECK_TOOLS schema', () => {
    it('has 1 tool defined', () => {
      assert.equal(SELF_CHECK_TOOLS.length, 1)
    })

    it('submit_self_check requires score and passed', () => {
      const tool = SELF_CHECK_TOOLS[0]
      assert.equal(tool.name, 'submit_self_check')
      assert.deepEqual(tool.input_schema.required, ['score', 'passed'])
    })

    it('submit_self_check has issues array property', () => {
      const tool = SELF_CHECK_TOOLS[0]
      assert.equal(tool.input_schema.properties.issues.type, 'array')
    })
  })

  describe('PEER_REVIEW_TOOLS schema', () => {
    it('has 1 tool defined', () => {
      assert.equal(PEER_REVIEW_TOOLS.length, 1)
    })

    it('submit_peer_review requires score and passed', () => {
      const tool = PEER_REVIEW_TOOLS[0]
      assert.equal(tool.name, 'submit_peer_review')
      assert.deepEqual(tool.input_schema.required, ['score', 'passed'])
    })

    it('submit_peer_review has comments property', () => {
      const tool = PEER_REVIEW_TOOLS[0]
      assert.equal(tool.input_schema.properties.comments.type, 'string')
    })
  })

  describe('HEAD_APPROVAL_TOOLS schema', () => {
    it('has 1 tool defined', () => {
      assert.equal(HEAD_APPROVAL_TOOLS.length, 1)
    })

    it('submit_approval requires approved', () => {
      const tool = HEAD_APPROVAL_TOOLS[0]
      assert.equal(tool.name, 'submit_approval')
      assert.deepEqual(tool.input_schema.required, ['approved'])
    })

    it('submit_approval has reason property', () => {
      const tool = HEAD_APPROVAL_TOOLS[0]
      assert.equal(tool.input_schema.properties.reason.type, 'string')
    })
  })

  describe('parseReviewToolCall', () => {
    it('extracts matching tool call input', () => {
      const toolCalls = [
        { name: 'submit_self_check', input: { score: 85, passed: true, issues: [] } },
      ]
      const result = parseReviewToolCall(toolCalls, 'submit_self_check')
      assert.deepEqual(result, { score: 85, passed: true, issues: [] })
    })

    it('returns null when tool not found', () => {
      const toolCalls = [
        { name: 'submit_peer_review', input: { score: 70, passed: true } },
      ]
      const result = parseReviewToolCall(toolCalls, 'submit_self_check')
      assert.equal(result, null)
    })

    it('returns null for empty array', () => {
      assert.equal(parseReviewToolCall([], 'submit_self_check'), null)
    })

    it('returns null for non-array', () => {
      assert.equal(parseReviewToolCall(null, 'submit_self_check'), null)
      assert.equal(parseReviewToolCall(undefined, 'submit_self_check'), null)
    })

    it('picks first match when multiple calls present', () => {
      const toolCalls = [
        { name: 'submit_approval', input: { approved: true } },
        { name: 'submit_approval', input: { approved: false } },
      ]
      const result = parseReviewToolCall(toolCalls, 'submit_approval')
      assert.deepEqual(result, { approved: true })
    })
  })
})
