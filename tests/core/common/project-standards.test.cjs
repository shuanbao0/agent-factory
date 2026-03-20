'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  parseProjectStandards,
  getPhaseStandards,
  buildProjectStandardsMd,
  stripMarkerBlock,
  MARKER_BEGIN,
  MARKER_END,
} = require('../../../core/common/project-standards.cjs')

describe('project-standards', () => {

  const SAMPLE = `# 项目标准

## LIFECYCLE

### requirements
**入口条件：** 项目已创建
**出口条件：** 需求文档完成
**交付物：**
- 需求文档

### design
**入口条件：** 需求已确认
**出口条件：** 设计方案已确定
**交付物：**
- 设计文档

### development
**入口条件：** 设计已确认
**出口条件：** 功能已实现
**交付物：**
- 功能代码

## BOUNDARIES

### DO
- 所有产出写入项目目录

### DON'T
- 不跳过需求阶段
`

  describe('parseProjectStandards', () => {
    it('should parse lifecycle and boundaries sections', () => {
      const result = parseProjectStandards(SAMPLE)
      assert.ok(result.lifecycle.includes('### requirements'))
      assert.ok(result.lifecycle.includes('### design'))
      assert.ok(result.lifecycle.includes('### development'))
      assert.ok(result.boundaries.includes('### DO'))
      assert.ok(result.boundaries.includes("### DON'T"))
    })

    it('should return empty strings for missing sections', () => {
      const result = parseProjectStandards('# Nothing here')
      assert.equal(result.lifecycle, '')
      assert.equal(result.boundaries, '')
    })

    it('should handle empty input', () => {
      const result = parseProjectStandards('')
      assert.equal(result.lifecycle, '')
      assert.equal(result.boundaries, '')
    })
  })

  describe('getPhaseStandards', () => {
    it('should extract a specific phase', () => {
      const { lifecycle } = parseProjectStandards(SAMPLE)
      const req = getPhaseStandards(lifecycle, 'requirements')
      assert.ok(req.includes('入口条件'))
      assert.ok(req.includes('出口条件'))
      assert.ok(req.includes('需求文档'))
    })

    it('should extract design phase', () => {
      const { lifecycle } = parseProjectStandards(SAMPLE)
      const design = getPhaseStandards(lifecycle, 'design')
      assert.ok(design.includes('设计方案'))
    })

    it('should return null for unknown phase', () => {
      const { lifecycle } = parseProjectStandards(SAMPLE)
      const result = getPhaseStandards(lifecycle, 'nonexistent')
      assert.equal(result, null)
    })

    it('should return null for empty lifecycle', () => {
      assert.equal(getPhaseStandards('', 'requirements'), null)
      assert.equal(getPhaseStandards(null, 'requirements'), null)
    })
  })

  describe('buildProjectStandardsMd', () => {
    it('should include markers', () => {
      const parsed = parseProjectStandards(SAMPLE)
      const md = buildProjectStandardsMd(parsed)
      assert.ok(md.includes(MARKER_BEGIN))
      assert.ok(md.includes(MARKER_END))
    })

    it('should include lifecycle and boundaries', () => {
      const parsed = parseProjectStandards(SAMPLE)
      const md = buildProjectStandardsMd(parsed)
      assert.ok(md.includes('生命周期标准'))
      assert.ok(md.includes('项目边界'))
    })

    it('should highlight current phase when meta is provided', () => {
      const parsed = parseProjectStandards(SAMPLE)
      const meta = {
        currentPhase: 2,
        phases: [
          { labelEn: 'requirements', labelZh: '需求' },
          { labelEn: 'design', labelZh: '设计' },
        ],
      }
      const md = buildProjectStandardsMd(parsed, meta)
      assert.ok(md.includes('当前阶段: **设计**'))
    })

    it('should handle empty parsed result', () => {
      const md = buildProjectStandardsMd({ lifecycle: '', boundaries: '' })
      assert.ok(md.includes(MARKER_BEGIN))
      assert.ok(md.includes(MARKER_END))
    })
  })

  describe('stripMarkerBlock', () => {
    it('should strip existing marker block', () => {
      const content = `Before\n${MARKER_BEGIN}\nStandards content\n${MARKER_END}\nAfter`
      const result = stripMarkerBlock(content)
      assert.ok(!result.includes(MARKER_BEGIN))
      assert.ok(!result.includes('Standards content'))
      assert.ok(result.includes('After'))
    })

    it('should return content unchanged if no markers', () => {
      const content = 'No markers here'
      assert.equal(stripMarkerBlock(content), content)
    })

    it('should be idempotent', () => {
      const content = `${MARKER_BEGIN}\nContent\n${MARKER_END}`
      const first = stripMarkerBlock(content)
      const second = stripMarkerBlock(first)
      assert.equal(first, second)
    })
  })
})
