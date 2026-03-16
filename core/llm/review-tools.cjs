'use strict'
/**
 * ReviewTools — 质量门三阶段评审的工具定义
 *
 * 设计模式：Strategy / Configuration Objects
 *
 * 职责：
 * - 定义质量门 3 个阶段对应的 Anthropic tool schema
 * - 提供 parseReviewToolCall() 从 API 返回中提取评审结果
 *
 * 三阶段对应关系：
 *   self_checking   → SELF_CHECK_TOOLS  → submit_self_check（Agent 自评）
 *   peer_reviewing  → PEER_REVIEW_TOOLS → submit_peer_review（同行评审）
 *   head_approving  → HEAD_APPROVAL_TOOLS → submit_approval（主管审批）
 */

/** 自检工具：Agent 评估自己的产出质量 */
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

/** 同行评审工具：其他 Agent 评估产出质量 */
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

/** 主管审批工具：部门主管最终签字 */
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
 * 从 tool-use 响应中提取指定工具的输入参数
 *
 * @param {Array} toolCalls - sendWithTools 返回的 [{ name, input }] 数组
 * @param {string} expectedTool - 期望的工具名称
 * @returns {Object|null} 工具的 input 对象，未找到返回 null
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
