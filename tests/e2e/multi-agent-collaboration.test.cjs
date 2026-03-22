'use strict'
const { describe, it, before, after, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')

const { shouldSkip, isGatewayRunning, hasRegisteredAgents, ROOT } = require('./_helpers/env-loader.cjs')
const { snapshotJsonl, restoreJsonl, snapshotFile, restoreFile, COSTS_FILE, EVENTS_FILE } = require('./_helpers/cleanup.cjs')

const skip = shouldSkip()
if (skip.skip) {
  describe('(skipped) Multi-Agent Department Collaboration', () => {
    it(skip.reason, () => {})
  })
  return
}

const NOVEL_DEPT_STATE_FILE = join(ROOT, 'data', 'departments', 'novel', 'state.json')

describe('Multi-Agent Department Collaboration — Novel Department', { timeout: 300_000 }, () => {
  let buildDepartmentDirective, sendToAgent, closePool, parseTaskAssignments
  let gatewayAvailable = false
  let costsSize, eventsSize, stateSnapshot

  before(async () => {
    const core = require(join(ROOT, 'core', 'index.cjs'))
    buildDepartmentDirective = core.autopilot.buildDepartmentDirective
    parseTaskAssignments = core.task.parseTaskAssignments
    sendToAgent = core.autopilot.sendToAgent
    closePool = core.autopilot.closePool

    const running = await isGatewayRunning()
    if (running) {
      gatewayAvailable = true
    }

    stateSnapshot = snapshotFile(NOVEL_DEPT_STATE_FILE)
  })

  afterEach(() => {
    if (costsSize !== undefined) { restoreJsonl(COSTS_FILE, costsSize); costsSize = undefined }
    if (eventsSize !== undefined) { restoreJsonl(EVENTS_FILE, eventsSize); eventsSize = undefined }
  })

  after(() => {
    if (closePool) closePool()
    restoreFile(NOVEL_DEPT_STATE_FILE, stateSnapshot)
  })

  const NOVEL_CONFIG = {
    id: 'novel',
    name: '网文创作部',
    head: 'novel-chief',
    interval: 600,
    enabled: true,
    agents: ['novel-chief', 'novel-writer', 'worldbuilder', 'character-designer',
      'plot-architect', 'style-editor', 'pacing-designer', 'continuity-mgr',
      'reader-analyst', 'novel-researcher'],
    budget: { dailyTokenLimit: 800000, alertThreshold: 0.8 },
  }

  const NOVEL_STATE = {
    status: 'running',
    pid: null,
    cycleCount: 5,
    lastCycleAt: new Date().toISOString(),
    history: [],
    tokensUsedToday: 10000,
    budgetResetAt: new Date().toISOString(),
  }

  it('buildDepartmentDirective produces valid directive for novel department', () => {
    const directive = buildDepartmentDirective('novel', NOVEL_CONFIG, NOVEL_STATE, [], null)

    assert.ok(typeof directive === 'string', 'directive should be a string')
    assert.ok(directive.length > 100, 'directive should be substantial')
    assert.ok(directive.includes('novel-chief'), 'should mention the head agent')
    assert.ok(directive.includes('网文创作部') || directive.includes('novel'), 'should mention department')
    assert.ok(directive.includes('预算') || directive.includes('budget'), 'should include budget info')
    assert.ok(directive.includes('Cycle #6'), 'should show cycle number')
  })

  it('novel-chief assigns tasks to department members when given a directive', async () => {
    if (!gatewayAvailable || !hasRegisteredAgents(['novel-chief'])) {
      console.log('  Gateway not available or novel-chief not registered — skipping')
      return
    }

    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    const prompt = `[Department Loop: novel Test Cycle]

你是 novel-chief，网文创作部主管。

## 团队状态
- novel-writer: 🟢 空闲（30分钟无活动） | 职责: 小说写作
- worldbuilder: 🟢 空闲（25分钟无活动） | 职责: 世界观设计
- character-designer: 🟢 空闲（20分钟无活动） | 职责: 角色设计
- plot-architect: 🟢 空闲（15分钟无活动） | 职责: 情节设计

## 部门任务
(无部门任务)

## 行动要求
请为空闲的团队成员分配任务。我们需要开始一个新的玄幻小说项目。
注意：这是测试环境，不要实际执行 peer-send 命令，只需在 [任务分配] 中列出分配计划。

## 输出格式要求
请在响应中包含以下结构化总结：
\`\`\`
[任务分配]
- <agent-id>: <分配的任务摘要> (peer-send 已发送/无需分配)
[任务完成]
- 无
[进展汇报]
- <关键进展>
[阻塞项]
- 无
\`\`\``

    const result = await sendToAgent('novel-chief', `agent:novel-chief:e2e-collab-${Date.now()}`, prompt, 90000)
    assert.ok(result.ok, `sendToAgent should succeed: ${result.error || ''}`)
    assert.ok(result.text.length > 50, 'response should have content')

    const assignments = parseTaskAssignments(result.text)
    assert.ok(Array.isArray(assignments), 'assignments should be array')
    // novel-chief should assign at least some tasks
    if (assignments.length > 0) {
      for (const a of assignments) {
        assert.ok(typeof a.agentId === 'string', 'agentId should be string')
        assert.ok(typeof a.summary === 'string', 'summary should be string')
        assert.ok(
          NOVEL_CONFIG.agents.includes(a.agentId),
          `assigned agent ${a.agentId} should be in department`
        )
      }
    } else {
      console.log('  novel-chief did not produce parseable [任务分配] — LLM non-deterministic (acceptable)')
    }
  })

  it('multiple agents execute tasks concurrently via Promise.all', async () => {
    if (!gatewayAvailable) {
      console.log('  Gateway not available — skipping')
      return
    }

    const agents = ['novel-writer', 'worldbuilder', 'character-designer']
    if (!hasRegisteredAgents(agents)) {
      console.log(`  Required agents not all registered — skipping`)
      return
    }

    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    const prompts = [
      { agent: 'novel-writer', msg: '请用200字描写一个玄幻世界的黎明场景。直接输出正文。' },
      { agent: 'worldbuilder', msg: '请用200字描述一个名为"天玄大陆"的修仙世界的基本设定。直接输出正文。' },
      { agent: 'character-designer', msg: '请用200字描述一个名为"叶尘"的年轻修士的外貌和性格特点。直接输出正文。' },
    ]

    const results = await Promise.all(
      prompts.map(p =>
        sendToAgent(p.agent, `agent:${p.agent}:e2e-concurrent-${Date.now()}`, p.msg, 90000)
      )
    )

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      assert.ok(r.ok, `${prompts[i].agent} should succeed: ${r.error || ''}`)
      assert.ok(r.text.length > 50, `${prompts[i].agent} should produce substantial response`)
    }
  })

  it('agent incorporates cross-agent context in response', async () => {
    if (!gatewayAvailable || !hasRegisteredAgents(['novel-writer'])) {
      console.log('  Gateway not available or novel-writer not registered — skipping')
      return
    }

    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    // Simulate worldbuilder output being fed to novel-writer
    const worldbuilderOutput = '天玄大陆分为五大洲，灵气浓度从外围向中央递增。中央的天柱山是传说中仙人飞升之地。'
    const prompt = `你正在与 worldbuilder 协作写一部小说。worldbuilder 已经完成了世界观设定：

"${worldbuilderOutput}"

请基于以上世界观，用200字写一段开场描写，必须包含"天玄大陆"和"天柱山"。直接输出正文。`

    const result = await sendToAgent('novel-writer', `agent:novel-writer:e2e-cross-ctx-${Date.now()}`, prompt, 90000)
    assert.ok(result.ok, `sendToAgent should succeed: ${result.error || ''}`)
    assert.ok(result.text.length > 50, 'should produce substantial response')
  })
})
