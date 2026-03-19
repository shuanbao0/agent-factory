'use strict'
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('path')

const { shouldSkip, isGatewayRunning, hasRegisteredAgents, ROOT } = require('./_helpers/env-loader.cjs')
const { snapshotJsonl, restoreJsonl, COSTS_FILE, EVENTS_FILE } = require('./_helpers/cleanup.cjs')

const skip = shouldSkip()
if (skip.skip) {
  describe('(skipped) Task Pipeline & Dependencies', () => {
    it(skip.reason, () => {})
  })
  return
}

// Novel department pipeline config (mirrors config/departments/novel/config.json)
const NOVEL_PIPELINE = [
  {
    from: 'writing', to: 'editing',
    qualityGate: {
      minScore: 75, requireSelfCheck: true, maxReworks: 3,
      validators: ['wordCount', 'noEndingKeywords', 'similarity'],
      validatorConfig: {
        wordCount: { min: 3000 },
        noEndingKeywords: { keywords: ['全书完', '大结局', '（完）', 'THE END', '完结', '终章'] },
        similarity: { maxRepeatRatio: 0.3, minBlockSize: 100 },
      },
    },
  },
  {
    from: 'editing', to: 'review',
    qualityGate: {
      minScore: 75, requireSelfCheck: true, requirePeerReview: true, maxReworks: 2,
    },
  },
]

const TASK_TYPES = [
  { value: 'writing', labelEn: 'Writing' },
  { value: 'editing', labelEn: 'Editing' },
  { value: 'review', labelEn: 'Review' },
]

// Long sample output (>3000 bytes) for passing wordCount validator — must be diverse to pass similarity check
const LONG_OUTPUT_PARTS = [
  '在晨曦初绽的古城广场上，身披银灰色斗篷的旅者缓缓步入人群之中。他的目光如同深邃的湖水，沉静而充满故事。',
  '腰间悬挂着一柄古老的长剑，剑鞘上镌刻着已经褪色的家族纹章——一只展翅的鹰隼与三颗星辰。',
  '他的名字叫做艾尔温，曾是北境守卫军的精锐骑士，如今却以孤独行者的身份游走于大陆各地。',
  '三年前的那场战役改变了一切：他的部队在暴风雪中遭遇伏击，二十七名战友永远留在了冰原之上。',
  '作为唯一的幸存者，他背负着无法言说的愧疚，发誓要找到那场阴谋背后的真相。',
  '每一个夜晚，当篝火的光芒映照着他棱角分明的面庞时，他都会从怀中取出一枚磨得发亮的铜币。',
  '那是他最年轻的战友留给他的最后遗物。他知道，这段旅程才刚刚开始。',
  '前方等待他的将是比暴风雪更加凶险的考验。但他已不再恐惧，因为他明白，唯有直面黑暗。',
  '才能为那些逝去的灵魂找到安息之所。他抬起头，望向远方连绵的山脉，深吸一口清晨的空气。',
  '街道两旁的店铺陆续开门，烤面包的香气混合着铁匠铺的烟火味，弥漫在整条长街上。',
  '一个卖花的老妇人推着木车经过，车上满是刚从野外采摘的紫色薰衣草和金色的雏菊。',
  '三两个小孩追逐着一只灰色的野猫，笑声在石板路上回荡。城墙上的钟声敲响了第七下。',
  '守城的士兵换岗完毕，新来的年轻士兵还在打着哈欠。集市中心的喷泉已经开始喷水。',
  '一群白鸽从教堂的塔尖飞起，在蓝色的天空中画出优雅的弧线。这就是古城伯恩利的清晨。',
  '艾尔温在一家名为"醉酒诗人"的旅店前停下脚步。木质招牌上画着一个手持酒杯的吟游诗人。',
  '他推开厚重的橡木门，一股温暖的空气扑面而来。壁炉里的火焰正欢快地跳动着。',
  '酒保是个红脸膛的中年男人，正在擦拭玻璃酒杯。几个早起的旅客坐在角落里低声交谈。',
  '艾尔温走到吧台前，放下一枚银币。酒保抬起头，审视了他一眼，然后倒了一杯黑麦酒。',
  '"北方来的？"酒保问道，目光落在他斗篷上结着的冰霜。艾尔温点了点头，没有多说。',
  '他喝了一口酒，感受着温热的液体驱散身体里最后的寒意。窗外的阳光逐渐变得明亮。',
  '角落里一个穿着深绿色长袍的老人引起了艾尔温的注意。老人面前摊着一张泛黄的地图。',
  '地图上标记着许多奇怪的符号，有些地方被红色墨水圈了出来。老人似乎在喃喃自语。',
  '艾尔温端着酒杯走过去，礼貌地坐在老人对面。老人抬起头，浑浊的双眼突然闪过一丝精光。',
  '"年轻人，你的剑上沾着北境冰原的寒气。"老人低声说道，"你见过那些在暴风雪中行走的幽灵吗？"',
  '这句话让艾尔温的手微微一颤。他放下酒杯，认真地看着老人。"你知道些什么？"他问道。',
  '老人用枯瘦的手指点了点地图上一个被红圈标记的位置。那是北境最深处的一座古堡。',
  '"银鸦堡，"老人说道，"三百年前的大法师在那里封印了某种东西。而三年前的那场暴风雪——"',
  '他停顿了一下，目光变得格外深邃，"并非天灾。有人打开了封印的第一道锁。"',
]
const LONG_OUTPUT = LONG_OUTPUT_PARTS.join('\n')

// Short output (<3000 bytes) for failing wordCount validator
const SHORT_OUTPUT = '这是一段太短的文字，不满足字数要求。'

describe('Task Pipeline & Dependencies — Novel Workflow', { timeout: 180_000 }, () => {
  let applyCompletionWorkflow, checkQualityGate, runValidator, createPipelineTask, createReworkTask, transition
  let sendToAgent, closePool
  let gatewayAvailable = false
  let costsSize, eventsSize

  before(async () => {
    const core = require(join(ROOT, 'core', 'index.cjs'))
    applyCompletionWorkflow = core.task.applyCompletionWorkflow
    checkQualityGate = core.task.checkQualityGate
    runValidator = core.task.runValidator
    createPipelineTask = core.task.createPipelineTask
    createReworkTask = core.task.createReworkTask
    transition = core.task.transition

    const running = await isGatewayRunning()
    if (running && hasRegisteredAgents(['novel-writer'])) {
      sendToAgent = core.autopilot.sendToAgent
      closePool = core.autopilot.closePool
      gatewayAvailable = true
    }
  })

  after(() => {
    if (closePool) closePool()
    if (costsSize !== undefined) restoreJsonl(COSTS_FILE, costsSize)
    if (eventsSize !== undefined) restoreJsonl(EVENTS_FILE, eventsSize)
  })

  function makeTask(overrides) {
    const now = new Date().toISOString()
    return {
      id: `zzz-test-pipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: '测试写作任务',
      status: 'review',
      type: 'writing',
      priority: 'P1',
      assignees: ['novel-writer'],
      assignedAgent: 'novel-writer',
      dependencies: [],
      creator: 'e2e-test',
      progress: 100,
      projectId: 'novel',
      quality: {
        selfCheck: { passed: true, score: 85, checklist: [], at: now },
      },
      output: LONG_OUTPUT,
      reworkCount: 0,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }
  }

  it('writing task completion triggers editing pipeline task', () => {
    const task = makeTask({ status: 'completed' })
    const result = applyCompletionWorkflow(task, { status: 'completed' }, NOVEL_PIPELINE[0], TASK_TYPES)

    assert.ok(result.gate.passed, `gate should pass, errors: ${result.gate.errors}`)
    assert.ok(result.pipelineTask, 'pipelineTask should be created')
    assert.equal(result.pipelineTask.type, 'editing')
    assert.ok(result.pipelineTask.dependencies.includes(task.id), 'should depend on writing task')
    assert.equal(result.pipelineTask.status, 'pending')
    assert.equal(result.pipelineTask.projectId, 'novel')
  })

  it('short output triggers rework via wordCount validator', () => {
    const task = makeTask({ status: 'completed', output: SHORT_OUTPUT })
    const result = applyCompletionWorkflow(task, { status: 'completed' }, NOVEL_PIPELINE[0], TASK_TYPES)

    assert.equal(result.gate.passed, false)
    assert.equal(result.gate.shouldRework, true)
    assert.ok(result.reworkTask, 'reworkTask should be created')
    assert.ok(result.reworkTask.name.startsWith('[Rework]'))
    assert.equal(result.updates.status, 'rework')
    assert.equal(result.updates.reworkCount, 1)
  })

  it('exceeding maxReworks escalates to failed', () => {
    const task = makeTask({ status: 'completed', output: SHORT_OUTPUT, reworkCount: 3 })
    const result = applyCompletionWorkflow(task, { status: 'completed' }, NOVEL_PIPELINE[0], TASK_TYPES)

    assert.equal(result.gate.passed, false)
    assert.equal(result.gate.escalate, true)
    assert.equal(result.updates.status, 'failed')
  })

  it('editing completion with peer review triggers review pipeline task', () => {
    const now = new Date().toISOString()
    const task = makeTask({
      type: 'editing',
      status: 'completed',
      quality: {
        selfCheck: { passed: true, score: 80, checklist: [], at: now },
        peerReview: { reviewer: 'reader-analyst', passed: true, score: 82, comments: 'good', at: now },
      },
    })
    const result = applyCompletionWorkflow(task, { status: 'completed' }, NOVEL_PIPELINE[1], TASK_TYPES)

    assert.ok(result.gate.passed, `gate should pass, errors: ${result.gate.errors}`)
    assert.ok(result.pipelineTask, 'pipelineTask should be created')
    assert.equal(result.pipelineTask.type, 'review')
    assert.ok(result.pipelineTask.dependencies.includes(task.id))
  })

  it('noEndingKeywords validator catches forbidden endings', () => {
    const errors = runValidator('noEndingKeywords', { output: '一段精彩的文字……全书完' }, { keywords: ['全书完'] })
    assert.ok(errors.length > 0, 'should catch forbidden ending keyword')
    assert.ok(errors[0].includes('全书完'))
  })

  it('similarity validator catches repetitive content', () => {
    // Create a block exactly 100 chars long, then repeat it many times
    // The validator slices by 100-char steps, so identical 100-char blocks will be detected
    const base = 'A'.repeat(100)
    const repetitive = base.repeat(20) // 2000 chars, all identical 100-char blocks
    const errors = runValidator('similarity', { output: repetitive }, { maxRepeatRatio: 0.3, minBlockSize: 100 })
    assert.ok(errors.length > 0, 'should catch repetitive content')
  })

  it('task dependency chain: transitions work through full lifecycle', () => {
    const now = new Date().toISOString()
    const taskA = {
      id: `zzz-test-depA-${Date.now()}`,
      name: 'Task A', status: 'pending', priority: 'P1',
      assignees: ['novel-writer'], assignedAgent: 'novel-writer',
      dependencies: [], creator: 'e2e-test', progress: 0,
      createdAt: now, updatedAt: now,
    }
    const taskB = {
      id: `zzz-test-depB-${Date.now()}`,
      name: 'Task B', status: 'pending', priority: 'P1',
      assignees: ['worldbuilder'], assignedAgent: 'worldbuilder',
      dependencies: [taskA.id], creator: 'e2e-test', progress: 0,
      createdAt: now, updatedAt: now,
    }

    // Walk taskA through full lifecycle
    assert.ok(transition(taskA, 'assigned', { actor: 'chief' }).ok)
    assert.ok(transition(taskA, 'in_progress', { actor: 'novel-writer' }).ok)
    assert.ok(transition(taskA, 'review', { actor: 'novel-writer' }).ok)
    assert.ok(transition(taskA, 'completed', { actor: 'quality-gate' }).ok)
    assert.equal(taskA.status, 'completed')

    // Walk taskB through lifecycle (state machine doesn't enforce dependency — that's strategy layer)
    assert.ok(transition(taskB, 'assigned', { actor: 'chief' }).ok)
    assert.ok(transition(taskB, 'in_progress', { actor: 'worldbuilder' }).ok)
    assert.ok(transition(taskB, 'review', { actor: 'worldbuilder' }).ok)
    assert.ok(transition(taskB, 'completed', { actor: 'quality-gate' }).ok)
    assert.equal(taskB.status, 'completed')
  })

  it('real agent generates content and runs through pipeline validators', async () => {
    if (!gatewayAvailable) {
      console.log('  Gateway not available — skipping real agent test')
      return
    }

    costsSize = snapshotJsonl(COSTS_FILE)
    eventsSize = snapshotJsonl(EVENTS_FILE)

    const result = await sendToAgent(
      'novel-writer',
      'agent:novel-writer:e2e-pipeline',
      '请写一段至少3000字的玄幻小说章节开头。要求：场景描写详细，有人物对话，有动作描写。不要写"全书完"、"终章"等结尾性词语。直接输出正文，不要加标题或说明。',
      90000
    )

    assert.ok(result.ok, `sendToAgent should succeed: ${result.error || ''}`)
    assert.ok(result.text.length > 50, 'response should have substantial content')

    // Run all 3 validators against real output — verify they don't crash
    const output = result.text
    const wcErrors = runValidator('wordCount', { output }, { min: 100 })
    assert.ok(Array.isArray(wcErrors), 'wordCount validator should return array')

    const nekErrors = runValidator('noEndingKeywords', { output }, {
      keywords: ['全书完', '大结局', '（完）', 'THE END', '完结', '终章'],
    })
    assert.ok(Array.isArray(nekErrors), 'noEndingKeywords validator should return array')

    const simErrors = runValidator('similarity', { output }, { maxRepeatRatio: 0.3, minBlockSize: 100 })
    assert.ok(Array.isArray(simErrors), 'similarity validator should return array')
  })
})
