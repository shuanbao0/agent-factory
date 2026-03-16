'use strict'
/**
 * Review Tools — tool definitions for quality gate structured reviews.
 *
 * Mirrors chief-tools.cjs pattern for the 3 quality gate stages:
 *   submit_self_check  — agent reviews own output
 *   submit_peer_review — peer evaluates task output
 *   submit_approval    — department head final sign-off
 */

const SELF_CHECK_TOOLS = [
  {
    name: 'submit_self_check',
    description: '提交自检结果。评估自己任务产出的质量。',
    input_schema: {
      type: 'object',
      properties: {
        score: {
          type: 'number',
          description: '质量评分 0-100',
        },
        passed: {
          type: 'boolean',
          description: '是否通过自检',
        },
        issues: {
          type: 'array',
          items: { type: 'string' },
          description: '发现的问题列表（无问题传空数组）',
        },
      },
      required: ['score', 'passed'],
    },
  },
]

const PEER_REVIEW_TOOLS = [
  {
    name: 'submit_peer_review',
    description: '提交同行评审结果。评估他人任务产出的质量。',
    input_schema: {
      type: 'object',
      properties: {
        score: {
          type: 'number',
          description: '质量评分 0-100',
        },
        passed: {
          type: 'boolean',
          description: '是否通过评审',
        },
        comments: {
          type: 'string',
          description: '评审意见',
        },
      },
      required: ['score', 'passed'],
    },
  },
]

const HEAD_APPROVAL_TOOLS = [
  {
    name: 'submit_approval',
    description: '提交主管审批结果。决定任务是否可以最终完成。',
    input_schema: {
      type: 'object',
      properties: {
        approved: {
          type: 'boolean',
          description: '是否批准',
        },
        reason: {
          type: 'string',
          description: '审批理由（拒绝时必填）',
        },
      },
      required: ['approved'],
    },
  },
]

/**
 * Parse a tool-use response into a structured review result.
 *
 * @param {Array} toolCalls - Array of { name, input } from sendWithTools
 * @param {string} expectedTool - The tool name to look for
 * @returns {Object|null} The tool input if found, null otherwise
 */
function parseReviewToolCall(toolCalls, expectedTool) {
  if (!Array.isArray(toolCalls)) return null
  const call = toolCalls.find(c => c.name === expectedTool)
  return call ? call.input : null
}

module.exports = {
  SELF_CHECK_TOOLS,
  PEER_REVIEW_TOOLS,
  HEAD_APPROVAL_TOOLS,
  parseReviewToolCall,
}
