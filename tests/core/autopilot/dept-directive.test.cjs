'use strict'
/**
 * DeptDirective — 部门指令构建单元测试
 *
 * 测试策略：测试 buildTeamStatus / buildDeptTasks / buildKpiStatus 的纯逻辑
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('autopilot/dept-directive', () => {
  describe('buildTeamStatus 逻辑', () => {
    // 内联复现 buildTeamStatus 核心逻辑（不依赖 repo）
    function buildTeamStatusSimple(agentIds, agentActivity, projects, statusQueryResults) {
      if (!agentIds || agentIds.length === 0) return '(无团队成员)'

      const inProgressCount = {}
      for (const proj of projects) {
        for (const t of (proj.tasks || [])) {
          if (t.status !== 'in_progress') continue
          const assignees = [t.assignedAgent, ...(t.assignees || [])].filter(Boolean)
          for (const a of assignees) {
            if (agentIds.includes(a)) {
              inProgressCount[a] = (inProgressCount[a] || 0) + 1
            }
          }
        }
      }

      let result = ''
      for (const agentId of agentIds) {
        const a = agentActivity[agentId]
        const taskCount = inProgressCount[agentId] || 0
        const taskSuffix = taskCount > 0 ? `, ${taskCount}个进行中任务` : ''

        const queryStatus = statusQueryResults && statusQueryResults[agentId]
        if (queryStatus) {
          let status
          if (queryStatus.working) status = '🔵 工作中'
          else if (queryStatus.completed) status = '✅ 已完成'
          else if (queryStatus.idle) status = '🟢 空闲'
          else if (queryStatus.timeout) status = '⚠️ 无响应'
          else status = '❓ 未知'
          result += `- ${agentId}: ${status}${taskSuffix}\n`
        } else if (a) {
          const status = a.idleMins < 5 ? '🔴 忙碌' : a.idleMins < 30 ? '🟡 刚完成' : '🟢 空闲'
          result += `- ${agentId}: ${status}（${a.idleMins}分钟无活动${taskSuffix}）\n`
        } else {
          result += `- ${agentId}: ⚪ 无记录\n`
        }
      }
      return result
    }

    it('无成员 → 返回提示', () => {
      assert.equal(buildTeamStatusSimple([], {}, []), '(无团队成员)')
    })

    it('活跃 agent → 显示忙碌', () => {
      const result = buildTeamStatusSimple(['writer'], { writer: { idleMins: 2 } }, [])
      assert.ok(result.includes('🔴 忙碌'))
      assert.ok(result.includes('2分钟'))
    })

    it('空闲 agent → 显示空闲', () => {
      const result = buildTeamStatusSimple(['editor'], { editor: { idleMins: 60 } }, [])
      assert.ok(result.includes('🟢 空闲'))
    })

    it('刚完成 agent → 显示刚完成', () => {
      const result = buildTeamStatusSimple(['proofer'], { proofer: { idleMins: 15 } }, [])
      assert.ok(result.includes('🟡 刚完成'))
    })

    it('无记录 agent → 显示无记录', () => {
      const result = buildTeamStatusSimple(['unknown'], {}, [])
      assert.ok(result.includes('⚪ 无记录'))
    })

    it('统计进行中任务数', () => {
      const projects = [{
        tasks: [
          { status: 'in_progress', assignedAgent: 'writer' },
          { status: 'in_progress', assignedAgent: 'writer' },
        ],
      }]
      const result = buildTeamStatusSimple(['writer'], { writer: { idleMins: 1 } }, projects)
      assert.ok(result.includes('2个进行中任务'))
    })

    it('双 Session 状态查询 — 工作中', () => {
      const result = buildTeamStatusSimple(['writer'], {}, [], { writer: { working: true } })
      assert.ok(result.includes('🔵 工作中'))
    })

    it('双 Session 状态查询 — 已完成', () => {
      const result = buildTeamStatusSimple(['writer'], {}, [], { writer: { completed: true } })
      assert.ok(result.includes('✅ 已完成'))
    })

    it('双 Session 状态查询 — 无响应', () => {
      const result = buildTeamStatusSimple(['writer'], {}, [], { writer: { timeout: true } })
      assert.ok(result.includes('⚠️ 无响应'))
    })
  })

  describe('buildDeptTasks 逻辑', () => {
    function buildDeptTasksSimple(agentIds, projects) {
      let result = ''
      for (const proj of projects) {
        const tasks = (proj.tasks || []).filter(t =>
          agentIds.includes(t.assignedAgent) || (t.assignees || []).some(a => agentIds.includes(a))
        )
        if (tasks.length === 0) continue
        result += `\n### ${proj.name}\n`
        const running = tasks.filter(t => t.status === 'in_progress')
        const review = tasks.filter(t => t.status === 'review')
        const pending = tasks.filter(t => t.status === 'pending')
        const completed = tasks.filter(t => t.status === 'completed')
        if (running.length > 0) result += `进行中: ${running.length}\n`
        if (review.length > 0) result += `待确认: ${review.length}\n`
        if (pending.length > 0) result += `待办: ${pending.length}\n`
        result += `完成: ${completed.length}/${tasks.length}\n`
      }
      return result || '(无部门任务)'
    }

    it('无项目 → 无部门任务', () => {
      assert.equal(buildDeptTasksSimple(['writer'], []), '(无部门任务)')
    })

    it('过滤本部门 agent 的任务', () => {
      const projects = [{
        name: '小说项目',
        tasks: [
          { status: 'in_progress', assignedAgent: 'writer' },
          { status: 'pending', assignedAgent: 'outsider' },
        ],
      }]
      const result = buildDeptTasksSimple(['writer'], projects)
      assert.ok(result.includes('小说项目'))
      assert.ok(result.includes('进行中: 1'))
      assert.ok(!result.includes('待办'))  // outsider 的任务被过滤
    })

    it('统计多种状态', () => {
      const projects = [{
        name: 'P1',
        tasks: [
          { status: 'completed', assignedAgent: 'a' },
          { status: 'completed', assignedAgent: 'a' },
          { status: 'review', assignedAgent: 'a' },
          { status: 'pending', assignedAgent: 'a' },
        ],
      }]
      const result = buildDeptTasksSimple(['a'], projects)
      assert.ok(result.includes('待确认: 1'))
      assert.ok(result.includes('待办: 1'))
      assert.ok(result.includes('完成: 2/4'))
    })
  })

  describe('buildKpiStatus 逻辑', () => {
    function buildKpiStatus(kpiDefs) {
      if (!kpiDefs || Object.keys(kpiDefs).length === 0) return '(无 KPI 定义)'
      let result = ''
      for (const [metric, def] of Object.entries(kpiDefs)) {
        result += `- ${metric}: 目标 ${def.target} ${def.unit || ''}\n`
      }
      return result
    }

    it('无 KPI 定义', () => {
      assert.equal(buildKpiStatus(null), '(无 KPI 定义)')
      assert.equal(buildKpiStatus({}), '(无 KPI 定义)')
    })

    it('格式化 KPI 条目', () => {
      const kpis = {
        chapters_per_day: { target: 2, unit: '章/天' },
        quality_score: { target: 80, unit: '分' },
      }
      const result = buildKpiStatus(kpis)
      assert.ok(result.includes('chapters_per_day: 目标 2 章/天'))
      assert.ok(result.includes('quality_score: 目标 80 分'))
    })
  })
})
