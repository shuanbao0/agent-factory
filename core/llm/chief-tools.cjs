'use strict'
/**
 * Chief Tools — tool definitions for department chief structured decisions.
 *
 * Each tool maps to a concrete action in department-loop:
 *   assign_task    → createWorkTask() + peer-send
 *   complete_task  → updateTaskStatus(→review)
 *   send_rework    → peer-send feedback
 *   report_progress → logged, no side-effect
 *   no_action      → explicit "nothing to do"
 *
 * CEO tools for index.cjs:
 *   issue_directive → send directive to department
 *   update_priority → adjust department priority
 *   escalate_issue  → flag for human intervention
 *   no_action       → no intervention needed
 */

// ── Chief (Department Head) Tools ────────────────────────────────

const CHIEF_TOOLS = [
  {
    name: 'assign_task',
    description: '分配新任务给部门内的 agent。每次调用分配一个任务。',
    input_schema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: '接收任务的 agent ID（必须是部门内成员）',
        },
        taskSummary: {
          type: 'string',
          description: '任务概要描述',
        },
        priority: {
          type: 'string',
          enum: ['P0', 'P1', 'P2', 'P3'],
          description: '优先级（默认 P1）',
        },
      },
      required: ['agentId', 'taskSummary'],
    },
  },
  {
    name: 'complete_task',
    description: '确认一个任务已完成，将其推进到 review 阶段。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: '要完成的任务 ID（格式: task-xxx）',
        },
        reason: {
          type: 'string',
          description: '完成原因或备注',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'send_rework',
    description: '将任务退回给 agent 要求返工，附上反馈。',
    input_schema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: '需要返工的任务 ID',
        },
        agentId: {
          type: 'string',
          description: '负责返工的 agent ID',
        },
        feedback: {
          type: 'string',
          description: '返工原因和具体反馈',
        },
      },
      required: ['taskId', 'agentId', 'feedback'],
    },
  },
  {
    name: 'report_progress',
    description: '汇报部门整体进展和状态。',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: '进展概要',
        },
        blockers: {
          type: 'array',
          items: { type: 'string' },
          description: '当前阻塞项列表',
        },
      },
      required: ['summary'],
    },
  },
  {
    name: 'no_action',
    description: '当前无需执行任何操作。明确表达"不分配"以避免误解。',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: '不执行操作的原因',
        },
      },
      required: ['reason'],
    },
  },
]

// ── CEO Tools ────────────────────────────────────────────────────

const CEO_TOOLS = [
  {
    name: 'issue_directive',
    description: '向部门发出指令或战略方向。',
    input_schema: {
      type: 'object',
      properties: {
        department: {
          type: 'string',
          description: '目标部门 ID',
        },
        directive: {
          type: 'string',
          description: '指令内容',
        },
        priority: {
          type: 'string',
          enum: ['P0', 'P1', 'P2', 'P3'],
          description: '优先级',
        },
      },
      required: ['department', 'directive'],
    },
  },
  {
    name: 'update_priority',
    description: '调整部门或项目的优先级。',
    input_schema: {
      type: 'object',
      properties: {
        department: {
          type: 'string',
          description: '部门 ID',
        },
        newPriority: {
          type: 'string',
          enum: ['P0', 'P1', 'P2', 'P3'],
          description: '新优先级',
        },
        reason: {
          type: 'string',
          description: '调整原因',
        },
      },
      required: ['department', 'newPriority'],
    },
  },
  {
    name: 'escalate_issue',
    description: '标记需要人工介入的问题。',
    input_schema: {
      type: 'object',
      properties: {
        issue: {
          type: 'string',
          description: '问题描述',
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: '严重程度',
        },
        department: {
          type: 'string',
          description: '相关部门（可选）',
        },
      },
      required: ['issue', 'severity'],
    },
  },
  {
    name: 'no_action',
    description: '当前无需干预，一切正常。',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: '无需干预的原因',
        },
      },
      required: ['reason'],
    },
  },
]

/**
 * Validate a tool call input against its schema (basic required-field check).
 *
 * @param {string} toolName
 * @param {Object} input
 * @param {Array} toolDefs - tool definitions array to validate against
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateToolInput(toolName, input, toolDefs) {
  const tool = toolDefs.find(t => t.name === toolName)
  if (!tool) return { valid: false, errors: [`Unknown tool: ${toolName}`] }

  const errors = []
  const required = tool.input_schema.required || []
  for (const field of required) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      errors.push(`Missing required field: ${field}`)
    }
  }
  return { valid: errors.length === 0, errors }
}

module.exports = { CHIEF_TOOLS, CEO_TOOLS, validateToolInput }
