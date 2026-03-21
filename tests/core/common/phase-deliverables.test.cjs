'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  parsePhaseDeliverables,
  interpolateTemplate,
  getDeliverablesForPhase,
} = require('../../../core/common/phase-deliverables.cjs')

const SAMPLE = `# 阶段交付物模板

## UNIVERSAL

### requirements

#### docs/requirements.md
\`\`\`
# 需求文档
**项目：** {projectName}
**日期：** {date}
## 功能需求
\`\`\`

#### docs/user-stories.md
\`\`\`
# 用户故事
**项目：** {projectName}
\`\`\`

### design

#### design/architecture.md
\`\`\`
# 架构设计
**项目：** {projectName}
\`\`\`

### development

#### src/README.md
\`\`\`
# 源代码
**项目：** {projectName}
\`\`\`
`

describe('phase-deliverables', () => {

  describe('parsePhaseDeliverables', () => {
    it('should parse phases with deliverable files', () => {
      const result = parsePhaseDeliverables(SAMPLE)
      assert.ok(result.requirements)
      assert.equal(result.requirements.length, 2)
      assert.equal(result.requirements[0].path, 'docs/requirements.md')
      assert.ok(result.requirements[0].template.includes('需求文档'))
      assert.ok(result.requirements[0].template.includes('{projectName}'))
    })

    it('should parse multiple phases', () => {
      const result = parsePhaseDeliverables(SAMPLE)
      assert.ok(result.design)
      assert.equal(result.design.length, 1)
      assert.equal(result.design[0].path, 'design/architecture.md')
      assert.ok(result.development)
      assert.equal(result.development.length, 1)
    })

    it('should return empty for missing phases', () => {
      const result = parsePhaseDeliverables(SAMPLE)
      assert.equal(result.testing, undefined)
      assert.equal(result.delivery, undefined)
    })

    it('should return empty for empty input', () => {
      const result = parsePhaseDeliverables('')
      assert.deepEqual(result, {})
    })

    it('should return empty for input without UNIVERSAL section', () => {
      const result = parsePhaseDeliverables('# Something else\n## OTHER\n')
      assert.deepEqual(result, {})
    })
  })

  describe('interpolateTemplate', () => {
    it('should replace placeholders', () => {
      const result = interpolateTemplate('**项目：** {projectName}\n**日期：** {date}', {
        projectName: '影子城市',
        date: '2026-03-21',
      })
      assert.ok(result.includes('影子城市'))
      assert.ok(result.includes('2026-03-21'))
      assert.ok(!result.includes('{projectName}'))
    })

    it('should handle missing vars gracefully', () => {
      const result = interpolateTemplate('**项目：** {projectName}', {})
      assert.ok(result.includes('{projectName}'))
    })

    it('should replace multiple occurrences', () => {
      const result = interpolateTemplate('{x} and {x}', { x: 'OK' })
      assert.equal(result, 'OK and OK')
    })
  })

  describe('getDeliverablesForPhase', () => {
    it('should return universal deliverables from loaded config', () => {
      // This reads the actual config/phase-deliverables.md file
      const deliverables = getDeliverablesForPhase('requirements')
      assert.ok(deliverables.length >= 1)
      assert.ok(deliverables[0].path.includes('requirements'))
    })

    it('should prefer department override', () => {
      const deptConfig = {
        workflow: {
          phaseDeliverables: {
            worldbuilding: [
              { path: 'docs/world-bible.md', template: '# World Bible\n{projectName}' },
            ],
          },
        },
      }
      const deliverables = getDeliverablesForPhase('worldbuilding', deptConfig)
      assert.equal(deliverables.length, 1)
      assert.equal(deliverables[0].path, 'docs/world-bible.md')
    })

    it('should fall back to universal when dept has no override', () => {
      const deptConfig = { workflow: { phaseDeliverables: {} } }
      const deliverables = getDeliverablesForPhase('requirements', deptConfig)
      assert.ok(deliverables.length >= 1)
    })

    it('should return empty for unknown phase', () => {
      const deliverables = getDeliverablesForPhase('nonexistent-phase')
      assert.deepEqual(deliverables, [])
    })
  })
})
