'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  parseDeptStandards,
  getDeptTypeStandards,
} = require('../../../core/common/dept-standards.cjs')

describe('dept-standards', () => {

  const SAMPLE = `# 部门执行标准

## GENERAL

- **先完成再开始** — 已有进行中任务的 agent 不派新活
- **待办优先于新建** — 优先分配已存在的 pending 任务
- **无任务的空闲 agent 必须有事做**
- 卡住超过 2 轮的任务要换方式推进或换人
- 重要进展和阻塞立即上报

## TYPES

### novel
- **创意优先** — 鼓励创新表达
- **连贯性检查** — 角色设定跨章节一致
- **风格统一** — 文风、叙事视角一致

### dev
- **代码质量** — 评审必须检查可运行性
- **架构一致** — 新代码与现有架构一致
- **文档同步** — API 变更同步文档

### finance
- **合规优先** — 所有产出必须符合合规要求
- **数据准确** — 必须经过交叉验证
`

  describe('parseDeptStandards', () => {
    it('should parse general and types sections', () => {
      const result = parseDeptStandards(SAMPLE)
      assert.ok(result.general.includes('先完成再开始'))
      assert.ok(result.general.includes('待办优先于新建'))
      assert.ok(result.types.includes('### novel'))
      assert.ok(result.types.includes('### dev'))
      assert.ok(result.types.includes('### finance'))
    })

    it('should return empty strings for missing sections', () => {
      const result = parseDeptStandards('# Nothing here')
      assert.equal(result.general, '')
      assert.equal(result.types, '')
    })

    it('should handle empty input', () => {
      const result = parseDeptStandards('')
      assert.equal(result.general, '')
      assert.equal(result.types, '')
    })

    it('should handle only GENERAL section', () => {
      const result = parseDeptStandards('## GENERAL\n\n- Rule 1\n- Rule 2')
      assert.ok(result.general.includes('Rule 1'))
      assert.equal(result.types, '')
    })

    it('should handle only TYPES section', () => {
      const result = parseDeptStandards('## TYPES\n\n### dev\n- Code quality')
      assert.equal(result.general, '')
      assert.ok(result.types.includes('### dev'))
    })
  })

  describe('getDeptTypeStandards', () => {
    it('should extract novel standards', () => {
      const { types } = parseDeptStandards(SAMPLE)
      const novel = getDeptTypeStandards(types, 'novel')
      assert.ok(novel.includes('创意优先'))
      assert.ok(novel.includes('连贯性检查'))
      assert.ok(novel.includes('风格统一'))
    })

    it('should extract dev standards', () => {
      const { types } = parseDeptStandards(SAMPLE)
      const dev = getDeptTypeStandards(types, 'dev')
      assert.ok(dev.includes('代码质量'))
      assert.ok(dev.includes('架构一致'))
    })

    it('should extract finance standards', () => {
      const { types } = parseDeptStandards(SAMPLE)
      const finance = getDeptTypeStandards(types, 'finance')
      assert.ok(finance.includes('合规优先'))
      assert.ok(finance.includes('数据准确'))
    })

    it('should not bleed between sections', () => {
      const { types } = parseDeptStandards(SAMPLE)
      const novel = getDeptTypeStandards(types, 'novel')
      assert.ok(!novel.includes('代码质量'), 'novel should not contain dev standards')
    })

    it('should return null for unknown type', () => {
      const { types } = parseDeptStandards(SAMPLE)
      assert.equal(getDeptTypeStandards(types, 'nonexistent'), null)
    })

    it('should return null for empty types', () => {
      assert.equal(getDeptTypeStandards('', 'novel'), null)
      assert.equal(getDeptTypeStandards(null, 'novel'), null)
    })

    it('should return null for empty deptType', () => {
      const { types } = parseDeptStandards(SAMPLE)
      assert.equal(getDeptTypeStandards(types, ''), null)
      assert.equal(getDeptTypeStandards(types, null), null)
    })
  })
})
