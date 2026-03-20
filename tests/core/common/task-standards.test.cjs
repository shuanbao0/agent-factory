'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  parseTaskStandards,
  getTaskTypeStandards,
  getGeneralStandards,
  extractChecklist,
} = require('../../../core/common/task-standards.cjs')

describe('task-standards', () => {

  const SAMPLE = `# 任务标准

## GENERAL

### 完成定义
- 产出文件存在且内容完整
- 通过自检评分 ≥ 策略阈值

### 质量检查清单
1. 是否完成了任务要求的所有内容？
2. 是否有明显的错误或遗漏？
3. 格式和表述是否规范？
4. 是否可以交付给下一环节？

### DO
- 完成后通过 API 更新任务状态

### DON'T
- 不提交未自检的产出

## TYPES

### writing
**完成定义：** 文稿完整，无未完成章节
**质量检查清单：**
1. 情节是否连贯？
2. 文笔质量是否达标？
3. 字数是否达到要求？
**DO：** 参考角色设定
**DON'T：** 不偏离大纲

### coding
**完成定义：** 代码可运行，有基本测试
**质量检查清单：**
1. 代码是否能编译/运行？
2. 核心逻辑是否有测试？
3. 是否有安全漏洞？
**DO：** 遵循编码规范
**DON'T：** 不引入未审批依赖

### research
**完成定义：** 研究报告完整
**质量检查清单：**
1. 数据来源是否可靠？
2. 分析是否全面？
**DO：** 标注数据来源
**DON'T：** 不编造数据
`

  describe('parseTaskStandards', () => {
    it('should parse general and types sections', () => {
      const result = parseTaskStandards(SAMPLE)
      assert.ok(result.general.includes('完成定义'))
      assert.ok(result.general.includes('质量检查清单'))
      assert.ok(result.types.includes('### writing'))
      assert.ok(result.types.includes('### coding'))
      assert.ok(result.types.includes('### research'))
    })

    it('should return empty strings for missing sections', () => {
      const result = parseTaskStandards('# Nothing')
      assert.equal(result.general, '')
      assert.equal(result.types, '')
    })

    it('should handle empty input', () => {
      const result = parseTaskStandards('')
      assert.equal(result.general, '')
      assert.equal(result.types, '')
    })
  })

  describe('getTaskTypeStandards', () => {
    it('should extract writing standards', () => {
      const { types } = parseTaskStandards(SAMPLE)
      const writing = getTaskTypeStandards(types, 'writing')
      assert.ok(writing.includes('文稿完整'))
      assert.ok(writing.includes('情节是否连贯'))
    })

    it('should extract coding standards', () => {
      const { types } = parseTaskStandards(SAMPLE)
      const coding = getTaskTypeStandards(types, 'coding')
      assert.ok(coding.includes('代码可运行'))
      assert.ok(coding.includes('安全漏洞'))
    })

    it('should return null for unknown type', () => {
      const { types } = parseTaskStandards(SAMPLE)
      assert.equal(getTaskTypeStandards(types, 'nonexistent'), null)
    })

    it('should return null for empty types', () => {
      assert.equal(getTaskTypeStandards('', 'writing'), null)
      assert.equal(getTaskTypeStandards(null, 'writing'), null)
    })
  })

  describe('getGeneralStandards', () => {
    it('should return general section content', () => {
      const { general } = parseTaskStandards(SAMPLE)
      const result = getGeneralStandards(general)
      assert.ok(result.includes('完成定义'))
    })

    it('should return empty string for empty input', () => {
      assert.equal(getGeneralStandards(''), '')
    })
  })

  describe('extractChecklist', () => {
    it('should extract checklist from type standards', () => {
      const { types } = parseTaskStandards(SAMPLE)
      const writing = getTaskTypeStandards(types, 'writing')
      const checklist = extractChecklist(writing)
      assert.equal(checklist.length, 3)
      assert.ok(checklist[0].includes('情节是否连贯'))
      assert.ok(checklist[1].includes('文笔质量'))
      assert.ok(checklist[2].includes('字数'))
    })

    it('should extract checklist from general standards', () => {
      const { general } = parseTaskStandards(SAMPLE)
      const checklist = extractChecklist(general)
      assert.equal(checklist.length, 4)
      assert.ok(checklist[0].includes('任务要求'))
    })

    it('should extract coding checklist', () => {
      const { types } = parseTaskStandards(SAMPLE)
      const coding = getTaskTypeStandards(types, 'coding')
      const checklist = extractChecklist(coding)
      assert.equal(checklist.length, 3)
      assert.ok(checklist[0].includes('编译'))
    })

    it('should return empty array for empty input', () => {
      assert.deepEqual(extractChecklist(''), [])
      assert.deepEqual(extractChecklist(null), [])
    })

    it('should return empty array for text without numbered items', () => {
      assert.deepEqual(extractChecklist('No numbered items here'), [])
    })
  })
})
