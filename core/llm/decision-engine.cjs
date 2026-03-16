'use strict'
/**
 * DecisionEngine — Chief/CEO 结构化决策引擎
 *
 * 设计模式：Strategy + Command
 *
 * 职责：
 * - 将 DirectiveBuilder 构建的指令文本 + 工具定义发送到 Anthropic API
 * - 解析返回的 tool_use 调用为结构化决策列表
 * - 替代旧版的正则解析方案（parseTaskAssignments / fallbackDispatch 猜测）
 *
 * 调用方式：
 *   const result = await makeChiefDecision(directive, deptId, { model, logger })
 *   // result.decisions: [{ tool: 'assign_task', input: { agentId, taskSummary } }, ...]
 *
 *   const ceoResult = await makeCeoDecision(directive, { model, logger })
 *   // ceoResult.decisions: [{ tool: 'issue_directive', input: { department, directive } }, ...]
 */

const { sendWithTools } = require('./anthropic-client.cjs')
const { CHIEF_TOOLS, CEO_TOOLS, validateToolInput } = require('./chief-tools.cjs')

/** 部门主管的系统提示词 */
const CHIEF_SYSTEM_PROMPT = `你是部门主管（chief），负责管理部门内的 agent 团队。

你的职责：
1. 分析当前部门状态（任务进度、agent 空闲情况、质量反馈）
2. 做出决策：分配新任务、确认完成、退回返工、或报告进展
3. 如果当前无需操作，使用 no_action 工具明确说明原因

重要规则：
- 必须使用提供的工具来表达决策，不要用纯文本描述分配
- 每个决策对应一次工具调用
- agentId 必须是部门内已有成员的 ID
- taskId 格式为 task-xxx
- 如果所有 agent 都在忙碌或没有待分配的任务，使用 no_action`

/** CEO 的系统提示词 */
const CEO_SYSTEM_PROMPT = `你是公司 CEO，负责跨部门协调和战略决策。

你的职责：
1. 审视各部门的运营状态和进展
2. 向部门发出指令或调整优先级
3. 标记需要人工介入的问题
4. 如果一切运行正常，使用 no_action

重要规则：
- 使用工具表达决策
- 只在需要干预时发出指令
- 不要重复已有的指令`

/**
 * 为部门主管生成结构化决策
 *
 * 流程：发送指令 → API 返回 tool_use → 校验参数 → 收集有效决策
 *
 * @param {string} directive - 完整指令文本（由 DirectiveBuilder 构建）
 * @param {string} deptId - 部门 ID（用于日志）
 * @param {Object} [opts]
 * @param {string} [opts.model] - 覆盖默认模型
 * @param {Object} [opts.logger] - 日志实例
 * @returns {Promise<{ok: boolean, decisions: Array<{tool: string, input: Object}>, text: string, usage?: Object, error?: string}>}
 */
async function makeChiefDecision(directive, deptId, opts = {}) {
  const logger = opts.logger
  const startTime = Date.now()

  logger?.info?.('decision-engine', `Making chief decision for dept ${deptId}`)

  const result = await sendWithTools({
    system: CHIEF_SYSTEM_PROMPT,
    user: directive,
    tools: CHIEF_TOOLS,
    model: opts.model,
  })

  const elapsed = Date.now() - startTime

  if (!result.ok) {
    logger?.error?.('decision-engine', `Chief decision failed for ${deptId}: ${result.error}`)
    return { ok: false, decisions: [], text: '', error: result.error }
  }

  // 校验并收集有效决策（跳过参数不完整的工具调用）
  const decisions = []
  for (const call of result.toolCalls) {
    const validation = validateToolInput(call.name, call.input, CHIEF_TOOLS)
    if (!validation.valid) {
      logger?.warn?.('decision-engine', `Invalid tool call ${call.name}: ${validation.errors.join(', ')}`)
      continue
    }
    decisions.push({ tool: call.name, input: call.input })
  }

  logger?.info?.('decision-engine', `Chief decision for ${deptId}: ${decisions.length} actions in ${elapsed}ms`)
  for (const d of decisions) {
    logger?.debug?.('decision-engine', `  → ${d.tool}: ${JSON.stringify(d.input)}`)
  }

  return {
    ok: true,
    decisions,
    text: result.text,
    usage: result.usage,
    model: result.model,
  }
}

/**
 * 为 CEO 生成结构化决策
 *
 * 与 makeChiefDecision 类似，但使用 CEO 专用的系统提示词和工具集
 *
 * @param {string} directive - 完整指令文本
 * @param {Object} [opts]
 * @param {string} [opts.model] - 覆盖默认模型
 * @param {Object} [opts.logger] - 日志实例
 * @returns {Promise<{ok: boolean, decisions: Array<{tool: string, input: Object}>, text: string, usage?: Object, error?: string}>}
 */
async function makeCeoDecision(directive, opts = {}) {
  const logger = opts.logger
  const startTime = Date.now()

  logger?.info?.('decision-engine', 'Making CEO decision')

  const result = await sendWithTools({
    system: CEO_SYSTEM_PROMPT,
    user: directive,
    tools: CEO_TOOLS,
    model: opts.model,
  })

  const elapsed = Date.now() - startTime

  if (!result.ok) {
    logger?.error?.('decision-engine', `CEO decision failed: ${result.error}`)
    return { ok: false, decisions: [], text: '', error: result.error }
  }

  const decisions = []
  for (const call of result.toolCalls) {
    const validation = validateToolInput(call.name, call.input, CEO_TOOLS)
    if (!validation.valid) {
      logger?.warn?.('decision-engine', `Invalid CEO tool call ${call.name}: ${validation.errors.join(', ')}`)
      continue
    }
    decisions.push({ tool: call.name, input: call.input })
  }

  logger?.info?.('decision-engine', `CEO decision: ${decisions.length} actions in ${elapsed}ms`)

  return {
    ok: true,
    decisions,
    text: result.text,
    usage: result.usage,
    model: result.model,
  }
}

module.exports = { makeChiefDecision, makeCeoDecision, CHIEF_SYSTEM_PROMPT, CEO_SYSTEM_PROMPT }
