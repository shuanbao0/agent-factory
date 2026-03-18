'use strict'
/**
 * Constants — Autopilot 常量与配置单元测试
 */
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const constants = require('../../../core/autopilot/constants.cjs')

describe('autopilot/constants', () => {
  it('导出 PROJECT_ROOT 指向项目根目录', () => {
    assert.ok(constants.PROJECT_ROOT)
    assert.ok(constants.PROJECT_ROOT.endsWith('agent-factory'))
  })

  it('路径常量都基于 PROJECT_ROOT', () => {
    assert.ok(constants.CONFIG_DIR.startsWith(constants.PROJECT_ROOT))
    assert.ok(constants.AGENTS_DIR.startsWith(constants.PROJECT_ROOT))
    assert.ok(constants.PROJECTS_DIR.startsWith(constants.PROJECT_ROOT))
    assert.ok(constants.SESSIONS_DIR.startsWith(constants.PROJECT_ROOT))
    assert.ok(constants.WORKSPACES_DIR.startsWith(constants.PROJECT_ROOT))
  })

  it('文件路径常量指向 config 目录', () => {
    assert.ok(constants.MISSION_FILE.includes('config'))
    assert.ok(constants.STATE_FILE.includes('config'))
    assert.ok(constants.BUDGET_FILE.includes('config'))
    assert.ok(constants.GATEWAY_CONFIG_FILE.includes('openclaw.json'))
  })

  it('超时和阈值为正数', () => {
    assert.ok(constants.DEFAULT_AGENT_TIMEOUT_MS > 0)
    assert.ok(constants.DEFAULT_INTERVAL_SEC > 0)
    assert.ok(constants.CEO_COORDINATION_INTERVAL_SEC > 0)
    assert.ok(constants.CEO_STRATEGY_INTERVAL_SEC > 0)
    assert.ok(constants.DEFAULT_DEPT_INTERVAL_SEC > 0)
  })

  it('限制常量为正整数', () => {
    assert.ok(Number.isInteger(constants.MAX_HISTORY_ENTRIES))
    assert.ok(constants.MAX_HISTORY_ENTRIES > 0)
    assert.ok(Number.isInteger(constants.MAX_CYCLE_RESULT_LENGTH))
    assert.ok(constants.MAX_CYCLE_RESULT_LENGTH > 0)
  })

  it('Token 管理阈值合理', () => {
    assert.ok(constants.COMPACT_TOKEN_RATIO > 0 && constants.COMPACT_TOKEN_RATIO < 1)
    assert.ok(constants.RESET_TOKEN_RATIO > constants.COMPACT_TOKEN_RATIO)
    assert.ok(constants.RESET_COMPACT_COUNT > 0)
    assert.ok(constants.DEFAULT_CONTEXT_TOKENS > 0)
  })

  it('会话健康阈值合理', () => {
    assert.ok(constants.SESSION_RESET_INPUT_TOKENS > constants.SESSION_FORCE_COMPACT_TOKENS)
    assert.ok(constants.HEALTH_CHECK_INTERVAL > 0)
  })

  it('任务自动转换阈值合理', () => {
    assert.ok(constants.IDLE_COMPLETE_MINS > 0)
    assert.ok(constants.STALE_TASK_MINS > constants.IDLE_COMPLETE_MINS)
  })

  it('双 Session 常量存在', () => {
    assert.equal(typeof constants.DUAL_SESSION_ENABLED, 'boolean')
    assert.ok(Array.isArray(constants.DUAL_SESSION_DEPTS))
    assert.ok(constants.STATUS_QUERY_TIMEOUT_MS > 0)
    assert.ok(constants.MAX_NO_RESPONSE_COUNT > 0)
  })

  describe('isDualSessionEnabled', () => {
    it('导出为函数', () => {
      assert.equal(typeof constants.isDualSessionEnabled, 'function')
    })

    it('默认启用时返回 true', () => {
      // DUAL_SESSION_ENABLED 默认为 true（AF_DUAL_SESSION !== '0'）
      const result = constants.isDualSessionEnabled('random-dept')
      assert.equal(result, true)
    })
  })
})
